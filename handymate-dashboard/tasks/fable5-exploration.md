# Fable 5 — Explorativ granskning (2026-06-10)

**Omfattning:** handymate-dashboard + handymate-mobile. Ingen kod ändrad.
**Metod:** Egen läsning av approval-exekvering, save-and-push, dedup, patterns och agent-kartan, plus sex parallella sökagenter (silent failures, attribution, cron-kontext, races, TEXT-FK, mobile). Alla topp-fynd är **verifierade av mig i källkoden** — fynd som enbart kommer från sökagenter är markerade med konfidens och bör radnummer-verifieras innan fix.
**Avgränsning:** Redan kända/fixade problem (Audit-3 Fix A, Audit-4 Fix DEF, TD-1–7, status-flip-ordningen, dedup-fönstren) rapporteras inte som nya fynd — men jag bygger vidare på dem där de samspelar med nya fynd.

---

## DEL 1 — BUGGJAKT

### De tre värsta

---

#### 🥇 B1. Auto-approve-vägen i tool-router är en ofixad spegelkopia av alla redan-fixade approval-buggar

**Fil:** `app/api/agent/trigger/tool-router.ts:1021-1094` (createApprovalRequest) + `:1138-1186` (executeApprovalPayloadInternal)
**Kategori:** A (silent failure) + C (cron/server-kontext) | **Konfidens: HÖG — själv verifierad rad för rad**

Docblocken säger det själv: *"Mirrors the switch in app/api/approvals/[id]/route.ts"*. Men spegeln frystes innan Audit-3/4-fixarna:

| Bugg | Rad | Samma bugg fixad i approval-routen |
|---|---|---|
| `fetch(/api/sms/send)` utan auth-header → 401 | 1147-1152 | Audit-3 Fix A (sendSmsViaElks direkt) |
| `fetch(/api/quotes/${id}/send)` — **endpointen existerar inte** → 404 | 1156-1161 | Audit-4 Fix DEF (korrekt: `/api/quotes/send` + body) |
| `fetch(/api/invoices/${id}/send)` — **existerar inte** → 404 | 1165-1170 | Audit-4 Fix DEF (korrekt: `/api/invoices/send`) |
| `fetch(/api/bookings)` utan auth → 401 | 1173-1178 | Audit-4 Fix DEF (cookie-forwarding) |
| Resultatet `{ok: res.ok}` granskas aldrig — `status='auto_approved'` skrivs **oavsett** | 1037-1054, 1067-1084 | classifyResponse + UI-feedback |

**Vad som händer:** När Matte (eller annan agent via tool-anrop) skapar en approval med `risk_level='low'` eller `'medium'` exekveras den direkt — utan människa i loopen — via den trasiga spegeln. Agenten svarar användaren *"Åtgärd utförd direkt"*, raden loggas som `auto_approved`, men SMS:et/offerten/fakturan/bokningen gick aldrig iväg.

**Värsta fall i prod:** Hantverkaren ber Matte "skicka påminnelsen till Andersson", Matte bedömer det som low-risk, svarar "klart!", hantverkaren litar på det — kunden hör aldrig något. Detta är värre än de 17 fixade fallen eftersom det inte ens finns en Godkänn-klick där UI:t kan visa fel: hela kedjan är autonom och ljuger i båda ändar (chat-svar + audit-rad).

**Riktning på fix:** Radera spegeln. Extrahera `executeApprovalPayload` ur approval-routen till `lib/approvals/execute.ts` och låt båda vägarna anropa samma funktion (princip 2: en sanning). Gate:a `auto_approved`-skrivningen på `execution.ok` (princip 1).

---

#### 🥈 B2. Mobil-godkännande tappar auth för alla icke-SMS-actions — och mobilen sväljer felet

**Filer:** `app/api/approvals/[id]/route.ts:146` + `:218-222` (forwardHeaders), `handymate-mobile/lib/api.ts:7-13` (getAuthHeaders) + `:214-222` (respondToApproval)
**Kategori:** A + C | **Konfidens: HÖG — själv verifierad i båda repona, end-to-end**

Audit-4 Fix DEF forwardar **bara cookien**: `const cookieHeader = request.headers.get('cookie')`. Men mobilen autentiserar med `Authorization: Bearer <supabase-token>` och skickar ingen cookie alls (`lib/auth.ts:52-65` accepterar båda — det är därför själva approven lyckas).

