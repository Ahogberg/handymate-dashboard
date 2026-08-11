# Meeting Intelligence — arkitekturaudit och rekommendation

**Datum:** 2026-08-11
**Metod:** Tre parallella repo-audits (capture-flödet, kalender/entitetsupplösning,
agentorkestrering/action-lagret) mot faktisk kod + rådsbindande dokument. Prod-databasen
kunde inte frågas under auditen (MCP nere) — punkter markerade VERIFIERA MOT PROD.
**Regel:** Koden är sanningen. Allt nedan är filciterat.

---

## 1. Executive Verdict

**Mötesintelligens är inte en ny produkt för Handymate — det är sista milen på en
kedja som redan finns till 70 %.** Mötesassistenten (platsbesöksinspelning →
Whisper → mötesmedveten Haiku-analys med ÄTA-vinkel) skeppades 2026-08-09 och är i
prod. Approval-rälsen (`pending_approvals` + action-kontraktet + Jarvis-kortröst) är
kodbasens starkaste primitiv. `MatteDecision` är redan det MeetingOutcome-schema
master-prompten efterfrågar.

Det som saknas är **kopplingen och routingen**: mötestranskripten är föräldralösa
(ingen kund/bokning), kalenderimporten kastar bort alla fält som kunde identifiera
kunden (och är dessutom sannolikt helt trasig i prod), och mötesanalysens utfall
landar i fel kö (legacy-`ai_suggestion` i stället för approval-rälsen).

**Rekommendation i en mening:** Bygg ingen mötesbot nu — koppla det som finns:
bokning/kalender → kontext → befintlig inspelning → strukturerat utfall →
approval-kort. Digital capture är fas 3+, och då köpt, inte byggd.

Explicita svar (§55 i uppdraget):

| Fråga | Svar |
|---|---|
| A. Är dagens mötesassistent en stark grund? | **PARTIALLY** — semantiken rätt, pipelinen klarar inte långa möten, kopplingslagret saknas |
| B. Auto-joinande mötesassistent? | **YES, BUT LATER** (fas 4) — och då via leverantör, aldrig egen browser-automation |
| C. Capture-strategi? | **HYBRID, physical-first** — enhet nu, telefon finns, native API:er sen, bot sist |
| D. Ska Matte äga Meeting Intelligence? | **YES** |
| E. Ny mötespersona? | **NO** — "Handymate Mötesassistent" är ett funktionsnamn |
| F. Minsta värdefulla V1? | Kontext + utfall på approval-rälsen med BEFINTLIG 10-min-capture (se §18) |
| G. Starkaste vallgraven? | Samtal → operativ sanning → säker handling, kopplat till riktiga offerter/projekt/bokningar (se §22) |
| H. Vad byggs först? | Epic 0 (P0-fixar) → Epic 1 (möteskontext) → Epic 2 (utfall på approval-rälsen) |

---

## 2. Current Meeting Assistant

Skeppad 2026-08-09 ("etapp 3", `sql/v102_motesassistenten.sql` körd,
`docs/council/ACTIVE_ROADMAP.md:69`). Webb-dashboarden enbart — inget i mobilappen.

| Del | Fil |
|---|---|
| UI (Inkorgen → Möte-tab) | `components/moten/Motesassistenten.tsx` |
| Inspelningshook | `hooks/useAudioRecording.ts` (MediaRecorder, `audio/webm`, iOS-fallback `audio/mp4`) |
| Ingest + Whisper | `app/api/voice/site-visit/route.ts` |
| Analys | `app/api/voice/analyze/route.ts` (`arMote = source === 'site_visit'`) |
| Typgräns | `lib/voice/analysis-scope.ts` |
| Facit | `tests/motesassistenten.spec.ts` |