Kedjan vid mobil-approve av `send_quote`/`send_invoice`/`create_booking`/`create_quote_draft`/`create_ata_draft`/`review_auto_invoice`:
1. `getAuthenticatedBusiness` lyckas (Bearer) → status flippas till `approved`
2. `forwardHeaders()` får `cookieHeader=null` → intern fetch skickas **utan auth** → 401
3. `classifyResponse` fångar det korrekt (`ok:false, "Auth-fel"`) — men:
4. Mobilens `respondToApproval` kollar bara `res.ok` (HTTP 200 ✓) och **läser aldrig `execution`** → kastar inget, UI visar lyckat

**Värsta fall:** Hantverkaren står på bygget (mobilens hela poäng), godkänner Karins fakturautskick, ser grönt — fakturan skickas aldrig, status säger `approved`. Detta är exakt klassen av fel ni fixat 17 gånger, men nu på den yta pilotanvändaren faktiskt använder.

**Riktning på fix (två rader + en mobilcheck):**
- `forwardHeaders()` forwardar även `request.headers.get('authorization')`
- `respondToApproval` i mobilen läser `execution`-objektet och visar fel när `ok===false`/`sms_sent===false` (samma som PendingApprovalsBlock gör i dashboarden sedan Fix C)

---

#### 🥉 B3. Godkänn-knappen har ingen atomisk guard — dubbelklick = dubbla SMS/fakturor

**Fil:** `app/api/approvals/[id]/route.ts:36-72`
**Kategori:** D (race) | **Konfidens: HÖG — själv verifierad**

Routen läser approvalen (rad 36-41), kollar `status !== 'pending'` (47-49), och uppdaterar sedan (67-71) — men UPDATE:n saknar `.eq('status', 'pending')`. Två requests inom samma fönster läser båda `pending`, båda passerar checken, båda exekverar payloaden.

Statuskollen på rad 47 är en TOCTOU-check (time-of-check-to-time-of-use), inte ett skydd. UI-disable på knappen hjälper inte mot: dubbelklick före state-update, retry vid långsamt nät, eller approve från dashboard + mobil samtidigt.

**Värsta fall:** Kunden får två identiska betalningspåminnelser inom samma sekund — den sortens sak som får en pilotkund att stänga av agenterna helt. Med `review_auto_invoice` blir det dubbla fakturautskick.

**Riktning på fix:** `.eq('status','pending')` på UPDATE:n + kontrollera att `count===1` innan exekvering (annars 409). Samma mönster behövs i `app/api/checkin/approve/route.ts` (samma read-check-write utan guard → dubbla `time_entry` = dubbel fakturerad tid — agentverifierad, hög konfidens).

---

### Övriga fynd, rankade (sannolikhet × konsekvens)

| # | Fynd | Fil:rad | Vad händer | Värsta fall | Konfidens |
|---|---|---|---|---|---|
| 4 | **ÄTA via e-post markeras `sent` — ingen e-post skickas alls.** `// TODO: Implement email sending` följt av status-flip | `app/api/ata/[id]/send/route.ts:174-189` | Väljer man "e-post" sätts `status='sent'` + `ata_sent`-event fyras, men inget mail går iväg | ÄTA signeras aldrig → utfört tilläggsarbete förblir ofakturerat = direkta pengar. (SMS-vägen strax ovanför är korrekt gate:ad — kontrasten visar att detta är ett glömt hål, inte design) | **HÖG — själv verifierad** |
| 5 | **Resend-fel sväljs i invoices/send.** `resend.emails.send()` **kastar inte** vid API-fel — den returnerar `{error}` som aldrig läses; `results.email = true` sätts ovillkorligt efter await | `app/api/invoices/send/route.ts:147-179` | Ogiltig API-nyckel/domän/throttling → email "lyckas" → `status='sent'` (rad 218-222) | Faktura markerad skickad, kunden har inget mail. Om kunden saknar telefonnummer finns ingen fallback alls | HÖG (mönstret verifierat; samma mönster bör sökas på alla `resend.emails.send`-sites, t.ex. quotes/send) |
| 6 | **Kampanjer: partiell leverans rapporteras som 100 %.** Loop skickar SMS per mottagare; `status='sent'` sätts oavsett `failed_count` | `app/api/campaigns/send/route.ts:153-162`, `app/api/cron/send-campaigns/route.ts:104-162` | Rate-limit/ogiltiga nummer halvvägs → kampanj "skickad" | Hantverkaren tror 100 kunder nåddes, 40 fick inget; ingen retry-väg eftersom statusen är terminal | MEDEL-HÖG (agentverifierad, ej själv läst) |
| 7 | **send-reminders: `reminder_count++` även när leveransen är osäker**, och dedup-fallback skickar hellre än avstår vid DB-fel | `app/api/cron/send-reminders/route.ts:327-478` | 46elks 200 OK ≠ levererat; count ökas → nästa cron hoppar över kunden | Kund som aldrig fick påminnelse 1 får heller aldrig påminnelse 2 — fakturan jagar ingen | MEDEL (agentverifierad; 46elks-accept vs leverans är en gråzon — delivery-callbacks borde slå tillbaka) |
| 8 | **sms_campaign-race:** `status='sending'`-flippen saknar `.eq('status','scheduled')`-guard → cron-överlapp/dubbel-trigger kan skicka kampanjen två gånger | `app/api/campaigns/send/route.ts:105-108` | Två körningar passerar båda statuskollen | Alla mottagare får dubbla kampanj-SMS + dubbel SMS-kostnad | MEDEL |
| 9 | **Inbound-dedup saknas på webhooks:** 46elks incoming-SMS och email-inbound har ingen idempotensnyckel → retry = dubbel lead/dubbel agent-körning, och `activatePendingLead` har ingen guard mot dubbel deal | `app/api/sms/incoming/route.ts:97-105`, `app/api/email/inbound/route.ts:140`, `lib/leads/golden-path.ts:255-295` | Webhook-retry vid timeout processas som nytt meddelande | Två deals för samma förfrågan; två Matte-körningar kan ge två kund-SMS | MEDEL (retry-frekvensen hos 46elks/mailleverantör okänd — mät innan fix prioriteras) |
| 10 | **save-and-push: approval-INSERT:ens fel kontrolleras aldrig** — `void sendApprovalPush(...)` skickas och `approvals_created++` räknas även om insert failade | `lib/agents/shared/save-and-push.ts:215-245` | Push pekar på approval som inte finns; counters ljuger i agent_runs | Hantverkaren klickar på notisen → tomt; lågfrekvent men urholkar "notis = något att göra" | HÖG — själv verifierad |
| 11 | **dedup_key saknar UNIQUE constraint** — `findRecentDuplicate` är check-then-insert (TOCTOU); två samtidiga körningar för samma business kan spara dubbla observationer | `lib/agents/shared/dedup.ts:90-117` + sql/ | Cron-överlapp eller manuell test-trigger parallellt med schemalagd | Dubbla approvals för samma fenomen — irriterande, inte farligt | MEDEL |
| 12 | **Cron-internfetchar med inkonsekventa secrets/headers** (`x-internal-secret` vs `x-cron-secret` vs Bearer) + `.catch(()=>{})` på push-anrop i generate-insights | `app/api/cron/generate-insights/route.ts:145-157` m.fl. | Headerbyte i ena änden bryter tyst andra änden | Insight-pushar försvinner utan spår | MEDEL (agentfynd, ej själv verifierad — standardisera oavsett) |
| 13 | **Default-fallbacken i executeApprovalPayload skickar SMS för okända approval_types** så fort payloaden råkar innehålla telefon + text | `app/api/approvals/[id]/route.ts:1002-1017` | En framtida info-only-typ med `customer_phone`+`suggested_sms` i payloaden auto-SMS:ar vid godkänn | Kund får SMS som hantverkaren aldrig såg som SMS-action i UI:t | HÖG på mekanismen, LÅG på sannolikheten idag — men det är en fälla som väntar |

**Friskrivning per princip 3:** Radnummer från sökagenter (fynd 6-9, 12) kan ha driftat ±10 rader; verifiera mot fil innan fix-PR. Fynd 1-5, 10, 13 har jag läst själv.

---

### B. Attribution-läckor (lärande-systemet)

**Konfidens: HÖG på mönstret (2 stickprov själv verifierade: `lib/customer-ltv.ts:117-133`, save-and-push korrekt), MEDEL på exakta listan (agentkartlagd).**

`extractAgentId` (en-sanning-helpern) returnerar null när payload saknar `agent_id`/`routed_agent` → raden exkluderas ur approve_rate. Det är **epistemiskt korrekt** (hellre "vet inte" än fel siffra) men betyder att **nästan alla äldre agent-flöden är osynliga för lärandet**. Endast save-and-push-vägen (Karin/Daniel/Lisa/Lars/Hanna-observations) attribuerar idag.