**Exakt flöde:** användaren startar manuellt → 10 min hårt tak (`MAX_SEKUNDER`,
enforce:at i hook + server med +5 s slack) → hela ljudet i flikminne → en
`multipart`-POST → Whisper (`whisper-1`, `sv`) synkront i requesten → rad i
`call_recording` med `source='site_visit'`, `recording_url=null` (**ljudet sparas
aldrig, någonstans** — testet asserterar att routen varken innehåller `storage`
eller `upload`) → fire-and-forget till `/api/voice/analyze` → Haiku
(`claude-haiku-4-5-20251001`, `max_tokens: 2000`) → `ai_suggestion`-rader.

**Mötesvinkeln** (promptgrenen): jobb/pris → `quote`; tillägg till pågående jobb →
`quote` med "ÄTA" i titeln; `callback` FÖRBJUDET ("hantverkaren pratade nyss med
kunden ansikte mot ansikte"). `filtreraAnalysforslag()` hårdsläpper allt utanför
`['quote','follow_up','callback','reminder','reschedule']`; confidence < 0.4 skippas.

**Lisa exkluderas medvetet** (`site-visit/route.ts:24-28`, testat i
`motesassistenten.spec.ts:90-96`): "ett platsbesök är hantverkarens eget samtal".
Detta arkitekturbeslut är rätt och behålls.

**Samtycke:** permanent bärnstensfärgad banner före startknappen ("Säg till kunden
att mötet spelas in… Ljudet sparas inte — bara texten"), källordning testad. Ingen
samtyckesartefakt registreras (ingen checkbox, ingen tidsstämpel) — se §15.

**Klassning: PARTIALLY REUSABLE.**
Behålls: analysgränsen, samtyckes-/transcript-only-hållningen, `decision-record`-
stämpeln (modell + promptversion + transkript-hash), COGS-mätarschemat,
iOS-fallbacken. Rework krävs för: capture >10 min, synkron processering,
kundkoppling (se §8, §18).

---

## 3. Calendar & Meeting Context

**Detta är den svagaste länken — och där V1-värdet ligger.**

- **Google-only.** `calendar_connection` (`sql/google_calendar.sql`) har
  `provider DEFAULT 'google'`; noll Microsoft Graph/Outlook/CalDAV-kod i repot.
- **Fältmassakern:** `getCalendarEvents()` i `lib/google-calendar.ts:113-165` mappar
  ENDAST `{id, summary, description, start, end, allDay}`. **Attendees, location,
  organizer, conferenceData/hangoutLink kastas vid API-gränsen.** Repo-grep på
  `attendees|conferenceData|hangoutLink` = noll träffar utanför node_modules.
- **Två divergerande syncvägar:** cron + manuell sync skriver `schedule_entry`;
  realtidswebhooken uppdaterar bara redan-länkade `booking`-rader. Ingen
  rekonciliering utom `lib/schedule/person-day.ts`.
- **`schedule_entry` saknar `customer_id`** — externa kalenderhändelser KAN inte
  kundattribueras med dagens schema.
- **Bokningar:** customer-kopplingen är god (~95 % för Handymate-skapade — publika
  bokningssidan går via golden path, agentverktygen kräver customer_id). MEN: ingen
  `deal_id`, ingen `address`-kolumn (`POST /api/bookings` tar emot adress och
  slänger den — `lib/dispatch.ts` regexar `notes` för att återfinna den).
- **Ingen mötes-URL-medvetenhet:** grep på `zoom.us|meet.google|teams.microsoft` =
  noll. (Meet-länkar ligger sannolikt redan oparsade i `schedule_entry.description`.)

**Entitetsupplösningen som FINNS är stark:** `lib/matte/resolver.ts` —
telefon/email → `{customer, lead, activeProjects, activeDeals, recentInvoices,
conversationHistory}`. Produktionskvalitet. Kalenderns attendee-emails är exakt den
indata den behöver och aldrig får.

**Kan Handymate idag svara "det här kalenderevenemanget är nog ett kundmöte om
deal/projekt X"?** För Handymate-skapade bokningar: kund ja (~95 %), projekt delvis
(~20-30 %), deal nej (0 % direkt). För externt skapade kalenderhändelser: **~0 %**.
Blandad realistisk bild för målgruppen: under 20 % av kundmötena i
Meeting Intelligence-mening.

---

## 4. Technical Capture Options

**Option A — Native plattforms-API:er (Teams/Meet/Zoom):**
Teams: Graph-transkript kräver tenant-admin-samtycke, application access policies
och rätt licenser — hög friktion; målgruppen (5–20-personers hantverksfirmor) har
sällan Teams-admin. Meet: transcript/recording via Meet REST kräver Workspace-
utgåvor med funktionen påslagen; konsumentkonton (vanligast i målgruppen) saknar
den. Zoom: cloud recording/transcript kräver betald plan. **Slutsats: tekniskt
sunt, kommersiellt smalt i detta segment. Fas 3, opportunistiskt (bara för kunder
som redan har kapabiliteten).**

**Option B — egen mötesbot:** Browser-automation (headless Chrome i mötet) är
sköra: lobby-beteenden, CAPTCHA/auth, ljudrouting, ständiga UI-ändringar hos tre
plattformar, hosting-kostnad. **Rekommenderas INTE att bygga själv.** Om/när bot
behövs: köp infrastrukturen (Recall.ai-klassens bot-API med EU-datahosting, eller
motsvarande europeisk leverantör) — de underhåller plattformsskörheten åt oss.
**Fas 4, bakom bevisad efterfrågan.**

**Option C — hybrid:** enhetsinspelning för fysiska möten (finns) + telefon via
46elks (finns) + native API:er där kunden har dem (fas 3) + köpt bot sist (fas 4),
allt konvergerande i SAMMA nedströmslager. **Detta är rekommendationen.**

Segmentverkligheten är avgörande: svenska hantverkares kundmöten är övervägande
FYSISKA platsbesök. Digitala möten är få (leverantörer, större beställare).
Att börja i digital capture vore att bygga för fel möte.

---

## 5. Build vs Buy

| Alternativ | Effort | Kostnad | Kontroll | EU-data | Time to market | Verdikt |
|---|---|---|---|---|---|---|
| Egen bot-infrastruktur | Mycket hög | Hosting + evigt underhåll | Full | Ja | Kvartal | **Nej** — skörhet vi inte äger kärnkompetens i |
| Bot-leverantör (Recall.ai-klass) | Låg | ~per mötestimme | API-nivå | Väljbar region — verifiera DPA | Veckor | **Ja, när fas 4 motiveras** |
| Native API:er | Medel | Låg | Plattformsberoende | Kundens tenant | Månader | **Ja, fas 3, opportunistiskt** |

Vendor lock-in-risken med leverantör är acceptabel eftersom hela nedströmslagret
(transkript → utfall → approval) är vårt och leverantören bara levererar
ljud/transkript — adaptern är tunn per definition.

---

## 6. Recommended Target Architecture

```
Bokning / Kalenderhändelse (Google)
        ↓
Meeting Resolver  (customer_id/booking_id explicit; attendee-email →
        ↓          lib/matte/resolver.ts för externa event)
Capture Adapter
├── Fysiskt möte: enhetsinspelning (Mötesassistenten — FINNS)
├── Telefon: 46elks-kedjan (FINNS)
├── [Fas 3] Native transcript-API (Meet/Graph/Zoom)
└── [Fas 4] Köpt mötesbot ("Handymate Mötesassistent" som synlig deltagare)
        ↓
Transcript Pipeline  (Whisper; V2: chunkad async för >10 min)
        ↓
Meeting Understanding  (mötesmedveten analys + affärskontext, §17)
        ↓
MeetingOutcome  (= MatteDecision + sourceRecordingId + evidens/konfidens)
        ↓
Matte (orkestrering) → specialister (Daniel ÄTA/offert, Lars bokning, Karin ekonomi)
        ↓
BEFINTLIG approval-räls  (pending_approvals + action-contract + card-voice)
        ↓
Affärsposter  (quote, project_change, booking, task, notering)
```

Inget nytt actionsystem. Ingen ny agentplattform. Ett nytt schema-tillägg
(koppling), en omriktad analys-utgång, en handfull nya approval_types.

---

## 7. Physical vs Digital Meeting Strategy

Hålls konceptuellt åtskilda i capture, konvergerar i allt nedströms:

- **Fysiskt/platsbesök:** enhetsinspelning, manuell start, samtyckesbanner,
  Lisa exkluderad. (Nuläget, förbättrat med kontext i V1.)
- **Digitalt:** fas 3/4. Botten uppträder som synlig deltagare
  "Handymate Mötesassistent"; per-möte på/av; inbjudningsnotis.
- **Telefon:** redan täckt (46elks → consent-TTS → transkript → Lisa + analys).

Båda matar SAMMA MeetingOutcome-lager — affärsförståelsen dupliceras aldrig.

---

## 8. Transcript & Async Processing

Dagens kedja är helsynkron och har **inget durable async-mönster att stå på**:
repots enda "async" är oawaited `fetch` med `.catch(console.error)` (ingen retry,
ingen persistens, ingen dead-letter). Krav för långa möten (V2, byggs inte i V1):

1. Chunkad/komprimerad uppladdning till Storage-bucket (25 MB Whisper-tak;
   90 min ≈ 45–90 MB).
2. Jobbtabell (`meeting_job`: status scheduled/capturing/processing/ready/
   partial_failure/failed — §39:s livscykel) + cron-driven worker med retry och
   idempotens per chunk.
3. Whisper `verbose_json` för segment + tidsstämplar (idag `json` — inga
   tidsstämplar fångas alls).
4. Map-reduce-analys över segment i stället för hela transkriptet i en
   Haiku-prompt med `max_tokens: 2000`.
5. Klientsidan: pause/resume + recovery ("Inspelningen finns kvar tills du lämnar
   sidan" är dagens hela garantin — 90 min i flikminne på en mobil överlever inte).

**P0 redan vid 10 min:** `site-visit`-routen saknar `export const maxDuration` och
kör på plattformsdefault — Whisper på 10-minutersljud överlever sannolikt inte.

---

## 9. Speaker Attribution

Whisper diariserar inte. V1: **ingen talarattribution** — och därför får inga
extraherade åtaganden tillskrivas en part med låg konfidens; korten formuleras
neutralt ("I mötet nämndes…") när talaren är okänd. V2+: segmentnivåheuristik
(hantverkaren är inspelande part; fraser i första person om utförande ≈
hantverkaren) MED konfidensfält, eller diariseringsmodell när async-pipelinen
finns. Botfasen ger talare gratis (plattformarnas transkript är talarmärkta).
**Princip: hellre otillskrivet än feltillskrivet** — ett "du lovade X"-kort som
egentligen var kundens ord förstör förtroendet.

---

## 10. Meeting Outcome Model

**Uppfinn inget: `MatteDecision` (`lib/matte/intent-agent.ts:24-37`) är schemat.**

```ts
interface MatteDecision {          // = MeetingOutcome med två tillägg
  intent: string
  confidence: number
  suggestedAgent: 'matte'|'karin'|'daniel'|'lars'|'hanna'|'lisa'
  projectId?: string; dealId?: string; invoiceId?: string
  actions: MatteAction[]           // { type, autonomous, params, description }
  customerReply?: {...}
  reasoning: string
  // NYTT för möten:
  sourceRecordingId: string        // call_recording.id
  evidence?: { quote: string; approxOffset?: string; confidence: 'HIGH'|'MEDIUM'|'LOW' }[]
}
```

Det redan existerande intent-vokabulären täcker mötesbehoven
(`quote_request`, `quote_addition` [=ÄTA], `reschedule_request`,
`new_booking_request`, …). Ingen ny tabell krävs i V1 — utfallet materialiseras som
approval-kort med `payload` = utfallet, precis som `suggest-quote-draft`-mönstret.
Transkriptet förblir sekundärt (rådata i `call_recording`), aldrig
huvudaffärsobjektet.

---

## 11. Matte & Specialist Routing

Matchar befintlig arkitektur exakt — inga ändringar behövs i orkestreringen:

- Matte äger användarytan (kort, sammanfattning, notiser). Matte är INTE en
  observation-runner (körs inte i cron-flottan) — mötesutfallet triggas av
  analysen, inte av en ny runner.
- `suggestedAgent` per action: Daniel (offert/ÄTA — `create_ata_draft` är hans,
  Lars out-of-scope säger uttryckligen "Daniel äger"), Lars (bokning/schema),
  Karin (faktura/ekonomi), Lisa ALDRIG automatiskt (rummet-principen).
- Ett analyspass → strukturerade fakta → routning. **Inte** transkriptet till
  flera agenter separat (hallucinationsrisk, tokenkostnad, inkonsistens —
  voice-auditens "två hjärnor på samma transkript" är redan ett känt problem som
  inte ska tredubblas).

---

## 12. Meeting → Business Actions

Allt går genom BEFINTLIGA verktyg/exekverare. Inventering (36 verktyg i
tool-routern) visar:

| Mötesutfall | Befintlig väg | Status |
|---|---|---|
| Offertutkast | `suggest-quote-draft`-mönstret → `create_quote_draft`-kort | FINNS |
| ÄTA-utkast | `create_ata_draft`-kort | FINNS men trasig sista mil (§13) |
| Boka/omboka | `create_booking`/`book_site_visit` + approval | FINNS |
| Projektnotering | `update_project` | FINNS |
| Följ upp/påminnelse | **SAKNAS** — `analysis-scope.ts:29-31`: "inget verktyg finns" | Byggs som `meeting_followup`-kort → `task`-rad |
| Skicka sammanfattning till kund | Medvetet INTE i V1 (Lisa-principen) | — |

Approval-gränserna ärvs av kontraktet: kundkommunikation, ekonomiska dokument,
bokningsändringar = alltid kort. Interna noteringar/utkast = kan auto-exekvera på
låg risk enligt `INTERNAL_EXEC_TYPES`-vakten (fail-closed: okänd typ blir kort).

---

## 13. Promise / ÄTA / Quote / Scheduling Integration

**Promise Ledger:** finns inte, och rådet har AVVISAT ambient AI-extraktion ur
samtal (`ACTIVE_ROADMAP.md:37`, gate på `:554`: börja med användarskapade löften,
aldrig bred extraktion). **Meeting Intelligence trär gaten så här:** analysens
åtagande-fynd blir ett explicit `meeting_followup`-KORT med evidenscitat som
hantverkaren godkänner → `task`-rad i befintliga task-systemet. Granskningsbart,
aldrig ambient. Ingen promise-tabell byggs.

**ÄTA:** modellen är `project_change` med full livscykel (`lib/ata/lifecycle.ts`) —
men `create_ata_draft`-exekveraren skapar idag en OFFERT rubricerad "ÄTA", inte en
`project_change`-rad, och `quotes` saknar `project_id` (kopplingen är "endast
textuell", enligt källfilens egen kommentar). **Fixen står redan i källfilerna:**
rikta exekveraren mot `POST /api/ata`. Detta är Epic 2:s viktigaste enskilda
ändring — utan den producerar "möte → ÄTA" föräldralösa offerter.

**Offert:** mötesutfallets scope-text matar `payload.description` RÅTT (exekveraren
regenererar vid godkännande — dokumenterad kontraktsdetalj i
`suggest-quote-draft.ts:44-58`) → kanoniska `lib/quotes/create-quote.ts`. Ingen
separat mötesoffertgenerator.

**Schemaläggning:** `reschedule`/ny tid → kort → befintliga bokningsverktyg.
Entitetsupplösning + bekräftelse obligatorisk (aldrig auto-flytt av bokning).

---

## 14. UX — Before / During / After

**Före (V1):** "Inför mötet med X"-sektion i morgonbriefen för dagens kundkopplade
bokningar, byggd på resolver-datat (öppna offerter, senaste kontakt, aktiva
projekt, obetalda fakturor). 15-min-push är V2 (kräver ny sub-hourly cron-räls +
sent-markering — `vercel.json` har idag inget tätare än */15 och
booking-reminders idempotens är en `ILIKE` på sms-texten, vilket inte överlever en
andra påminnelsetyp).

**Under (V1):** som idag — manuell inspelning, samtyckesbanner, countdown. Enda
tillägget: vald kund/bokning syns i UI:t.

**Efter (V1):** mötessammanfattningskort i Jarvis/Idag: "Mötet med Andersson är
sammanfattat — N saker att ta vidare" → sammanfattning, beslut, [ev. ÄTA-signal],
föreslagna kort (agent + vad + varför + evidenscitat + godkänn/avvisa enligt
`card-voice.ts`-rösten). Transkriptet en klick bort, aldrig huvudinnehållet.
Notisen säger vad Matte HITTADE, aldrig "transcript ready".

---

## 15. Privacy / Consent / GDPR

**Nuläge:** samtyckesbanner (påminnelse till hantverkaren) + transcript-only +
ljud raderas. Rimligt för fysiska möten där hantverkaren själv är part.
**Ingen samtyckesartefakt registreras** — överväg minimal stämpel i V1-metadata
(inspelaren bekräftade banner; ingen deltagarlista).

**Digital capture (fas 3/4) kräver juridisk granskning FÖRE bygge — inte
produktintuition.** Kraven som arkitekturen måste stödja: synlig botdeltagare,
mötesinbjudningsnotis, per-möte av/på, deltagarinvändning → capture av,
samtyckesstatus i mötesjobbet, DPA med ev. botleverantör, EU-datahosting.
Transkript är känsliga personuppgifter (kunddiskussioner, priser, adresser) —
lagras redan tenant-isolerat i `call_recording` (RLS v112-klass).

**Audio retention-rekommendation V1: behåll transcript-only.** Ljudlagring
(tvist-/bevisbehov) är ett medvetet SENARE beslut och ändrar GDPR-profilen
väsentligt (biometri-angränsande rådata). Kostnaden är inte skälet — förtroendet är.

---

## 16. Security / Tenant Isolation

- `call_recording`, `calendar_connection` (OAuth-tokens!), `schedule_entry` är
  RLS-låsta sedan v112-sveper. Nya kolumner ärver.
- `/api/agent/trigger` accepterar `business_id` fritt ur body med intern secret —
  röst-auditens "svagaste länk". Mötesflödet ska INTE lägga fler sådana vägar;
  analysens business_id kommer från recording-raden, inte från klienten.
- `ELKS_SKIP_SIGNATURE=true` global avstängning av HMAC — VERIFIERA att den inte
  är satt i prod (ärvd flagga, återupprepas här).
- Supabase-edgefunktionerna `sms-webhook`/`vapi-webhook` anropar en `agent`-funktion
  som inte finns i repot — om de fortfarande är deployade: dubbelprocessningsrisk.
  VERIFIERA MOT PROD.

---

## 17. Cost & Reliability

**Mätning:** Whisper mäts (`cost_event`, öre per sekund, `lib/costs/meter.ts`) på
site-visit- och telefonvägen. **Analys-LLM:en mäts INTE** — `voice/analyze` går
förbi `cost-guard.ts` (enda tillåtna 'llm'-skrivaren enligt
`tests/cogs-matare.spec.ts`). P0: mät via cost-guard-vägen eller utöka facit.

**Storleksordning per möte (listpriser):** Whisper ~0,006 USD/min → 10 min ≈
0,06 USD; 90 min ≈ 0,54 USD. Analys: 90-min-transkript ≈ 12–18k input-tokens →
Haiku-klass ören, Sonnet-klass ~enstaka kronor. Slutsats: **kostnad är inget
V1-problem och ingen prissättning behövs nu** — men mätningen måste in FÖRE
volym (fair-use-beslut fattas på data, inte i förväg).

**Felmoder (§38) hanteras så här i V1:** transkribering misslyckas → tydligt fel i
UI (finns); tomt tal → 422 (finns); kund oupplösbar → kortet skapas ändå MEN utan
entity-koppling och säger det ("Kunde inte koppla till kund — välj själv");
analys misslyckas → transkriptet finns kvar, ingen tyst "allt är klart".
**Aldrig falsk "allt hanterat"** — samma deterministiska ärlighet som
`buildOrchestrationSummary` (kod, inte modell, skriver statusraden).

---

## 18. Recommended V1 — minsta värdefulla

Master-promptens §48-skiss bekräftas som korrekt V1. Digital auto-join är INTE V1
(fel möten för segmentet, juridik ogranskad, async-infra saknas).

**V1 = Epic 0 + Epic 1 + Epic 2 (nedan). Befintlig 10-min-capture behålls.**
Värdet: hantverkaren väljer kund → spelar in platsbesöket → får ett
sammanfattningskort med kopplade, evidensmärkta förslag (offert/ÄTA/uppföljning/
ombokning) på samma approval-räls som allt annat — och externa kalenderhändelser
börjar kundkopplas via attendee-upplösning.

---

## 19. V2–V5 Roadmap

- **V2 — långa möten + nudge:** Storage-bucket + chunkad uppladdning, jobbtabell +
  cron-worker (retry/idempotens/partial), `verbose_json`-tidsstämplar,
  map-reduce-analys, pause/resume/recovery i klienten; 15-min-förmötespush (ny
  cron-räls + sent-markering); per-mötestyp-inställningar (§8-automatiken:
  "Handymate antecknar: PÅ/AV" per bokning, defaults per typ).
- **V3 — native transcript-API:er:** Meet REST/MS Graph/Zoom för kunder som redan
  har kapabiliteten. Juridisk GDPR-granskningFÖRST. Meeting Resolver får
  URL-parsning (länkarna ligger redan i `schedule_entry.description`).
- **V4 — köpt mötesbot:** Recall.ai-klass med EU-hosting, synlig deltagare
  "Handymate Mötesassistent", bakom bevisad efterfrågan (mät: hur många kunder
  har digitala kundmöten alls?).
- **V5 — sökbarhet:** "Vad sa kunden om golvvärmen?" kräver riktig embedding-läsväg
  — idag SKRIVS embeddings i `agent_memories` men LÄSES aldrig (retrieval är
  importance-sort). Byggs när mötesvolymen finns.

---

## 20. P0–P3 Findings

**P0 — säkerhet/korrekthet (fixas i Epic 0, oavsett resten):**
1. `app/api/voice/site-visit/route.ts` saknar `export const maxDuration` →
   sannolik timeout redan vid dagens 10 min. [Effort: rad]
2. `Motesassistenten.tsx` skickar aldrig `customer_id` → alla mötestranskript
   föräldralösa. [Effort: låg]
3. Google-importen sannolikt 100 % trasig: `type:'external'` bryter
   `schedule_entry`-CHECK:en, felet okontrollerat. VERIFIERA MOT PROD → v118.
4. `lib/agent/context-engine.ts:61` frågar obefintliga booking-kolumner →
   agentens "dagens bokningar"-kontext har alltid varit tom.
5. Recordings/Inbox visar spelknapp + "Transkribera" på site-visit-rader
   (`recording_url=null`). Filtrera på `source`.
6. Analys-LLM-kostnad omätt (§17).

**P1 — stort kundvärde:** Epic 1 (möteskontext: kundväljare, booking_id,
kalenderfälten, attendee-upplösning, förmötesbrief) + Epic 2 (utfall på
approval-rälsen + ÄTA sista milen + meeting_followup→task).
Värde 9/10, differentiering 8/10, effort Medium, risk Low-Medium, Now.

**P2 — stark förbättring:** V2-paketet (långmöten, nudge, inställningar).
Värde 7/10, differentiering 6/10, effort High, risk Medium, Next.

**P3 — framtida vallgrav:** V3–V5 (native API:er, bot, sök) + Job Genome/
Offer-to-Reality-berikning (mötessignaler som utfallsevidens — byggs först när
konsument finns, §45-46-principen).

---

## 21. Implementation Epics

### Epic 0 — P0-fixar
**Problem:** sex skarpa buggar som gör dagens funktion delvis oärlig.
**Scope:** exakt listan i §20. **Out of scope:** allt nytt.
**Filer:** `app/api/voice/site-visit/route.ts`, `components/moten/
Motesassistenten.tsx`, `app/api/cron/sync-calendars/route.ts`,
`app/api/google/sync/route.ts`, `lib/agent/context-engine.ts`,
`app/dashboard/recordings/page.tsx`, `app/dashboard/inbox/page.tsx`,
`app/api/voice/analyze/route.ts`, `sql/v118_meeting_context.sql` (del 1: relaxad
CHECK). **Migration:** ja (v118). **Tester:** befintliga specs gröna + facit för
source-filtreringen. **Acceptans:** tsc/build rena; site-visit-rad får customer_id
när kund väljs; Google-import verifierad mot prod. **Komplexitet:** Låg.
**Parallell:** ja, fristående.

### Epic 1 — Möteskontext
**Problem:** transkript och kalenderhändelser är okopplade till affären.
**Scope:** kundväljare + bokningsval i Mötesassistenten (förifyllt från dagens
bokningar via `GET /api/bookings`-berikningen); `call_recording.booking_id` +
`schedule_entry.customer_id` (v118 del 2); `getCalendarEvents()` slutar kasta
attendees/location/conferenceData; attendee-email → `lib/matte/resolver.ts` →
persisterad kundupplösning; "Inför mötet"-sektion i morgonbriefen.
**Out of scope:** 15-min-push, ny cron, mötes-URL-parsning, deal_id på booking.
**Beroenden:** Epic 0 (v118). **Återanvänds:** resolver, bookings-berikningen,
morning-brief-strukturen. **Komplexitet:** Medium.

### Epic 2 — MeetingOutcome på approval-rälsen
**Problem:** mötesanalysen landar i legacy-kön utan kontrakt; ÄTA-kedjan bryts
sista milen; uppföljning saknar primitiv.
**Scope:** mötesgrenen i `voice/analyze` producerar MatteDecision-format
(+sourceRecordingId, evidens/konfidens) → `pending_approvals` via
suggest*Draft-mönstret; nya approval_types klassade i `action-contract.ts`
(`meeting_summary` INFORMATIONAL, `meeting_quote_draft`/`meeting_followup`
EXECUTABLE, ÄTA-fallet via befintliga `create_ata_draft`); `create_ata_draft`-
exekveraren omriktas till `POST /api/ata` (riktig `project_change`-rad);
`meeting_followup`-godkännande → `task`-rad; sammanfattningskort i Jarvis.
**Out of scope:** telefongrenen (Epic 6-problemet), kundkommunikation,
promise-tabell. **Beroenden:** Epic 1 (kontexten ger korten entity-koppling).
**Tester:** facit för outcome→kort-mappningen, action-contract-spec,
uppdaterad `motesassistenten.spec.ts`. **Komplexitet:** Medium-High.

Ordning: 0 → 1 → 2. Epic 0 parallelliserbar med annat; 1→2 sekventiella.

---

## 22. Final Verdict

Handymate ska inte bygga Fireflies. Transkription är commodity — vallgraven är att
mötets innehåll landar som **säkra, evidensmärkta handlingar mot riktiga
affärsobjekt**: ÄTA-signalen jämförs med den faktiskt accepterade offerten,
ombokningen pekar på den riktiga bokningen, uppföljningen blir en task med citat
ur mötet — allt genom samma approval-kontrakt som resten av produkten, med samma
ärlighetsprinciper (ingen falsk "klart", inget obevisat belopp, hellre otillskrivet
än feltillskrivet).

Vägen dit är kort eftersom det mesta redan finns. Det som byggs nu är kopplingen:
**Epic 0 (ärlighet) → Epic 1 (kontext) → Epic 2 (handling).** Digital capture
väntar tills segmentet bevisar behovet — och köps då, inte byggs.

Nordstjärnan: *hantverkaren lämnar mötet och administrationen är redan gjord —
men inget konsekvensiellt hände utan hans godkännande.*