Läckande insert-ställen där agentens "ansikte" visas i UI men lärandet inte ser det:

| Flöde (approval_type) | Fil | Borde attribueras till |
|---|---|---|
| customer_reactivation | lib/customer-ltv.ts:117 | Hanna |
| warranty_followup | lib/warranty-followup.ts:101 | Hanna |
| seasonal_campaign | lib/seasonality/campaign-generator.ts:75 + cron/seasonality:80 | Hanna |
| proactive_care | lib/proactive-care.ts | Hanna |
| profitability_warning | lib/profitability.ts:200 | Karin |
| price_adjustment_suggestion | lib/agent/price-analysis.ts:179 | Karin |
| auto_invoice_draft_approval | lib/projects/auto-invoice-on-complete.ts:224 | Karin |
| review_auto_invoice / create_invoice_from_report | app/api/field-reports/[id]/sign:81 | Karin |
| quote_nudge | lib/autopilot/quote-nudge.ts:75 | Daniel |
| lead_review | app/api/email/inbound/route.ts:140 | Daniel |
| dispatch_suggestion | lib/dispatch.ts:180 | Lars |
| job_report | lib/job-report.ts:137 | Lars |
| autopilot_package | lib/autopilot/trigger.ts:196 | Lars |
| Matte-skapade approvals (chat + action-executor + tool-router) | lib/matte/action-executor.ts:130, app/api/matte/chat:335, tool-router:1043/1073/1097 | matte (eller routed agent) |
| monthly_review | app/api/cron/monthly-review/route.ts:70 | matte |

Korrekt o-attribuerade (systemflöden, null är rätt): four_eyes_quote, low_stock_alert, time_attestation, automation-engine-regler.

**Konsekvens:** När Fas 1b ska koppla approve_rate till trösklar kommer t.ex. Hannas verkliga approve_rate att beräknas på en bråkdel av hennes faktiska output — `sample_size` ser lågt ut, confidence fastnar på preliminary, och lärandet startar månader senare än det borde. **Varje dag utan fix är förlorad träningsdata som inte går att backfilla** (payloaden är frusen vid insert).
**Fix-riktning:** En rad per insert-ställe (`agent_id: 'hanna'` i payload). Billigaste högvärdes-fixen i hela rapporten. Överväg också en DB-backfill för historiska rader via approval_type→agent-mappning.

---

### C. Cron-kontext — status

Den stora cron-kontext-bomben är B1 (tool-router). Utöver den och fynd 12: inga nya bekräftade fall av cookie-beroende kod i cron-kedjor — observation-pipelinen använder genomgående `getServerSupabase()` (service role) och `sendSmsViaElks` direkt, vilket är rätt mönster. `quote-follow-up`-cronen ignorerar dock `triggerAgentInternal`-fel och räknar `agentTriggered++` oavsett utfall (MEDEL konfidens, agentfynd).

---

### E. TEXT-FK-skuldens fulla omfattning

Agentkartlagd mot sql/-migrationerna (MEDEL-HÖG konfidens; kolumnlistan bör köras mot information_schema i Supabase innan migration skrivs — agenten kan ha missat sent tillagda REFERENCES).

**Storleksordning: ~45 _id-kolumner utan FK, varav ~10 redan kända (TD-1–7).** Mest skadliga nyupptäckta:

1. **`work_orders.assigned_to` lagrar personens NAMN som TEXT** (+ `assigned_phone` separat). Inte ens ett ID. Stavfel eller namnbyte → arbetsordern når fel/ingen person. Dubblettkolumner `booking.assigned_to` + `booking.assigned_user_id` tyder på halvfärdig migrering av samma mönster.
2. **Blandade identitetstyper i samma kolumn:** `deal.assigned_to`/`task.assigned_to` innehåller ibland auth-UUID, ibland business_users.id. Detta är värre än saknad FK — en FK går inte ens att lägga på utan datatvätt, och varje join-försök ger tysta 0-träffar för halva datat (= "tomma sidor utan fel"-fallgropen i CLAUDE.md).
3. **Polymorfa referenser utan diskriminator-disciplin:** `sms_log.related_id`, `inbox_item.related_id`, `automation_queue.target_id` pekar på "någon av 5 tabeller". Kan aldrig få FK; gör GDPR-radering och orphan-städning manuell för alltid.
4. `invoice.original_invoice_id` (kreditfakturor), `project.quote_id`, `time_entry.approved_by/business_user_id` — samma mönster, lägre frekvens.

**Rekommendation:** Gör inte 45 FK:er på en gång. Tre etapper: (1) datatvätt + FK på person-kolumnerna (assigned_to-familjen) eftersom de orsakar fel-person-dispatch idag, (2) FK på pengar-kedjan (invoice↔project↔quote↔time_entry) eftersom den blockerar ekonomi-aggregat, (3) acceptera polymorferna men inför konvention `related_type`-kolumn bredvid varje `related_id`.

---

## DEL 2 — KREATIV FÖRBÄTTRING AV AGENTLOOPARNA

Grundad i arkitektur-genomgången: pipelinen är cron → aggregate → thinking-call → normalize → dedup → save-and-push → approval → learning_event. Det slående är hur mycket **redan byggd men oansluten infrastruktur** som finns: `agent_memories` med komplett extract/retrieve/buildMemoryPrompt-pipeline som **aldrig anropas från observation-prompterna**, `learning_events` som skrivs vid varje approve/reject men **aldrig läses**, `business_patterns` som beräknas varje natt men **ingen agent och inget UI konsumerar**, `agent_messages`-infra utan prompt-integration. Förslag 1-3 är därför "koppla in det som finns" snarare än nybygge.

Rankade efter värde/bygg-storlek:

---

### F1. Koppla in minnet: `buildMemoryPrompt()` i observation-prompterna — **S (dagar)**

**Löser:** Agenterna är amnesipatienter. Karin återupptäcker varje onsdag att "BRF Lindgården betalar sent" — dedup hindrar henne från att säga det igen, men inget hjälper henne *bygga vidare* på det.
**Hur:** `lib/agents/memory.ts` har redan `extractAndSaveMemory` (post-run) och `getRelevantMemories`+`buildMemoryPrompt` (pre-run). Anropa dem i den delade cron-runnern: före thinking-call, injicera "Vad du redan vet om detta företag" (top-5 på importance); efter körning, extrahera. Allt finns — det saknas ~10 rader i en delad fil.
**Principerna:** Stärker epistemisk hygien om minnen taggas med datum + ursprung ("observerat 2026-05-12, 3 datapunkter") så agenten kan väga dem. Risk: gamla minnen som blivit fel (kunden betalade) — ge minnen TTL/decay via befintliga `last_accessed_at`.

### F2. Attribution-fixen + lärande-loop v1: reject-skäl tillbaka in i prompten — **S-M (dagar–en vecka)**

**Löser:** `learning_events` skrivs vid varje approve/reject/edit (inkl. `reject_reason` och `human_override` med exakta redigeringar) men läses aldrig. Systemet samlar facit och tittar aldrig i det.
**Hur:** Nattligt steg i pattern-cronen: per agent, summera senaste 30d events. **Epistemisk gate: N≥5 events, annars inget.** Injicera max 3 rader i agentens prompt: *"Av dina senaste 8 SMS-förslag avvisades 3 med skäl 'för säljig ton'. Christoffers redigeringar kortar dina texter med i snitt 40 %."* Edit-diffar är guld — de visar inte bara *att* förslaget var fel utan *hur*.
**Förutsättning:** Del 1-B-fixen (attribution) först — annars lär sig agenterna bara av observation-flödet, inte av quote_nudge/proactive_care/seasonal_campaign-utfallen.
**Principerna:** Detta ÄR princip 3 i praktiken: systemet säger "jag har för få datapunkter" tills det inte har det. Bygger direkt mot Fas 2 i roadmapen utan att vänta på vintern.

### F3. Kund-centrerad kontaktbudget — dedup:en är per agent, kunden är en — **M (≈1 vecka)**

**Löser (delvis en latent bugg):** All spam-skydd är agent-centrerat: dedup-key per agent, rate-limit 3/agent/dag. Men kunden Andersson kan samma dag få Karins betalningspåminnelse + Daniels offert-nudge + Hannas säsongskampanj = 3 SMS från samma företag. 9 approvals/dag-taket skyddar hantverkaren från spam — ingen skyddar kunden.
**Hur:** En delad helper (princip 2!) `checkContactBudget(businessId, customerPhone)` mot `sms_log`: max 1 agent-initierat SMS per kund per 72h, med prioritetsordning vid konflikt (förfallen faktura > offert-nudge > kampanj). Konsumeras av save-and-push OCH kampanj-utskick OCH autopilot. Blockerad observation sparas ändå som insight med notis "väntar — Andersson kontaktades igår av Karin".
**Principerna:** Stärker förtroende-sidan av princip 1 (kundens upplevelse är produktens yta). Ger dessutom cross-agent-medvetenhet *implicit* — billigare än full kontextdelning.

### F4. Cross-agent-kontext: delad "dagsläges-rad" istället för delade hjärnor — **M (1-2 veckor)**

**Löser:** Karin vet inte att Daniel ser en stale 80 000-kr-offert på samma kund som har en förfallen faktura — de två signalerna tillsammans ("kunden tvekar OCH betalar inte") är en annan story än var för sig.
**Hur — medvetet minimalistiskt för att inte bli rörigt:** Inte fri tillgång till varandras observationer (prompt-bloat, ekokammare). Istället: varje agent-körning skriver 1 rad strukturerad headline till en `daily_agent_briefing` (agent, kund/objekt-ID, typ, en mening). Nästa agent i cron-sekvensen (de kör redan 06:00→06:05→06:10...) får kollegornas rader för **samma kunder som finns i dess eget aggregate** — max 5 rader, alltid attribuerade ("Daniel såg: ..."). Cron-ordningen blir en feature: Karin (ekonomi) kör först och sätter dagens ekonomiska ram, Lisa (kundsvar) kör sist och vet allt.
**Principerna:** Risk mot princip 3: Karin kan börja "tycka" om offerter på Daniels data. Mitigering: briefing-rader är märkta som kollegans bedömning och får i prompten bara användas för att *prioritera och korsreferera*, inte som egen evidens. Risk för dubbel-kontakt täcks av F3.

### F5. Wow dag 1: "Genomlysningen" — förväntan istället för falsk insikt — **M (1-2 veckor)**

**Löser:** Nya kunder = tom data = `invoiceCount < 5` → agenterna tysta i veckor. Tystnad läses som "AI:n gör inget" → churn innan värdet hinner bevisas.
**Hur, utan att bryta epistemisk hygien — tre ärliga drag:**
1. **Engångskörning vid onboarding** på det som FAKTISKT finns: knowledge_base, bransch, prislista, första samtalen. Output är inte insikter utan **kontrakt**: "Karin här. Jag bevakar dina fakturor — vid din 5:e börjar jag se betalningsmönster. Just nu väntar jag på data." En räknare per agent ("3 av 5 fakturor") gör väntan synlig och gamifierad istället för tyst. Detta är MarginalCard-hierarkin ("bekräftat/tolkat/lär mig") applicerad på agenterna själva.
2. **Branschmärkta riktvärden, aldrig förklädda till kundens egna:** "Hantverkssnittet är ~30 % offert-konvertering. Jag vet inte din än — om 5 offerter vet jag." Tydligt avsändarmärkt = ärligt.
3. **Lisa har ingen early-stage-tröskel** (hon behöver bara ett inkommande SMS) — gör henne till dag-1-hjälten i onboardingen: första missade kundsvaret hon fångar är produktens första wow, ofta vecka 1.
**Principerna:** Hela poängen är att rama tomheten som löfte istället för att fylla den med påhitt — princip 3 blir en feature, inte en begränsning. Knyter direkt an till Fas 2.5 (Matte-onboarding) i roadmapen.

### F6. Självjusterande trösklar — pattern-läsning med trippelgrind — **M-L (2-3 veckor, efter F2 + pilot-data)**

**Löser:** `daysOverdue>=7`, `view_count>=3` är gissningar frusna i kod. business_patterns beräknas varje natt men ingen läser dem.
**Hur, med epistemisk hygien som hård arkitektur, inte god intention:**
- **Grind 1 (sample):** tröskel justeras ENDAST när patternets `confidence >= 'medium'` && `!is_stale` (≥15-25 samples enligt befintliga PATTERN_THRESHOLDS). 3 datapunkter rör ingenting.
- **Grind 2 (clamp):** varje tröskel har kodade min/max (`daysOverdue ∈ [3,14]`, `view_count ∈ [2,5]`). Lärandet får nudga, aldrig rusa. En skev månad kan max flytta beteendet ett steg.
- **Grind 3 (transparens):** varje körning loggar i agent_runs vilken tröskel som användes och varför ("daysOverdue=5: ert betalningsmönster, 23 fakturor, medium confidence"). Visas i Lärdomar-vyn — hantverkaren SER att systemet anpassat sig (roadmapens designprincip 3).
- Implementation: en delad `getEffectiveThreshold(businessId, key, default)`-helper (princip 2) som faller tillbaka på hårdkodade defaults vid null/stale — exakt samma fallback-filosofi som sample-thresholds redan har.
**Principerna:** Designad runt princip 3. Största risken är tyst feedback-loop (lägre tröskel → fler approvals → mer data åt ena hållet) — därför clamps + att approve_rate (mänskligt facit) är inputen, inte agentens egen output-volym.

### F7. Observations-värdighet: "varför nu + vad kostar det att ignorera" som schema-krav — **S-M**

**Löser:** Observationer ignoreras och expirerar oack:ade. Brus och signal ser likadana ut i UI:t.
**Hur:** Tre fält till i observation-schemat (normalize.ts validerar redan struktur): `why_now` (vad ändrades som gör detta aktuellt *idag*), `cost_of_ignoring` (kr eller risk, får vara "okänt"), `next_step` (en konkret handling). Observation utan godkänt `why_now` nedgraderas till insight utan push. UI sorterar på cost_of_ignoring. Mät sedan dismiss-rate per knowledge_type i learning_events (F2-infra) och **strypa typer med >70 % dismiss automatiskt** — systemet lär sig vad som är brus genom att titta på vad hantverkaren behandlar som brus.
**Principerna:** `cost_of_ignoring: "okänt"` är tillåtet och ärligt (princip 3) — men tvingar agenten att skilja "intressant" från "agerbart", vilket är exakt skillnaden mellan signal och brus.

---

## OM DETTA VAR MITT FÖRETAG — TRE PRIORITERINGAR

**1. Exekverings-förtroendekedjan, som ETT paket (B1 + B2 + B3 + fynd 4-5, ~1 vecka).**
Produktlöftet är "AI:n agerar, du godkänner". Varje gång ett godkännande inte blir verklighet — auto-approve som 404:ar, mobil-approve som 401:ar, e-post som aldrig fanns — bränns det enda kapital en pilot har: tron att grönt betyder gjort. Ni har fixat 17 sådana; de här återstående sitter på de farligaste ytorna (autonom väg utan mänsklig grind, mobilen som är pilotens primära yta). Gör det som ett paket med en gemensam princip: **extrahera EN exekveringsfunktion (lib/approvals/execute.ts), gate:a varje status på faktisk success, och låt varje yta (web/mobil/auto) visa execution-resultatet.** Då kan klassen av buggar inte återuppstå — istället för att jaga instans 18, 19, 20.

**2. Attribution-backfill nu, före datan (Del 1-B, ~1 dag).**
Detta är den billigaste fixen i rapporten och den enda som är **tidskritisk på riktigt**: roadmapens hela moat ("AI som lär känna företaget, omöjlig att lämna efter 6 månader") står på approve_rate-data, och varje o-attribuerad approval under piloten är träningsdata som försvinner för alltid — payloaden fryses vid insert. En rad kod × 20 ställen idag, eller månader av försenat lärande i vinter. Asymmetrin är löjlig.

**3. F3 + F5: skydda kundens inbox, fyll dag-1-tystnaden (~2-3 veckor).**
Buggar avgör om piloten överlever; de här två avgör om den *säljer*. Kontaktbudgeten (F3) skyddar det enda varumärke som syns utåt — hantverkarens eget, i kundens SMS-inbox; tre agent-SMS samma dag till samma kund är värre än vilken intern bugg som helst. Genomlysningen (F5) attackerar churn-fönstret vecka 1-3 där agenterna idag är epistemiskt korrekt men kommersiellt dödligt tysta — och den gör det genom att göra er ärlighet ("jag vet inte än, men vid faktura 5 vet jag") till själva showen. Det är samma drag som gjorde MarginalCard bra: osäkerheten visas, inte gömd. Ingen konkurrent vågar marknadsföra vad deras AI *inte* vet — det är er differentiator, paketera den.

---

*Granskning utförd 2026-06-10 av Fable 5. Fynd märkta "själv verifierad" är lästa i källkod denna session; övriga är subagent-kartlagda med angiven konfidens och bör radverifieras innan fix. Inga kodändringar gjorda.*
