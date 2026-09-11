# HANDYMATE — BRAIN VISIBILITY WEEKEND
## Operativt styrdokument för Codex och Claude
### 11–13 september 2026

> **AUTHORITATIVE PROGRAM DOCUMENT**
>
> Detta dokument är styrande för Handymates Brain Visibility-arbete under 11–13 september 2026.
>
> Skapa inte ett separat roadmap-, strategi- eller planeringsdokument för samma arbete.
> Uppdatera detta dokument när faktisk repo-/runtime-verklighet ändras.
>
> **Aktuell `main`, `ARCHITECTURE.md`, kanoniska domänregler, säkerhetsregler och verifierad runtime-verklighet väger alltid tyngre än antaganden i detta dokument.**

---

# 0. Uppdraget

## Make Handymate’s existing intelligence impossible for the customer to miss.

Handymate ska inte bara **vara intelligent i backend**.

Kunden ska tydligt kunna uppleva:

- vad Handymate har sett
- vad Handymate förstår
- vad Handymate bevakar
- vad Handymate arbetar med
- vad som händer härnäst
- vad som väntar på någon annan
- vad som behöver användarens beslut
- vad Handymate redan har löst
- varför Handymate rekommenderar något
- vilken faktisk effekt arbetet har fått

Detta ska ske utan att göra produkten till en chatbot, AI-demo eller aktivitetsfeed.

Handymate ska kännas som:

> **ett administrativt operativsystem som driver firman medan användaren arbetar.**

---

# 1. Produktprincip

Handymate ska inte vinna på att kunden kan göra flest saker.

Handymate ska vinna på att kunden behöver göra minst möjligt administrativt arbete.

Den centrala produktfrågan är därför:

> **Hur tydligt kan kunden se att Handymate håller firman under kontroll utan att själv behöva sköta administrationen?**

North Star för programmet:

> **Ägaren arbetar i firman. Handymate dokumenterar, bevakar och driver den administrativa firman.**

---

# 2. Problemformulering

Handymate har redan ett omfattande substrat av:

- AI-agenter
- automationer
- approval rail
- kvitton
- agentminne
- företagspreferenser
- kundminne
- offertintelligens
- uppföljning
- projektintelligens
- ekonomiska flöden
- missions/uppdrag
- rekommendationer
- rapportering
- mobil
- integrationslogik

Men en capability som existerar i kod är inte automatiskt en fungerande produktcapability.

För varje smart capability måste följande skiljas åt:

1. Koden finns.
2. Runtime-triggern finns.
3. Riktig data når motorn.
4. Motorn producerar rätt output.
5. Outputen kopplas till rätt affärsobjekt.
6. Eventuell consequential action går via rätt approval/autonomy-väg.
7. Resultatet verifieras.
8. Ett beständigt kvitto finns.
9. Kunden kan se och förstå intelligensen.
10. Mobilupplevelsen fungerar där det är relevant.
11. Hela flödet är verkligt E2E-testat.

Brain Visibility-programmet ska därför inte börja med antagandet att funktioner behöver byggas.

Default är:

> **REUSE → CONNECT → ACTIVATE → EXPOSE → PROVE**

Nybyggnation är sista alternativet.

---

# 3. Statusmodell

Alla capabilities ska klassificeras med EN primär status.

## BUILD
Capabilityn eller en nödvändig domänprimitive saknas faktiskt.

Använd endast när inventeringen visar att befintlig arkitektur inte kan lösa behovet genom rimlig utökning.

## CONNECT
Nödvändiga delar finns men kedjan mellan dem är inte komplett.

Exempel:

- agentoutput saknar koppling till quote_id
- UI läser inte receipt
- mobile och backend använder olika state
- trigger skapar output som inte når canonical domain engine

## ACTIVATE
Capabilityn finns och är tekniskt inkopplad men används inte i verkligheten.

Exempel:

- kräver företagsmål som inga konton har
- automation är aldrig aktiverad
- capability saknar riktig trigger
- capability får aldrig data i normal kundresa

## EXPOSE
Handymate gör eller vet något viktigt men kunden ser det inte, ser det för sent eller förstår inte värdet.

Exempel:

- kvitto finns endast i auditlogg
- agent arbetar men offertvyn visar bara "Skickad"
- risk upptäcks men syns endast i Behöver dig utan evidens eller nästa steg

## PROVE
Capabilityn ser ut att vara komplett men verklig E2E-/provider-/mobilverifiering saknas.

## SCALE
Capabilityn är:

- inkopplad
- kundsynlig
- sanningsenlig
- verifierad
- användbar

Därefter kan adoption, performance, kostnad och UX optimeras.

---

# 4. Styrkontrakt

Dessa regler gäller under hela programmet.

## 4.1 Reuse before build

Sök alltid efter befintlig implementation innan nya:

- tabeller
- services
- agent tools
- domänmotorer
- event
- approvaltyper
- receiptformat
- UI-modeller

skapas.

Dokumentera vad som återanvänds.

## 4.2 No fake intelligence

UI får aldrig antyda att Handymate:

- sett något
- analyserat något
- bevakat något
- utfört något
- sparat pengar
- sparat tid
- fått providersvar
- kontaktat en kund

om runtime inte kan bevisa påståendet.

Tillåtna formuleringar måste följa faktisk state.

Exempel:

**Bra**
> 12 400 kr identifierat som möjligt fakturaunderlag.

**Inte tillåtet utan bevis**
> Handymate räddade 12 400 kr.

## 4.3 No parallel engines

Brain Visibility får inte bli ett nytt business-logic-lager.

UI och agentorkestrering ska läsa/agera genom befintlig canonical state.

Exempel:

- Field Command får inte skapa sin egen tidsmotor.
- Brain Home får inte ha ett eget separat "nästa steg"-system om motsvarande state redan finns.
- Quote Brain får inte implementera alternativ offertuppföljning.

## 4.4 Vertical slices only

Arbetet ska byggas i kompletta vertikaler.

Varje slice ska om möjligt innehålla:

**evidence  
→ interpretation  
→ system state  
→ recommendation/action  
→ approval/autonomy  
→ execution  
→ verification  
→ receipt  
→ customer-facing presentation  
→ test**

Undvik breda backend-refactors som inte ger ett verifierbart kundutfall.

## 4.5 Customer-visible value wins

Om två möjliga arbeten har liknande risk:

Prioritera det som gör verklig befintlig intelligens:

- mer synlig
- mer begriplig
- mer användbar
- mer förtroendeingivande

för kunden.

## 4.6 Brain ≠ chatbot

Synlig intelligens ska primärt uttryckas genom produktstate.

Exempel:

- nästa steg
- observation
- risk
- väntar på
- behöver dig
- hanterat
- resultat
- evidens
- agent ownership

Inte genom att lägga Matte-chatten överallt.

## 4.7 Owner by Exception

Brain Visibility får inte leda till mer brus.

Vi vill inte maximera:

- notifications
- cards
- agent messages
- activity rows

Vi vill maximera kontroll med minimalt behov av mänsklig handling.

Bra slutstate:

> Handymate hanterade 14 saker.  
> 3 väntar på andra.  
> 2 behöver dig.

## 4.8 Mobile counts

En capability som naturligt hör hemma ute på bygget är inte komplett om endast desktop fungerar.

Mobile ska bedömas för varje relevant slice.

Särskilt viktigt för:

- Matte
- Field Command
- rapportering
- tid/material
- ÄTA
- kundlöften
- återbesök
- approvals
- dagens jobb
- receipts

## 4.9 Money claims require evidence

Ekonomiskt språk ska vara semantiskt korrekt.

Skilj alltid på exempelvis:

- möjligt värde
- identifierat värde
- godkänt värde
- utfört arbete
- fakturaunderlag
- fakturerat
- provider-accepterat
- betalt

UI-copy ska spegla exakt state.

## 4.10 Explainability without chain-of-thought

Kunden ska kunna förstå varför Handymate säger något.

Visa konkret evidens och affärslogik.

Exempel:

> Kunden bad om två extra uttag den 10 september.  
> De finns inte i accepterad offert.  
> Därför markerar Handymate detta som möjligt ÄTA.

Visa inte intern modellresonemang eller dold chain-of-thought.

## 4.11 Consequential actions remain controlled

Brain Visibility får aldrig bli en genväg runt:

- permissions
- tenant isolation
- approval rail
- earned autonomy
- financial safeguards
- customer communication safeguards

Synligare AI får inte innebära mindre säker AI.

## 4.12 Idempotency remains mandatory

Alla nya CTA:er och presentationslager som utlöser befintliga actions måste tåla:

- dubbelklick
- retry
- response loss
- reload
- concurrency

utan duplicerade affärsobjekt eller actions.

## 4.13 Partial failure must remain visible

Om ett multi-action-flöde delvis misslyckas:

> 3 av 5 klara.

Inte:

> Klart.

Brain Visibility ska göra sanningen tydligare, inte dölja komplexitet.

## 4.14 Cost awareness

Varje ny LLM-användning måste motiveras.

Fråga alltid:

- Kan befintlig lagrad state användas?
- Kan deterministisk kod lösa presentationen?
- Finns redan en agentoutput att återanvända?
- Riskerar vi att köra samma analys flera gånger för att visa samma UI?

Målet är inte maximalt antal LLM-anrop.

Målet är maximal kundupplevd intelligens per faktisk computation.

Dokumentera nya kostnadsdrivande anrop.

## 4.15 Checkpoint after every slice

Efter varje större vertikal ska detta dokument uppdateras.

Nästa session ska kunna fortsätta utan att behöva rekonstruera föregående sessions intention.

---

# 5. Kundens mentala modell

Handymates intelligens ska kunna förstås genom sju enkla frågor.

## 1. Vad såg Handymate?
Exempel:
> Kunden bad om två extra uttag.

## 2. Vad betyder det?
> De finns inte i accepterad offert.

## 3. Vad gör Handymate?
> Jag har förberett ett möjligt ÄTA.

## 4. Vad händer härnäst?
> Väntar på ditt beslut.

## 5. Vad behöver Handymate från mig?
> Granska pris och omfattning.

## 6. Vad blev resultatet?
> ÄTA accepterat av kunden: 7 800 kr.

## 7. Varför?
> Visa relevant evidens och source objects.

Detta är standardmodellen för hur hjärnan ska exponeras genom produkten.

---

# 6. Övergripande presentationsmodell

När lämpligt ska befintliga vyer kunna uttrycka följande states:

## HANDYMATE SER
Observationer från verklig data.

## HANDYMATE FÖRSTÅR
Härledd betydelse, risk, möjlighet eller relation.

## HANDYMATE GÖR
Pågående eller planerad handling.

## VÄNTAR PÅ
Extern part eller framtida trigger.

## BEHÖVER DIG
Beslut som verkligen kräver användaren.

## HANTERAT
Verifierade handlingar som är klara.

## RESULTAT
Faktisk konsekvens:

- accepterat
- bokat
- faktureringsklart
- skickat
- provider-accepterat
- betalt
- annan verifierad outcome

Alla ytor behöver inte visa alla kategorier.

Använd endast det som ger hög signal.

---

# 7. Capability Reality Audit

Detta är programmets första arbetsfas.

## Målet

Skapa en komplett inventering av befintlig smart funktionalitet på:

- dashboard/web
- backend
- agentlager
- automationer
- mobile
- integrationslager

Auditens syfte är inte bara att hitta filer.

Den ska kartlägga verklig runtime.

## 7.1 Minsta auditmatris

Underlag: [skiva 0](../brain-visibility/SLICE_0_CAPABILITY_REALITY_AUDIT.md) och [detaljmatris](../brain-visibility/CAPABILITY_MATRIX_PREFILL.md). Ursprunglig audit följd av daterad Codex-verifiering; status uppgraderas endast med bevis.

Legend: ✅ finns/ja · ⚠️ delvis · ❌ nej/saknas · `n` = prod-antal 2026-09-10 · facit = källskannande test, E2E = inloggad browser/route-körning

| Capability | Code | Trigger | Real data | Can act | Approval/autonomy | Receipt/audit | Web | Mobile | Live/E2E proof | Cost | Status | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Company Scan | ✅ `company-scan-rows.ts` | klient (hem, onboarding) | läser invoice/customer/project/quotes; tomt konto → 0 rader | ❌ läs | – | ❌ inget kvitto | ✅ hem + onb. | ❌ | facit ×5 | 0 | **PROVE** | kall testperson; besluta om kvitto |
| Value Receipts | ✅ `lib/value/*` | on-demand | 109 utförda kort, 12 fakturor (test) | ❌ | – | ⚠️ omräknas per anrop, ingen tabell | ✅ /pengar, hem | ❌ | E2E (golden-path) | 0 | **PROVE** | visa nära kontext (skiva 6); persistens = beslut |
| Next Best Action | ✅ `lib/jarvis/next-best-action*` | cron 07:00 | grind: ≥2 kand. + ≥1 priority_rule → **0 regler, 0 rader någonsin** | rankar bara | – | ✅ `next_best_action` | ✅ GorDettaForst | ✅ mobile-home | facit ×3 | Sonnet/dag/företag (körs aldrig) | **ACTIVATE** | seed standardprinciper i genomgången |
| Company Goals | ✅ kolumner på business_config | ägaren i settings/onb. | **1 marginalmål, 0 omsättningsmål** av 29 | guardian-kort | INFORMATIONAL | kortet | ✅ monthly-review, projekt | ✅ profitability/mobile | E2E (margin-guardian) | 0 | **ACTIVATE** | obligatoriskt/förifyllt mål i genomgången |
| Customer Memory | ✅ `lib/customer-facts/*` | gmail-poll */15, voice/analyze, cron 07:20 | 6 fakta, 4 godkända (prov) | via kort | `customer_fact` | ✅ rad + decision_record | ✅ kundsida | ❌ | E2E (golden-path) | Haiku/mejl | **PROVE** | ett riktigt samtal genom kedjan |
| Business Rules / Prefs / Agent memory | ✅ 3 mekanismer | ägaren; efter agentkörning | **0 business_rule, 0 priority_rule**, 37 agent_memories | input | `agent_memory_confirmation` | ✅ 3 tabeller | ✅ settings | ❌ | facit ×5 | Haiku/agentkörning | **ACTIVATE** (regler) / PROVE (minne) | regelfråga i genomgång eller första Matte-samtal |
| Quote Intelligence | ⚠️ 3 överlappande motorer | offertsida GET, cron 05:00, tool | kräver 3+ avslutade jobb/kategori → `insufficient` överallt; 7 rader pricing_intelligence | `price_adjustment`-kort | ja | execution_result, cost_event | ✅ offert, builder | ❌ | facit ×10 | Sonnet + Haiku | **ACTIVATE** | efter lansering: en yta "så sattes priset" |
| Quote Follow-up | ✅ cron-rutt + `followup-round.ts` | cron 08:00, first-action, thresholds | 42 offerter, 11 uppföljda, 2070 loggar | SMS under autonomitak / `send_sms`-kort | ja, per runda bunden till kort (7f367da5) | ✅ v3_automation_logs + follow_up_count + kort | ⚠️ approvals; offertsidan säger bara "Skickad" | ✅ kort | facit ×7, ingen E2E | 0 i cron | **EXPOSE** | **skiva 2:** läsmodell på offertsidan |
| Meeting Intelligence | ✅ `lib/meetings/*` | worker */5, reminders */5 | 1 möte, 1 segment | kort ×4 typer | ja | meeting_job/segment, call_recording, cost_event | ✅ inkorg, recordings | ⚠️ samma yta | facit ×5 | Whisper + Claude | **PROVE** | riktigt möte, två telefoner |
| Work Report (fältrapport + Matte dagsavslut) | ✅ två saker | UI + token; DayClose → /api/day-close | **0 field_reports** | signering; time_entry/project_log via bekräftelsekort | egna kort, ej pending_approvals | field_reports; deterministiska id | ✅ projekt, jobbpass, portal | ✅ signeringssida | facit ×4 | Sonnet (Matte) | **PROVE** | riktigt dagsavslut från telefon; = Field Command-substrat |
| Voice / Matte field input | ✅ `voice/analyze` (1107 r), `lib/transcription/*` | 46elks-webhooks, UI, Jobbkompisen | 6 inspelningar, 1 transkript; **46elks 8 kr** | kort ×4 | ja | call_recording, kort, cost_event | ✅ calls, recordings, inkorg, kund | ✅ Jobbkompisen | facit ×10 + 46 unit (transkription) | Whisper + Claude | **PROVE (blockerad)** | fyll 46elks, telefonprov |
| ÄTA detection | ✅ `lib/ata/suggest-ata-draft.ts` | analyze, tool, Matte, manuell | 9 project_change (manuella), **0 `create_ata_draft`-kort någonsin** | kort, max 1/samtal | ja, risk low | project_change, artifacts, PDF | ✅ projekt | ✅ portal-beslut | facit ×6 | Claude ×2 | **PROVE** | samtal med extra scope; Change Order Radar = detta + jämförelse |
| Customer promises | ✅ i `customer_fact` (v147) + deadline-sweep | cron 07:20, analyze, gmail | **0 öppna löften** (kräver extrakt + godkännande) | nudge-kort, aldrig "brutet" auto | Matte | customer_fact + kort | ✅ kundsida, projekt | ✅ kort | unit ×5 | Haiku (extrakt) | **PROVE** | Promise Engine = EXPOSE + löften ur SMS/röst |
| Project intelligence | ✅ `project-ai-engine` + playbook + drift + mission | 4 crons + events | project_ai_log **770** (lever), lesson 3, mission 0, drift-kort 4 | kort ×3 typer | ja | project_ai_log, execution_outcome | ✅ projekt, approvals, MissionPanel | ✅ kort + räknare | E2E `flywheel`, `mission-proof` (service-role) | extraction-modell (mönster) | motor **PROVE**, playbook+mission **ACTIVATE** | skiva 3 = EXPOSE av loggen på projektsidan |
| Profitability / Margin | ✅ `margin-guardian.ts`; ⚠️ gammal `calculateProfitability` lever | cron 06:00 + realtid | **0 profitability_warning-kort**; 1264 cost_event/30 d | INFORMATIONAL-kort; bränsletak blockerar | Karin | kort, cost_event | ✅ projekt, Fuel* | ✅ profitability/mobile | E2E (margin-guardian) | 0 | **PROVE** | ta bort gamla vägen (liten CONNECT) |
| Invoice / accounting (inkl. **fakturaberedskap**) | ✅ `auto-invoice-on-complete`, `send-invoice`, `fakturaberedskap.ts`, `RedoAttFakturera.tsx` | projektavslut, 4 crons | 12 fakturor, **0 påminnelser skickade** | skapar/skickar, overdue, avgift/ränta | `invoice_reminder`-kort; mandat | invoice_reminders, customer_activity, manifest | ✅ invoices, projekt; ⚠️ beredskap ej på hem | ⚠️ kortfeed | facit ×15 + golden-path | 0 | **PROVE** (kedja) / **EXPOSE** (beredskap) | "X kr väntar på fakturering" på hem = summa av beredskap |
| Fortnox | ✅ `lib/fortnox*`; 4 ingångar mot samma kärna | cron */2h; Fortnox-först vid utskick | **0 kopplade**, 19 api_log | externa skrivningar, **ej spåret** | – | fortnox_api_log, automation_activity, invoice-kolumner | ✅ integrations, invoices | ❌ | facit ×15, **0 live** | 0 | **PROVE (blockerad)** | Andreas kopplar riktigt konto i helgen; en faktura genom |
| ROT/RUT | ⚠️ **två vägar** (egen XML vs Fortnox taxreductions) | UI only | **0 rot_payment_request** | skriver request + status; `hasPermission` | ej spåret | rot_payment_request, automation_activity | ✅ rot-payment, offert/faktura-sektioner | ❌ | facit ×9, 0 live | 0 | **PROVE + arkitekturbeslut** | Astra: en väg |
| Missions / agent work | ✅ `lib/agents/*` (kanonisk), `lib/mission/*`; `lib/agent/*` 13/17 levande | 6 crons; mission ingen cron | agent_runs 1362 (282/30 d), **mission 0** | via `agent-gating.ts` | ja | agent_runs, automation_activity | ✅ JarvisHome | ✅ räknare | facit ×20, mission-proof | **hög**; Matte-chat utanför taket | agenter **PROVE**, missions **ACTIVATE** | Matte-chat under taket; radera 4 filer utan anropare |
| Approval rail | ✅ `lib/approvals/*`, `[id]/route.ts` >3000 r, per-typ-grindar | alla producenter; användaren | **477 kort, 26 väntande, 109 utförda**, 30+ typer | ja | ja; självgodkännande nekas; fyra-ögon | execution_result klassad | ✅ approvals, hem, RailCard | ✅ 3 kort + push | E2E (golden-path, permission-check) | 0 | **SCALE** | inget bygge; skiva 5 = visa `_decision` som redan finns |
| Operating Experiments | ✅ `lib/experiment/*` | inline + maintenance 03:00 | **0 rader** (kräver avslutade projekt) | kort ×2 | owner_admin | tabellrad | ✅ /experiments | ❌ | facit + experiment-proof | 0 | **ACTIVATE** (sovande by design) | rör inte |
| Partner / referral | ✅ `lib/partners/*` | Stripe-webhook, portal; ingen cron | 2 partners, 0 ledger | direkt, **ej spåret** | admin + token | ledger, payout_batch, events | ✅ /partners | ❌ | facit ×15 | 0 | **PROVE** | utanför programmet |
| **Home / Mission Control** | ✅ JarvisHome 1980 r, 18 datakällor; räkningarna finns (MatteHero:123, TeamActivityStrip:66) | klient | allt ovan | – | – | – | ✅; ⚠️ gamla Idag-vyn parallell på /oversikt | ✅ /api/mobile/home | facit ×6 | 0 | **EXPOSE** | **skiva 1:** läsmodell, ingen ny struktur; hanterat ≠ failed |
| **Adoption / "hanterat"** | ✅ `lib/admin/adoption.ts` (8 ytor), activation-metrics, weekly-value | admin; cron | veckorapport **0/4 lyckade**; 53 tysta fel/7 d | – | – | automation_activity | ⚠️ bara admin | ❌ | facit | 0 | **EXPOSE** | laga veckorapport + tysta fel FÖRST |
| **Mobilappen** | separat repo `handymate-mobile`; backend `/api/mobile/home`, push | – | 1 push_token, 0 web-push, **VAPID saknas** | – | – | push-journal | – | ⚠️ | facit (push ×5) | 0 | **CONNECT** | VAPID i Vercel; bygg + installera |

**Fördelning:** SCALE 1 · EXPOSE 4 · ACTIVATE 6 · PROVE 11 · CONNECT 1 · **BUILD 0**.


## Codex-verifiering 2026-09-10

Kodbas: `3ae0029` (main efter uppladdat styrdokument); Claudes historiska audit gäller `64484e11`. Räkningar nedan är läsande SQL mot Handymates prodprojekt, inte provider- eller E2E-bevis.

- Bekräftat: 29 företag; 1 uttryckligt marginalmål; 0 omsättningsmål, prioriteringsregler, business rules, NBA-rader, Fortnox-kopplade företag och ROT-begäranden.
- Bekräftat: 477 approval-rader: 109 `approved`, 26 `pending`, 324 `expired`, 18 `rejected`. **109 godkända är inte 109 utförda handlingar**: runtime `payload.execution_result.outcome` är 37 `success`, 13 `failed`, 22 `skipped`, 37 saknas. Auditens historiska formulering "109 utförda" är därmed fel; sparat success är i sin tur inte automatiskt live-providerbevis.
- Bekräftat senaste sju dagar: 53 `tyst_fel/failed` (43 `telefonnummer_saknas`, 10 `sms:leverantorsfel-saldo`), 4 `veckorapport/failed`, inga lyckade veckorapporter. Dessa auditposter ska inte raderas eller omskrivas till success.
- Bekräftad schemadrift: `customer_document` har `id`, inte `document_id`.
- Rättelse: `tryAutoApprove` har ingen runtime-anropare i TS/TSX. `/api/automations` läser `getAutoApproveStats`; `/api/auto-approve/patterns` läser lärandestatistik. `voice/analyze` har avvecklat legacy-vägen. Legacy-exekveraren respekterar inte dagens routing/mandat och får inte återaktiveras; detta är inte en verifierad aktiv automatisk bypass.
- Inga förmågor uppgraderas. Övriga uppgifter/statusar är Claudes underlag; ingen ny live-, provider- eller mobilverifiering har gjorts. Fördelningarna i ursprungsunderlagen är inte normaliserade: blandade delstatusar ska inte tolkas som en verifierad summering av en primär status per rad.

---

# 8. Auditkrav per capability

För varje capability ska Codex svara på:

### EXISTENCE
- Var finns implementationen?
- Vilken kod är canonical?
- Finns gammal/död parallell implementation?

### INPUT
- Vad triggar capabilityn?
- Vilken riktig data kräver den?
- Får den denna data i normal produktion?

### INTELLIGENCE
- Vad tolkar AI?
- Vad är deterministisk affärslogik?
- Vad lagras?

### ACTION
- Kan capabilityn agera?
- Genom vilken canonical service?
- Krävs approval?
- Finns earned autonomy?

### VERIFICATION
- Hur vet systemet att handlingen faktiskt lyckades?
- Är agent-run success felaktigt likställt med business outcome någonstans?

### RECEIPT
- Finns objektkopplat beständigt kvitto?
- Kan UI använda det?

### CUSTOMER VISIBILITY
- Var ser kunden detta?
- Förstår kunden vad Handymate gör?
- Förstår kunden varför?
- Förstår kunden nästa steg?

### MOBILE
- Är capabilityn relevant i mobilen?
- Finns den?
- Är state konsekvent?

### PROOF
- Unit?
- Contract?
- E2E?
- Authenticated?
- Live provider?

### STATUS
Klassificera:
BUILD / CONNECT / ACTIVATE / EXPOSE / PROVE / SCALE.

---

# 9. Prioriteringsmodell efter audit

När auditen är tillräckligt stabil ska nästa arbete prioriteras efter:

## P1 — Kundvärde
Hur mycket bättre blir upplevelsen av att Handymate driver firman?

## P2 — Existing leverage
Hur mycket befintlig intelligens kan aktiveras eller exponeras med liten ny kod?

## P3 — Revenue relevance
Påverkar detta:

- offert
- ÄTA
- fakturering
- betalning
- marginal
- kundrelation

## P4 — Frequency
Hur ofta möter kunden situationen?

## P5 — Pitch value
Hur tydligt demonstrerar förbättringen Handymates unika kategori?

## P6 — Risk
Hur stor risk har ändringen att destabilisera launch-kritiska flöden?

Föredra:

> hög kundnytta + hög befintlig leverage + låg arkitekturrisk

---

# 10. Den vertikala arbetskön

Ordningen nedan är default.

Codex får ändra ordningen endast om Capability Reality Audit visar en tydlig teknisk eller produktmässig anledning.

Dokumentera i så fall varför.

---

# SLICE 0 — Capability Reality Audit

## Goal
Skapa en sann karta över den befintliga hjärnan.

## Deliverables

- auditmatris
- canonical primitives
- dead/sovande code paths
- runtime triggers
- missing connections
- invisible intelligence
- unproven intelligence
- duplicationsrisk
- highest-leverage interventions

## Definition of Done

Auditen är tillräckligt komplett för att nästa slice inte riskerar greenfield-byggnation av något som redan finns.

---

# SLICE 1 — Brain Surface / Home

## Goal

Gör startsidan till den tydligaste upplevelsen av att firman är under kontroll.

Den ska inte bli en traditionell KPI-dashboard.

Den ska besvara:

> Vad händer i firman och vad gör Handymate åt det?

## Önskade informationskategorier

Endast där runtime har stöd:

### Firman är under kontroll

Exempel:

> 14 saker hanterade  
> 3 väntar på andra  
> 2 behöver dig

### Behöver dig
Endast riktiga beslut.

### Handymate arbetar
Verkliga pågående/bevakade saker.

### Väntar på
Kund, leverantör, teammedlem, provider, datum eller framtida trigger.

### Pengar
Verifierade relevanta ekonomiska states.

Exempel:

- möjligt fakturaunderlag
- faktureringsklart
- förfallet
- möjlig ÄTA
- väntar på kundbeslut

## Restrictions

- Ingen fake activity feed.
- Ingen egen parallell taskmotor.
- Ingen dubblering av Behöver dig.
- Ingen påhittad ROI.
- Undvik agent-avatar-teater.

## Definition of Done

En användare kan öppna Home och inom 10 sekunder förstå:

1. om firman är under kontroll
2. vad Handymate hanterar
3. vad som verkligen behöver människan
4. vilka ekonomiska eller kundmässiga saker som är viktigast

Allt ska komma från verifierbar befintlig state.

---

# SLICE 2 — Quote Brain

## Goal

En offert ska kännas bevakad av Handymate, inte som ett statiskt dokument.

## Exempel på kundsynligt state

> Daniel bevakar denna offert.

> Kunden öppnade den igår 20:43.

> Ingen respons ännu.

> Nästa uppföljning är planerad fredag enligt er regel.

> Väntar på kunden.

Efter handling:

> Uppföljning skickad 09:03.  
> Väntar nu på svar.

## Måste kopplas till riktig offert

Verifiera:

- quote ID
- follow-up round
- approval
- send attempt
- provider/result
- customer response
- stop condition
- receipt

## Explainability

Exempel:

> Varför följer Handymate upp fredag?

Visa regel och relevant offertstate.

## Definition of Done

En verklig offert kan följas från skickad → bevakad → uppföljd → kundrespons → stop condition med sanningsenligt UI och kvitto.

---

# SLICE 3 — Project / Job Brain

## Goal

Jobbvyn ska visa den administrativa verkligheten kring jobbet.

Inte bara projektdata.

## Möjliga kategorier

### Nästa steg
Vad händer konkret härnäst?

### Handymate har koll
Vad bevakas?

### Behöver dig
Vad blockerar?

### Väntar på
Kund, team, provider, datum.

### Pengar
ÄTA, faktureringsunderlag, marginal, ekonomisk risk — endast där befintlig state stöder det.

### Hanterat
Nyligen verifierade actions.

## Definition of Done

Jobbvyn ska besvara:

> “Om jag bara gör själva jobbet, vad sköter Handymate administrativt runt omkring?”

---

# SLICE 4 — Customer Brain

## Goal

Kundvyn ska exponera relevant minne och relationell intelligens.

## Möjliga exempel

- senaste löften
- väntande beslut
- aktuell offert
- nästa bokning
- relevant kommunikationshistorik
- fakta Handymate använder
- varför ett kundrelaterat förslag ges

## Guardrail

Kunden ska inte framställas genom spekulativa personbedömningar.

Prioritera verifierbara fakta, historik och obligations.

## Definition of Done

Användaren ska kunna förstå:

> vad Handymate vet om relationen, vad som är öppet och vad nästa administrativa steg är.

---

# SLICE 5 — Explainability Layer

## Goal

Gör Handymates rekommendationer förtroendeingivande.

Standardmönster:

> **Varför säger Handymate detta?**

Visa:

- source objects
- konkreta datum
- accepterad offert
- kundmeddelande
- arbetsrapport
- status
- affärsregel

Undvik:

- modellens fria resonemang
- ogrundade tolkningar
- tekniska AI-termer

## Definition of Done

Minst de viktigaste recommendation/approval-flödena har begriplig, objektbaserad evidens.

---

# SLICE 6 — Proof of Work / Value Receipts

## Goal

Gör redan utförd administration tydligt värdefull för kunden.

## Exempel

### Medan du arbetade idag

✓ 4,5 h registrerades  
✓ material lades till  
✓ ett kundlöfte bevakas  
✓ två offerter följdes upp  
✓ ett fakturaunderlag blev komplett

> Du behövde fatta två beslut. Handymate hanterade resten.

Endast om underlaget stödjer påståendet.

## Audit requirement

Undersök befintlig receipt/value/audit-infrastruktur innan ny representation skapas.

## Definition of Done

Verifierade actions går att presentera som meningsfull proof-of-work nära den kontext där kunden upplever nyttan.

---

# SLICE 7 — Mobile Brain Visibility

## Goal

Kunden ska känna samma operativa intelligens i fickan.

Prioritera:

- dagens jobb
- Matte
- röst
- arbetsrapport
- tid
- material
- möjligt ÄTA
- kundlöfte
- nästa steg
- approvals
- receipts

## Product principle

Ideal field interaction:

> öppna mobilen  
> säg vad som hände en gång  
> granska vid behov  
> tillbaka till jobbet

## Definition of Done

Minst de mest frekventa field flows visar korrekt brain state och fungerar autentiserat i faktisk app/build.

---

# SLICE 8 — Field Command 2.0 / Say It Once

## Goal

Utöka befintligt substrat, inte greenfield-bygg.

Exempel:

> “Klart hos Andersson. Jag och Johan körde tre timmar. 15 meter kabel. Kunden ville ha två extra uttag och vi lovade att komma tillbaka på tisdag.”

Handymate föreslår ett reviewable multi-action package.

## Default scope

Efter audit, återanvänd:

- transcribe
- Matte
- project resolution
- time
- material
- work report
- booking/promise
- ÄTA
- approval
- receipt

## Definition of Done

En verklig fälthändelse dokumenteras en gång och blir korrekt, idempotent state genom befintliga domänmotorer.

---

# SLICE 9 — Money Brain

## Goal

Gör Handymates ekonomiska intelligens konkret.

Inventera först vad som redan finns.

Prioriterad möjlig expansion:

### Invoice Readiness
Kan jobbet faktureras nu?

### Revenue Rescue
Vilka pengar riskerar att försenas eller tappas?

### Change Order Radar
Vilket utfört/efterfrågat arbete kan ligga utanför accepterad scope?

## Definition of Done

Handymate kan inte bara visa ekonomiska KPI:er utan förklara:

- vad som blockerar pengar
- vad den kan lösa
- vad användaren måste besluta
- vad som faktiskt flyttades framåt

---

# SLICE 10 — Full Journey Proof

Programmet avslutas inte med UI.

Slutbevisa minst följande kundresor.

## Journey A — Lead → Quote → Customer → Project

**förfrågan  
→ agentarbete  
→ offertutkast  
→ approval  
→ skickad offert  
→ bevakning  
→ uppföljning  
→ kundrespons  
→ stop condition  
→ projekt  
→ receipt**

Kunden ska se hjärnan genom resan.

## Journey B — Field Work → ÄTA

**mobil/röst  
→ arbetsrapport  
→ tid/material  
→ möjligt extra scope  
→ review/approval  
→ ÄTA  
→ kundbeslut  
→ receipt**

## Journey C — Work → Money

**klart jobb  
→ fakturaunderlag  
→ ROT/RUT  
→ faktura  
→ Fortnox/ekonomisystem  
→ provider/result  
→ receipt**

## Definition of Done

Resorna är:

- autentiserade
- tenant-säkra
- reload-säkra
- retry-säkra
- sanningsenliga
- visuellt begripliga
- testade genom faktisk relevant UI/mobile/provider

---

# 11. Vad Codex INTE ska göra denna helg

Om inte en blockerande lucka absolut kräver det:

- bygg inte ny generell agentarkitektur
- bygg inte ny generell memory engine
- bygg inte nytt generellt event-system
- bygg inte ny knowledge graph
- bygg inte Hantverkspoolen
- bygg inte nya stora roadmap-features
- bygg inte ny KPI-dashboard
- bygg inte agent-avatar-teater
- bygg inte gamification
- bygg inte om onboarding från grunden
- byt inte canonical source of truth för att förenkla UI
- gör inte bred estetisk redesign utan brain-value
- skapa inte fake demo states i produktion

Default denna helg:

> **CONNECT → ACTIVATE → EXPOSE → PROVE**

---

# 12. Onboarding under helgen

Nuvarande onboarding ska inte automatiskt byggas om.

Fokus:

> **PROVE before REBUILD**

Verifiera att en ny användare kan gå från:

**ny kund  
→ företag förstått  
→ riktig data sparad  
→ första verkliga nyttan**

Notera friktion.

Endast launch-blockerande problem ska fixas direkt.

En större Matte-led onboarding V3 ska baseras på riktig observation efter launch/cold-user test, om det fortfarande behövs.

---

# 13. Claude + Codex arbetsmodell

Ingen hård regel:

- Claude = UI
- Codex = backend

I stället:

## Vertical owner

Den agent som får en slice äger hela vertikalen där den har förmåga att arbeta säkert.

## Cross-review

Den andra agenten granskar mot:

- architecture
- canonical writes
- truth semantics
- security
- approvals
- idempotency
- partial failure
- UI truthfulness
- customer value
- mobile relevance

## Regel

> Arkitekturen och integrationskontraktet bestämmer gränsen, inte vilket agentnamn som gjorde ändringen.

---

# 14. Session boot protocol

Varje ny Codex-session ska börja med:

1. Läs detta dokument.
2. Läs aktuell `main`.
3. Läs aktuell `ARCHITECTURE.md`.
4. Läs relevanta launch/task-dokument.
5. Läs `CURRENT PROGRAM STATE` längst ner i detta dokument.
6. Kontrollera senaste commits/ändringar från föregående slice.
7. Bekräfta att verklig runtime fortfarande stämmer med dokumenterad status.
8. Fortsätt på `NEXT ACTION`.

Ingen ny strategiplan ska produceras om inte faktisk verklighet gör planen ogiltig.

---

# 15. Session close protocol

Innan en session avslutas ska Codex uppdatera detta dokument med:

## DONE
Vad blev faktiskt klart?

## REUSED
Vilka befintliga primitives återanvändes?

## NEW
Vad behövde byggas och varför?

## VERIFIED
Vad har faktiskt testats?

## NOT VERIFIED
Vad ser rätt ut men saknar riktig proof?

## CUSTOMER IMPACT
Vad kan kunden nu se/förstå/göra som den inte kunde före ändringen?

## RISKS
Nya eller kvarvarande risker.

## STATUS CHANGES
Vilka capability-statusar ändrades?

Exempel:

`Quote Follow-up: CONNECT → PROVE`

## NEXT ACTION
Exakt nästa vertikal eller blocker.

---

# 16. Testing gate per slice

En slice får inte markeras SCALE enbart utifrån unit tests.

Bedöm åtminstone:

### DOMAIN
Är affärsreglerna rätt?

### TENANT
Kan data läcka mellan företag?

### PERMISSIONS
Kan rätt roller göra/läsa rätt sak?

### IDEMPOTENCY
Tål actions retry/dubbelklick?

### PARTIAL FAILURE
Är state sanningsenlig om bara delar lyckas?

### UI
Visas korrekt state?

### RELOAD
Finns state kvar?

### MOBILE
När relevant.

### PROVIDER
När påståendet kräver extern provider.

### CUSTOMER JOURNEY
Kan en verklig användare genomföra flowet?

---

# 17. Brain Visibility copy rules

Språket ska vara konkret.

## Föredra

> Kunden öppnade offerten igår.

> Daniel följer upp fredag.

> Väntar på kundens svar.

> Två extra uttag verkar ligga utanför accepterad offert.

> Fakturaunderlaget saknar 3 timmar.

> Karin har förberett fakturan.

## Undvik

> AI insights generated.

> Smart analysis completed.

> Agent workflow active.

> Confidence score: 0.87.

> Handymate thinks...

Kunden ska förstå affärshändelsen, inte modellen.

---

# 18. Agent presence rules

Agentnamn får användas där ownership ökar begriplighet.

Exempel:

> Daniel bevakar offerten.

> Karin förbereder fakturan.

Men agentpersonligheter får inte ersätta korrekt state.

Bra:

> Daniel följer upp offerten fredag enligt er regel.

Sämre:

> Daniel jobbar hårt i bakgrunden! 🤖

Agents should feel like accountable roles, not mascots.

---

# 19. Home / Mission Control design hypothesis

Detta är en hypotes som ska valideras mot befintliga primitives.

En möjlig struktur:

# Firman är under kontroll

### Hanterat
Verifierade completed actions.

### Arbetar med
Pågående/bevakade riktiga items.

### Väntar på
Extern part eller future trigger.

### Behöver dig
Riktiga approvals/decisions.

### Pengar
Ekonomiska states som förtjänar uppmärksamhet.

### Senaste resultat
Värdekvitton.

Målet är INTE att skapa fem nya datamodeller.

Dessa ska härledas från befintlig canonical state där möjligt.

---

# 20. Pitch test

Varje större Brain Visibility-förbättring ska klara denna fråga:

> Om vi delar skärmen med en potentiell kund, kan vi visa varför Handymate är något mer än ett vanligt affärssystem med AI-chat?

Bra demo:

> Handymate såg detta.  
> Den gjorde detta.  
> Den väntar på detta.  
> Du behöver bara besluta detta.  
> Här är varför.  
> Här är resultatet.

Om förbättringen inte stärker produktupplevelsen eller denna berättelse bör den sannolikt inte prioriteras denna helg.

---

# 21. Adoption efter launch

När riktiga kunder finns måste Brain Visibility mätas.

Exempel på senare mätpunkter:

- hur många intelligenta ytor kunden faktiskt möter
- hur många recommendations som öppnas
- hur många approvals som går till handling
- hur ofta explainability öppnas
- vilka kvitton som leder till fortsatt användning
- vilka smarta capabilities som aldrig triggas
- vilka capabilities som triggas men aldrig syns
- vilka capabilities kunden korrigerar ofta

Använd befintligt adoption-mått om det redan är canonical.

Bygg inte ett separat metricsystem denna helg om det redan finns.

---

# 22. Cost gate

Brain Visibility får inte automatiskt innebära dyrare produktion.

För varje ny LLM-baserad presentation:

Dokumentera:

- model/anrop
- triggerfrekvens
- om output kan cacheas
- om samma analys redan görs
- ungefärlig per-business cost-risk
- om deterministisk state hade räckt

Detta är särskilt viktigt för:

- Home
- Company Scan
- Next Best Action
- Project summaries
- customer summaries
- recurring scans

---

# 23. Fortnox + ROT/RUT

Dessa är inte sidointegrationer i produktlöftet.

För målgruppen är de del av back office-kedjan.

Brain Visibility ska därför kunna göra sista metern till pengar begriplig.

Exempel:

> Fakturan är klar.

> ROT-underlaget är komplett.

> Skickad till Fortnox.

> Fortnox accepterade fakturan 14:08.

eller, om blockerat:

> Fakturan kan inte skickas ännu. Personnummer saknas för ROT.

All copy måste följa faktisk state.

---

# 24. Launch safety

Brain Visibility-arbetet får inte destabilisera launch.

Om en förbättring kräver stor förändring i:

- auth
- payment
- onboarding
- invoice core
- ROT/RUT core
- Fortnox core
- critical approval engine
- tenant model

ska den först bedömas mot launchrisk.

Visual/read-model improvements kan prioriteras före farlig core-refactor.

Men felaktig canonical business logic som blockerar huvudresorna ska fixas.

---

# 25. Definition of success för helgen

Helgen är framgångsrik om vi på söndag kväll har:

1. en sann Capability Reality Audit
2. tydlig separation mellan BUILD / CONNECT / ACTIVATE / EXPOSE / PROVE / SCALE
3. gjort ett antal av de högst värderade befintliga intelligensförmågorna kundsynliga
4. förbättrat Home/Mission Control så att hjärnan känns närvarande
5. förbättrat minst offert- och jobbupplevelsen med riktig brain state
6. gjort recommendations mer explainable
7. produktiserat verkliga receipts bättre
8. inkluderat mobile där relevant
9. verifierat de viktigaste ändringarna E2E
10. lämnat en uppdaterad, sann arbetskö för nästa vecka

Framgång mäts INTE i antal commits eller antal nya features.

---

# 26. Slutmål för kundupplevelsen

Kunden ska kunna öppna Handymate och känna:

> **Firman är under kontroll.**

> Jag ser vad Handymate har gjort.

> Jag ser vad den arbetar med.

> Jag ser vad den väntar på.

> Jag ser exakt vad den behöver från mig.

> Jag förstår varför.

> Jag ser vad resultatet blev.

Och sedan gå tillbaka till sitt riktiga arbete.

---

# 27. CURRENT PROGRAM STATE
## Detta avsnitt SKA uppdateras löpande av varje session

### PROGRAM
Brain Visibility Weekend

### DATES
2026-09-11 → 2026-09-13

### OVERALL STATUS

Slice 0 klar som audit. Kod för veckorapportens tillförlitlighet samt delar av slice 1 och 2 är implementerad och lokalt verifierad. Slice 1/2 är INTE stängda enligt sina Definition of Done; preview, verklig kundresa och externa providerbevis återstår.

| Del | Aktuell status | Kvar före stängning |
| --- | --- | --- |
| Slice 0 — audit | Klar för att styra nästa bygge | Osäkra runtime-rader behåller sin osäkerhet; matrisen uppdateras vid nya bevis |
| CONNECT före Home | Veckorapportskod och lokala tester klara; driftblocker kvar | Nummer/saldo, avstämning av fyra äldre rapportfel, verifierad leverans |
| Slice 1 — Home | Första läsyta byggd; slutkriterier ej verifierade | Verklig användare förstår läget inom 10 sekunder; UI, reload, roller och företagsbyte i preview |
| Slice 2 — Quote | Befintlig handoff utökad med rundbundet kvitto; slutkriterier ej verifierade | Verklig offert genom skickad, bevakad, uppföljd, kundrespons och stoppvillkor |
| Slice 3 — Project | Avgränsad tidrapport-rättning verifierad i inloggad preview | Korrekt rapport-/underlagsstatus, nästa steg och verklig UI-verifiering |
| Slice 4 — Customer | Kundminne, uppgifter och nästa bokning publicerade; slutpaket för offert/ärenden/nästa steg publicerat och previewverifierat | Verkligt roll-/företagsbyte samt smal webbvy kvar. Se `docs/brain-visibility/SLICE_4_CLOSURE.md`. |
| Slice 5–10 | Inte påbörjade som fulla slices i denna session | Respektive leverans och testgrind; avgränsad mobilbrygga finns |

Arbetsordningen var CONNECT → Quote (2) → Home (1), enligt auditöverlämningens NEXT ACTION. Det är ingen strikt sekventiell stängning av slices: kodarbetet fortsatte medan externa CONNECT-blockerare kvarstod. Ingen slice markeras SCALE på basis av lokala tester.

### CURRENT SLICE

Slice 4 — Customer. Användarens aktuella instruktion är att stänga slice 4 innan slice 5 påbörjas. Slutpaketet är publicerat och inloggad preview verifierad; roll-/företagsbyte och smal webbkontroll återstår. Användarens kvotoro innebär ingen ytterligare breddning före dessa grindar och därefter prioritering efter lanseringsnytta. Öppna externa grindar för övriga slices behålls. Slice 4 får inte markeras stängd enbart på basis av kod och isolerade tester.

### LAST COMPLETED — historisk auditbaseline

Skiva 0: matris med 25 rader, statusfördelning SCALE 1 / EXPOSE 4 / ACTIVATE 6 / PROVE 11 / CONNECT 1 / BUILD 0. Lokal katalog synkad till origin/main 64484e11; typkontroll grön (kräver `--max-old-space-size=8192`).

### VERIFIED

Kodinventering mot origin/main; runtime-antal ur prod; cron-lista; anropare för `lib/agent/*`, DayClose → dagsavslut, automation-engine.

### NOT VERIFIED

Mobilappens byggstatus (separat repo); om `auto-approve*` respekterar `routing.ts`-grindarna; om `pdf-preview.ts` (pdfjs-dist) fungerar i prod-build.

### STATUS CHANGES

Alla 25 rader: AUDIT → (se matris). Två rättelser mot förhandsversionen: Work Report CONNECT → PROVE (inkopplat via DayClose); "lib/agent död" → 4 filer döda, resten levande.

### OPEN RISKS

- 53 tysta fel + trasig veckorapport gör varje "hanterat"-påstående osant tills de är lagade.

- Fjärde Home-ombyggnaden på två månader om skiva 1 inte hålls till läsmodell.

- 1264 LLM-kostnadshändelser/30 d utan en riktig kund; Matte-chat utan tak.

- GO-förutsättningarna (46elks, Stripe live, VAPID, Google, schemafix, Fortnox) ligger utanför programmet men blockerar all PROVE.

### NEXT ACTION — överlämningens prioritering, aktuell checkpoint nedan

1. CONNECT: töm tysta fel, laga veckorapporten (Fable, ~2 h).

2. EXPOSE: Quote Brain-läsmodell på offertsidan ur `followup-round.ts` + `v3_automation_logs` (Codex, ~4–5 h).

3. EXPOSE: Home-läsmodell med fem states ur befintliga källor, `failed` räknas aldrig som hanterat (Fable, ~5–6 h).

4. ACTIVATE: standardprinciper + mål i genomgången (~2 h).

5. Astra-beslut: ROT-väg; `auto-approve*` vs `routing.ts`.

### CODEX CHECKPOINT 2026-09-10

Dokument infogade mot main `3ae0029`; initial dokumentcommit `87d3355`. Runtimekontroller och begränsningar i §7.1. Arbetsordningen följer auditens §8 (CONNECT → Quote → Home), eftersom sanningsenlig leveransstatus krävs före Home-claims.

**DONE / REUSED:** veckorapporten återanvänder SMS-sändaren, värdekärnan och `automation_activity` för en atomär veckoreservation och separata auditposter. Inga nya tabeller. Fail-closed för fel i paus-, dedupe- och rapportunderlag. Bara bevisat utebliven sändning tillåter retry. Osäkert providersvar eller success utan provider-id låser för avstämning. Legacy-fel omsänds inte automatiskt.

**VERIFIED:** separat veckorapport-harness för samtidighet/retry/timeout/5xx/saknat provider-id/auditfel grön. Samlad körning: 132 tester gröna (Home, dygnsdigest, autopilot-rapport, strict-read, Quote Brain, first-value-production och durable-followup). Slutlig `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit` grön. Testerna kör faktisk logik/rutthanterare med kontrollerade beroenden; vissa befintliga kontraktstester granskar källkod. Detta är inte webbläsar-E2E. Produktion endast SELECT för audit/schema.

**NOT VERIFIED / RISKS:** inga riktiga utskick; 46elks-saldo/telefonnummer och gamla fyra misslyckade veckorapporter kräver extern åtgärd/avstämning. Inga historiska fel raderade. Inga capability-statusar uppgraderade.

**QUOTE — KOD IMPLEMENTERAD / LOKALT VERIFIERAD:** befintlig handoff-kedja läser tre deterministiska rundkort för aktuell sent_at och visar senaste sändkvittens med giltig exekveringstid och kanalens artifact-id. Ingen ny endpoint eller skrivning från GET. Oberoende Astra-review klar; 25 riktade offert-/routetester gröna. Kvittot påstår inte läsning hos kund. Reliability-review klar.

**LOKALA COMMITS:** dokument `87d3355`, reliability `ed0345a`, Quote `3ef6c3d`, Home `c6b24a3`, på `codex/brain-visibility-weekend-20260910`. Användaren har uttryckligen godkänt push av branchen inklusive auditdokumenten till det publika repot. Merge/deploy har inte utförts.

**HOME — KOD IMPLEMENTERAD / ÅTERANVÄNDNING:** fem kategorier via liten presentationsadapter och befintliga källor. Kö/NBA-läsfel visas uttryckligt; inga ovillkorliga allt-hanterat-claims. Hanterat begränsas till visade aktivitetsrader med identifierat leveransbevis, inte optimistiska beslut eller generiska agent-successes. Uppföljningar filtreras på `scheduled` i befintlig handover; pengakategorier summeras inte till kronor. Hela dashboardinnehållet återställs per företag/användare; relevanta läsningar uppdateras vid fokus. Befintliga API:er kompletterade med fullständighetsinformation. Astra-slutreview klar efter rättning av tidsfönstertext. UI-översikten är en första läsyta; inte bevis för att alla launch-förmågor är aktiva.

**LOKAL KÖRMILJÖ:** lokal Chromium avbryts med SIGTRAP. Molnwebbläsaren ansluter, men lokal serveradress blockeras med ERR_BLOCKED_BY_CLIENT. Försök att starta Next dev avbröts i Sentry instrumentation (`uv_resident_set_memory`, ENOENT). Ingen fungerande appserver eller browser-/mobilverifiering kan därför påstås. Slutligt `npm run build` mot Home-commit `c6b24a3` avslutades med exitkod 0 (325/325 sidor genererade). Byggloggen innehåller ändå saknad Supabase-konfiguration och befintliga metadata/dynamic-render-varningar. Grönt bygge är därför inte bevis för fungerande inloggning eller runtime i denna miljö.

**NEXT ACTION:** skapa åtkomlig preview av arbetsbranchen med korrekt testkonfiguration och testkonto; kör riktiga Home/Quote-resor inklusive omladdning, läsfel, företagsbyte och smal skärm. Avstäm därefter de fyra legacy-veckorapporterna mot provider före eventuell omsändning och åtgärda nummer/saldo. ROT-exklusivitet och legacy suggestions-tenantgrind kvarstår före launch. Tidigare push blockerades av automatisk säkerhetsgranskning; användaren har därefter uttryckligen godkänt publicering av branchen inklusive auditdokumenten. Nästa publiceringssteg är push och draft-PR, inte merge till main.

### PREVIEWKONTROLL 2026-09-10 — PR #38

Preview för GitHub-commit `c11f205f1a9bc313e1e483ccb01bbfce1291efc8` är byggd. Alla rapporterade GitHub-checkar är gröna, inklusive befintliga webbläsarprov med simulerade API-svar och tester mot tillfällig Postgres. Detta är inte samma sak som hela kundresan mot verkliga providers.

Inloggad browserkontroll har nu genomförts i previewn, efter Vercels åtkomstkontroll och Handymates egen inloggning. Home laddar och visar den begränsade beslutskön. En accepterad testoffert visar registrerad accept och projektplanering som nästa steg, även efter reload. En öppnad testoffert visar uttryckligt att nästa uppföljningstid inte kan bekräftas. Offertvyn har ingen horisontell overflow i testad desktopbredd (1363 px). Inga beslut godkändes och inga utskick initierades.

Två konkreta fel hittades och har rättats i nästa avgränsade ändring:

- Aktivitetsrutten väljer `communication_log.ai_reason`, som inte finns i verifierat prod-schema. Läs befintliga meddelandefält i stället; ingen migration.
- Home blandar laddning med läsfel och visar läsfel för väntansläget även när avsaknad av aktivt uppdrag är känd. Skilj laddning, känt tomt uppdragsläge och fel utan att påstå att hela firman saknar väntande saker.

Rättningarna har fokuserade regressioner i befintlig CI: faktisk aktivitetsrutt mot verifierat kolumnkontrakt, Home laddning/tomt/fel och UI-prov för laddning → tomt samt offertkvitto. Aktivitetsruttharnessen och sju Home-tester är lokalt gröna. Efterkontroll av preview-commit `e18199e`: Home laddar aktivitetsläget utan fel, visar känt tomt uppdragsläge och två synliga beslut. Reload visar först laddningstext och sedan aktuellt läge. Nya UI-proven för Home och offertkvitto är gröna i CI. Kontraktsgrinden fångade en skillnad mellan lokal testlista och workflow-lista; listorna synkas och aktivitetsruttharnessen läggs även i workflowen. Slice 1 och 2 är fortfarande öppna: positiv sändkvittens med verklig provider, komplett kundresa, byte mellan två företag och mobilapp är inte bevisade här.

### CHECKPOINT — OMBOKNING OCH NÄSTA SLICE

Alla 13 rapporterade CI-checkar för `1d0e22b` är gröna, inklusive den synkade kontraktsgrinden. Därefter har legacy-ombokningen fått företagsfilter både vid läsning och uppdatering av uttryckligt booking_id. Läsfel, saknad bokning, skrivfel och noll uppdaterade rader ger misslyckat resultat utan SMS. Bekräftelse kan skickas först när uppdateringen returnerat en bokning inom samma företag. Fem isolerade regressioner kör faktisk POST-hanterare och är gröna; harnessen ingår i befintlig `test:six-outcomes`. Inget verkligt SMS skickat; detta bevisar den avgränsade tenantgrinden, inte hela legacy-flödets samtidighet eller leverans.

Project är inspekterad inför nästa brief, inte nybyggd: återanvänd `project-reality.ts`, `derive-todo.ts`, befintliga status-/ekonomikomponenter och projektets nästa steg. Ingen parallell ekonomimodell eller ny motor. Större visuell designöversyn kommer efter kärnflödena; begriplig status, nästa steg och mobil användbarhet tillhör varje slice. Slice 1/2 och provider-/företagsbyte-/mobilgrindarna ovan är fortfarande öppna.

### PROJECT — AVGRÄNSAD SANNINGSRÄTTNING

**OBSERVERAT:** inloggad preview av befintligt testprojekt visade ”Tidrapport i går — Klar” samtidigt som senaste tidrapport var fyra dagar gammal. Kodgranskningen visade att både ingen tillämplig bokning och misslyckade läsningar kunde tolkas som klar rapport.

**IMPLEMENTERAT / ÅTERANVÄNT:** samma gårdagsuppslag och `findProjectsMissingTimeEntry` ligger kvar. Läsfel/laddning är okänt, inga genomförda bokningar innebär ej tillämpligt och räknas inte som färdig rapport. Bara genomförd bokning med matchande tidrapport ger klar tidrapport. Äldre svar vid projekt-/företagsbyte ignoreras. Befintlig fakturaberedskap visar granskningsbehov när tidrapportbeviset är okänt, även om tillgängliga övriga delar ger 100 procent. Ingen fakturering eller annan skrivning har lagts till.

**VERIFIERING:** 57 fokuserade tester gröna, inklusive faktisk asynkron callback med läsfel, tomt svar, ogiltigt null-svar och äldre svar efter ny läsning. Typkontroll grön före testkompletteringen. De två befintliga rapportspecifikationerna är tillagda i både lokal kontraktslista och CI-lista; paritetsgrinden är grön. Ombokningscommit `f14390c` är grön i samtliga 13 CI-checkar. Project-rättningen är ännu inte bevisad i uppdaterad preview. Publiceringsförsöket via GitHub create_tree/create_blob gav ett serialiseringsfel för den stora projektfilen; önskat träd kunde inte hämtas efteråt. Överföringen återhämtades efter uttryckligt användargodkännande via GitHubs webbeditor till `codex/project-time-transfer-20260910`. Filens blob-SHA `39fcccbff649212b4091388f7db45a3b3d7496b0` matchar den testade lokala filen exakt. Komplett paket sammanförs i PR #38; efterföljande CI och previewkontroll återstår. Lokal implementation är committad som `f625ad6`.

**LIVE-CHECKPOINT:** komplett kod på GitHub `ffb29cf3d471d93a22636533593dd56114fd56ef`, samtliga 13 CI-checkar gröna och båda Vercelbyggena gröna. Samma inloggade testprojekt visar nu ingen falsk ”Tidrapport i går — Klar”, även efter full omladdning. Befintlig blockerare ”Nej — 1 delmoment kvar” och nästa steg ”Rapportera tid” kvarstår. Inga godkännanden, utskick eller produktionsskrivningar genomfördes.

**KVAR / NÄSTA STEG:** fortsätt Project-granskningen av vad Handymate bevakar, vad användaren behöver göra och vilket underlag som saknas; återanvänd befintliga komponenter och motorer. Slice 3 är inte stängd: detta rättar tidrapportbeviset, inte hela projektets administrativa läsmodell eller fullständig fakturaberedskap. Övriga slice 1/2-, provider- och mobilgrindar kvarstår. Inga capability-statusar uppgraderade.

### PROJECT — BESLUT OCH NÄSTA STEG

**OBSERVERAT:** ProjectApprovalsBlock läste företagets första 50 väntande beslut och filtrerade först därefter på projekt, vilket kunde dölja äldre projektbeslut. Läsfel kunde bli ett tomt block. Inloggad preview visade dessutom badge 4 för två beslutsförslag plus två vanliga nästa steg.

**AVGRÄNSNING:** behåll `/api/approvals`, tenantfilter, `canActOnApproval` och befintlig gransknings-/godkännandeväg. Filtrera projektets payload före paginering, visa delvis lista med fortsatt läsning och skilj okänt/fel från verifierat tomt. Beslutsantal ska avse beslut; vanliga åtgärdsrader visas som nästa steg. Ingen ny motor eller tabell, inga verkliga beslut/utskick i regressionerna.

**STATUS:** implementerat med projektfilter i befintlig GET, tydlig fortsatt läsning, synliga fel/återförsök, skydd mot äldre svar och omläsning från sida ett efter beslut. Badge räknar beslut; åtgärdsrader ligger under Nästa steg. Typkontroll och 18 riktade tester gröna, inklusive faktisk GET och asynkron läscallback. Nya regressioner är inkopplade i både lokal kontraktslista och workflow; separat körning av ny spec och paritetsgrind är grön (8/8). GitHub-kodcommit `3ca682f63c07f6b34a9fc2bde9f7ee3b94ec0464` har samtliga 13 CI-checkar och båda previewbyggen gröna. Inloggad kontroll av samma testprojekt visar två beslut (tidigare badge fyra), separat Nästa steg och samma resultat efter full omladdning. Tidrapportens tidigare falska klarstatus är fortsatt borta. Förberedelsevyn verifierades också: inget kommande bokat besök ger tydligt besked och kalenderlänk. Inga beslut eller utskick genomfördes. Live-företagsbyte, mobil och verklig kö med fler än 50 projektbeslut är inte bevisade; paginering och sena svar har isolerade regressioner. Detta stänger inte hela Project-slicen.

### PROJECT — TYDLIG GRANSKNING

Projektkorten återanvänder nu API:ets gemensamma `approvalDisplay` med samma kanoniska fallback, i stället för egna agent-/typkartor. Effektfulla ärenden öppnas med ”Granska”, informationskort med ”Jag har läst det”, och redigerat innehåll med ”Granska ändring”. Det ovillkorliga ”Skickas efter ditt OK” är ersatt av neutral väntansstatus. Befintlig granskningsdialog och servergrind är oförändrade. Tio riktade presentation-/läsregressioner och typkontroll är gröna; publicerad preview och avbruten granskning återstår vid denna checkpoint. Inga capability-statusar uppgraderade.

### UTÖKAT SCOPE — ALLA GODKÄNNANDEKORT

Användaren har uttryckligen begärt korrekt struktur för alla korttyper och ytor, inklusive informationskort utan Godkänn. Se `docs/brain-visibility/APPROVAL_CARD_SURFACE_AUDIT.md`. Samma befintliga klassificering/granskningsväg ska styra webb och mobil. Webbpaketet är lokalt implementerat över de kartlagda kortytorna: kanoniska primär-/redigerings-/paketetiketter och klassmedvetna gruppetiketter, med 17 riktade tester inklusive CI-paritet och typkontroll gröna. Paketet är publicerat i dashboard-PR #38, commit `29f778bad29a3b1f4186ceea96314c557952d778`, med exakt samma träd som lokalt. Mobilbryggan är publicerad i separat draft-PR `Ahogberg/handymate-mobile#8`, commit `8cc43b6815b645e1bbe97ea42af75765ac18b696`. Lokal kontroll av faktiska ApprovalCard visar att beslut/okända klasser endast öppnar webbgranskning, informationskort kvitteras och misslyckad länk inte tar bort kortet. CI, uppdaterad webbpreview och faktisk mobilbuild redovisas separat. Användaren godkände uttryckligen publicering av hela paketet inklusive arbetsplan/tester efter automatisk granskningsblockering. Native mobilgranskning ersätts inte med ogrundad direktgodkänning.

### LIVE-CHECKPOINT — GEMENSAM KORTPRESENTATION

Dashboard-kod `29f778bad29a3b1f4186ceea96314c557952d778`: alla 13 CI-checkar och båda Vercelbyggen gröna. Inloggad Project-preview visar två Granska-knappar; första SMS-kortet öppnar serverns dialog och Tillbaka lämnar båda korten kvar. Ingen slutlig bekräftelse eller sändning utfördes. Mobil-PR #8 har grön fokuserad Jest-CI; faktisk mobilbuild kvarstår. En missvisande konsekvenstext i webbgranskningen (”skickas nu” före bekräftelse) identifierades och har rättats till villkorad formulering för meddelanden, kampanjer och interna handlingar. Nio befintliga granskningsregressioner passerar; textuppföljningen `463ab7b7fa4c76312584f7cc0acd993887c78803` har samtliga 13 CI-checkar och båda Vercelbyggen gröna. Inloggad dialog visar nu ”När du bekräftar skickas meddelandet via SMS.” Tillbaka lämnar båda korten kvar. Godkännandesidan visar också korrekt Granska på sina tre väntande effektkort. Ett historiskt checklistfel syns i kvittensen; read-only schemakontroll visar att order_id numera är nullable. Det gamla felet är därför inte bevis för en kvarvarande NOT NULL-blocker och ingen automatisk retry utförs.

### SLICE 4 — FÖRSTA VERTIKAL: SANNINGSENLIGT KUNDMINNE

**OBSERVATION:** inloggad kundvy har historik och statistik men saknar samlad öppen/nästa-status. Befintlig facts-route svarar 200/tom lista vid DB-fel och kundsidan döljer då minnet. Deadline och uppfyllandestatus finns i customer_fact men visas inte.

**BESLUT/AVGRÄNSNING:** börja med befintligt kundminne: skilj laddning, läsfel med återförsök och verifierat tomt; visa bekräftade aktiva fakta, källcitat/datum och lagrad löftesstatus. Separera kund-/företagssessioner så sena svar inte visar föregående kund. Återanvänd facts-route och befintlig borttagning. Ingen ny motor/tabell eller bred kundmodell med fem nya läskällor. Ingen slutsats om personlighet eller att ett passerat datum betyder brutet löfte.

**RUNTIMEUNDERLAG:** read-only schema bekräftar due_at, promise_status, fulfilled_at, confirmed_at, evidence_quote och källreferenser. Aktiva fakta är två kontaktfakta och en preferens, samtliga bekräftade; inga aktiva löften finns att verifiera live. Löftesgrenar provas isolerat. Legacy-kundsidans övriga läsningar och tidslinjens ofullständighetsrisk kvarstår; denna vertikal stänger inte slice 4.

**LOKAL STATUS:** första kundminnesvertikalen implementerad. Fyra nya route-/loader-/löftesstatusregressioner samt CI-paritet passerar; typkontroll och diffkontroll gröna. Den äldre customer-facts-specens API-assertion har uppdaterats för synliga fel. Fyra andra äldre assertions om approval-write-kodens textfönster faller efter tidigare refaktorering; dessa är inte en del av nya minnesgrinden och lämnas som separat testskuld. Projektvyns separata minneskonsument döljer fortsatt läsfel. Ingen faktisk löftesuppfyllelse eller borttagning testad i produktion.

**PUBLICERINGSBLOCKER:** automatisk säkerhetsgranskning avvisade uppladdning av kundminnespaketet till publika `Ahogberg/handymate-dashboard`, eftersom senaste uttryckliga godkännandet bedömdes gälla föregående kortpaket. Kundminneskoden är lokalt committad som `845abf6` och inga branchändringar för den har publicerats. Ny uttrycklig bekräftelse för kundminneskod, arbetsplan och tester krävs enligt granskningsbeslutet. Befintlig publicerad head är `463ab7b7fa4c76312584f7cc0acd993887c78803`, alla 13 CI-checkar/båda previews gröna; mobil-PR #8 är grön i fokuserad Jest-CI. Användaren har därefter uttryckligen godkänt publicering av kundminnesändringen inklusive styrdokument och tester i PR #38. Publicering och preview-kontroll återupptas.

### LIVE-CHECKPOINT — KUNDMINNE

Kundminneskod publicerad som `fae59443be930d4340f8ffc880aeb0dceb0fb696` i PR #38 med exakt trädmatchning mot lokal kod. Alla 13 CI-checkar och båda Vercelbyggen gröna. Inloggad testkund visar nu ”Det här vet Handymate” och ”Inga bekräftade kundfakta finns ännu”, även efter full omladdning. Ingen produktionsskrivning, borttagning eller löftesuppfyllelse utförd. Löftesstatus och läsfel/sena svar har isolerade regressioner; fyllda löftesrader och verkligt företagsbyte är inte livebevisade.

### NÄSTA AVGRÄNSNING — ÖPPNA UPPGIFTER OCH NÄSTA BOKNING

Read-only audit genomförd efter kundminnets publicering. Återanvänd task-API med resolveTaskScope/canSeeTask och separata läslägen per källa. Kundfiltrerad bookings-GET behöver först inkludera tenantägda projektkopplade bokningar, inte bara direkt customer_id; projektläsfel får inte ge falskt tomt. Kommande aktiv bokning avgörs från lagrad status och schematid; avbokade/avslutade jobb exkluderas. Varje yta ska ha källänk, begränsad lista, tydligt tomt/fel och skydd mot sena svar. Befintliga legacy-tabräknare får inte användas som verifierat underlag. Tvåkällorsvyn är nu implementerad och lokalt granskad. Task-summary använder befintlig actor-/privatsynlighet före sortering och fyraradersgräns, visar tre och flaggar fler; okänd roll eller misslyckad projektledarläsning ger synligt fel. Bokningsläsningen räknar tenantägda kundprojekt, stoppar vid ofullständigt eller över 500 projekt, inkluderar bara null-customer-projektbokningar utöver direkt kopplade och utesluter avslutat/avbokat före gränsen. Indata-ID interpoleras inte i rå filtergrammatik. Separata läslägen och sena-svar-skydd behålls. Inga skrivflöden ändrade. 13 riktade tester, typkontroll och diffkontroll passerar. Faktiska route-harnessar provar privata rader före synliga, scopefel, avslutade jobb och motstridiga kundkopplingar; publicerad preview för tvåkällorsvyn återstår.

**PUBLICERINGSBLOCKER — TVÅKÄLLORSVYN:** lokal kodcommit `a9f6e3b`, 13 riktade tester/typkontroll gröna. Automatisk säkerhetsgranskning avvisade uppladdning av detta nya paket (kod, tester och uppdaterad roadmap) till publika `Ahogberg/handymate-dashboard`, med skälet att senaste uttryckliga godkännandet gällde det tidigare kundminnespaketet. Ingen fjärrbranch uppdaterad för tvåkällorsvyn. Publicerad head är fortsatt `fae59443be930d4340f8ffc880aeb0dceb0fb696`, verifierad i CI och inloggad preview. Användaren har därefter uttryckligen godkänt publicering av uppgifts-/bokningsvyn inklusive API-rättningar, tester och styrdokument i PR #38. Publicering och preview-kontroll återupptas.

### RUNTIMERÄTTNING — BOKNINGSSTATUS

Read-only produktionskontroll efter publicering av tvåkällorspaketet `7ee588bf2e9361c3adb94111f1e5fe79ec8bf5c3` upptäckte att lokal testdubbel tillät ogiltiga booking_status-värden. Faktisk enum är confirmed/cancelled/completed/no_show; next_active använder nu enbart confirmed och behåller completed_at/job_status-grindarna. Route-harness avvisar nu ogiltiga enumvärden. Korrigerad SELECT fungerar och identifierar en befintlig kommande bokning i testföretaget. 13 riktade tester, typkontroll och diffkontroll gröna efter rättningen. Fyllda öppna kunduppgifter saknas i testföretagets icke-privata data; inget skapas för test. Slutlig preview-kontroll väntar på det rättade bygget.

### LIVE-CHECKPOINT — ÖPPET OCH NÄSTA

Den föregående previewversionens enumfel gav synligt ”Bokningarna kunde inte läsas” med återförsök, medan uppgifterna fortfarande visade sitt separata verifierade tomläge. Felet blev inte ”ingen bokning”. Rättad kod är publicerad som `55cb3ac2912d7fb7fd0d712bb5246e1164bf1eff`. Båda Vercelbyggen är gröna. Inloggad kundvy visar befintlig kommande bokning 11 september kl. 12:00; Öppna bokningen går till rätt bokningsdetaljer med samma tid och innehåll. Alla 13 CI-checkar är gröna. Den andra testkunden visar separata verifierade tomlägen för uppgifter och kommande bokning. Fylld bokning, rätt navigering och tomma lägen är därmed liveprovade; projekt-only-bokning, fyllda uppgifter/privatsynlighet och sena svar har isolerade regressioner. Verkligt roll-/företagsbyte och hela slice 4 är fortsatt öppna. Inga bokningar eller uppgifter skapades eller ändrades.

### REPRODUCERA LOKALA KONTROLLER

Kör från `handymate-dashboard/` efter `npm ci`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
node tests/veckorapport-reliability-harness.cjs
npx playwright test tests/home-brain.spec.ts tests/dygnsdigest.spec.ts tests/autopilot-rapport.spec.ts tests/weekly-value-read-errors.spec.ts tests/quote-brain.spec.ts tests/first-value-production.spec.ts tests/durable-followup.spec.ts --no-deps --project=chromium --workers=1 --reporter=line
npm run build
```

Den uppräknade testsamlingen startar inte någon browser och använder inte produktion. Kör inte en ospecificerad full Playwright-svit som ersättning: repots standard-BASE_URL pekar mot produktion och vissa separata resor gör verkliga skrivningar/utskick. För nästa UI-grind behövs rätt branch-preview och avsett testkonto.

### ARKITEKTURBESLUT FÖRE BYGGE

1. ROT: egen XML är vald ansökningsriktning inför launch. Ingen snabb avstängning av Fortnox `taxreductions`: dess betydelse för fakturans avdrag/saldo är ännu obevisad. Exklusivitet per faktura och idempotent XML-återhämtning kräver avgränsad Money-slice med providerbevis. Två vägar finns alltså fortfarande i kod; ROT kvarstår PROVE/blockerad. Home/Quote tillför ingen ansöknings-CTA. `generated` betyder XML-underlag skapat; Fortnox `submitted` bevisar inte mottagning hos Skatteverket.
2. Auto-approval: legacy `tryAutoApprove` saknar runtime-anropare och får inte återaktiveras. Mänskliga beslut går via approvals/[id] och `canActOnApproval`; systembeslut via befintlig earned-autonomy/mandat. Statistik/learning confidence är inte mandat. Ingen bred approval-refactor i läsmodellerna.
3. Separat launch-fynd: legacy `/api/suggestions/approve` reschedule-handler hade inget tenantfilter för uttryckligt booking_id. Avgränsad fix och fem regressioner är nu implementerade, se checkpoint ovan; ingen bred återaktivering/refactor av legacy-flödet.

### IMPLEMENTATIONSBRIEF — ASTRA → SOL

- **CONNECT:** veckorapportens misslyckade försök får inte permanent spärra veckan. Återanvänd `automation_activity.id` för atomär veckoreservation med attempt-token/CAS; håll reservationen vid osäkert leveransutfall. Separata historiska auditposter bevaras. Läsfel i dedupe/paus/underlag blockerar utskick. Inga auditlarm undertrycks. Ingen verklig sändning i tester.
- **Quote:** utöka `app/api/quotes/[id]/handoff` → `lib/quotes/handoff.ts` → `QuoteHandoff.tsx`. Läs samma sent_at-kedjas högst tre deterministiska omgångskort, härled senaste kvitto med `followupProviderAccepted`. Behåll stopvillkor, regel/cadence, pending/claimed/expired-semantik. Ingen skrivning/reconcile från GET. Giltig executed_at krävs för tidsclaim. Owner/admin och tenantgrind oförändrade.
- **Home:** ren presentationsadapter från JarvisHomes redan använda källor och MissionProvider. Fem kategorier; planerat är inte utfört/pågående. `failed`/`skipped` och generellt agent-run-success är inte hanterat. Läsfel är okänt, inte noll. Återanvänd samma deduplicerade beslut; märkt begränsad lista. Behåll ekonomiska sanningsklasser och behörigheter. Ingen ny tabell/motor/LLM/API-hub.
- **TEST GATE:** retry/concurrency/response-loss, tenant/permissions, falsk framgång vid läsfel, omgångskvitto efter reconcile/ny sent_at, företagsbyte/stale response, reload och smal skärm. Unit/kontrakts-/lokala browserbevis ersätter inte live/provider/mobilapp.

### VERIFIERINGSGRÄNS

Historiska auditstatusar behållna med rättad evidens. `approved` är inte samma sak som verifierat execution outcome. Externa nummer-/saldoåtgärder återstår. Ingen felhistorik raderas för att få gröna siffror.

---

# 28. Session handoff template

Kopiera och fyll i detta efter varje betydande slice.

## SESSION DATE
YYYY-MM-DD

## SLICE
...

## DONE
- ...

## CUSTOMER IMPACT
- ...

## REUSED
- ...

## NEW
- ...

## VERIFIED
- ...

## NOT VERIFIED
- ...

## TESTS
- ...

## LIVE / PROVIDER PROOF
- ...

## STATUS CHANGES
- Capability: OLD → NEW

## COST IMPACT
- ...

## RISKS
- ...

## DOCUMENTS / CODE UPDATED
- ...

## NEXT ACTION
...

---

# 29. Final instruction to Codex

Do not optimize for producing the most code.

Optimize for turning Handymate’s existing intelligence into a coherent, truthful and unmistakable customer experience.

Before building anything substantial, prove whether the capability already exists.

When it exists:

> connect it  
> activate it  
> expose it  
> prove it

When it genuinely does not exist:

> build the smallest canonical primitive required

Then return immediately to the customer journey.

The target is not “more AI”.

The target is:

# A FIRM THAT FEELS LIKE IT IS RUNNING ITSELF ADMINISTRATIVELY.

---

# 30. Model Operating Protocol

Brain Visibility-programmet ska använda modellerna som olika roller, inte som utbytbara byggare.

Grundprincip:

> **Astra tänker, utmanar och granskar.  
> GPT-5.6 Sol bygger, testar och slutför.**

Målet är att använda den dyraste kapaciteten där den skapar störst värde och låta implementationen drivas av modellen som är stark nog för uppgiften men betydligt mer kvoteffektiv.

---

## 30.1 Astra — när den ska användas

Använd GPT-6 Astra primärt för:

### A. Capability Reality Audit
- förstå stora delar av repot
- skilja canonical implementation från död/duplicerad kod
- identifiera dolda runtime-beroenden
- upptäcka parallella motorer
- klassificera BUILD / CONNECT / ACTIVATE / EXPOSE / PROVE / SCALE
- bedöma om en capability redan finns i annan form

### B. Arkitekturbeslut före en svår slice
Innan implementation av komplexa vertikaler:

- Home / Mission Control
- Quote Brain
- Field Command
- Money Brain
- Fortnox / ROT/RUT
- cross-agent / cross-domain state
- nya read models som läser många domäner

Astra ska då besvara:

1. Vad finns redan?
2. Vad är canonical?
3. Vilka primitives ska återanvändas?
4. Vad är minsta säkra vertikal?
5. Vilka risker finns?
6. Vilka claims kan UI sanningsenligt visa?
7. Vad bör uttryckligen INTE byggas?

### C. Säkerhets- och sanningskritisk review
Använd Astra när ändringen påverkar:

- tenant isolation
- permissions
- verified impersonation
- approval rail
- earned autonomy
- pengar
- customer communication
- provider semantics
- idempotency
- retries
- partial failures

### D. Post-slice architectural review
Efter större implementation ska Astra vid behov göra en oberoende review:

> Är detta faktiskt en canonical vertikal eller skapade vi en parallell väg?

> Visar UI verklig state eller presenterar vi antaganden?

> Missade vi en befintlig engine?

> Har vi skapat osynlig teknisk skuld för nästa slice?

### E. Slutlig cross-product review
När flera slices är färdiga:

- bedöm om produkten känns som EN hjärna
- identifiera duplicerade presentationsmönster
- hitta kvarvarande "invisible intelligence"
- hitta intelligence som visas utan tillräcklig proof
- prioritera nästa högsta leverage

---

## 30.2 GPT-5.6 Sol — när den ska användas

GPT-5.6 Sol är programmets primära implementationmodell.

Använd Sol för:

### A. Implementation
- React/UI
- API-kopplingar
- befintliga services
- read models
- adapters
- presentation state
- migrations där de redan är specificerade
- mobile implementation
- copy/state presentation

### B. Testarbete
- unit tests
- contract tests
- role/permission tests
- idempotency tests
- retry tests
- partial-failure tests
- regression tests
- E2E setup
- testfixar

### C. Review-fixes
Efter Astra-review:

- åtgärda konkreta fynd
- komplettera guards
- koppla missing state
- rätta UI-semantik
- förenkla implementation
- städa duplicering

### D. Tydligt specificerade vertikaler
När audit + arkitekturbeslut redan är klart:

> Låt Sol äga hela slicen tills Definition of Done eller tills ett verkligt arkitekturbeslut blockerar.

Byt inte tillbaka till Astra bara för att implementationen innehåller många filer.

---

## 30.3 Standardloop per större slice

Default arbetsloop:

### STEP 1 — ASTRA: UNDERSTAND
Läs:

- detta dokument
- aktuell main
- ARCHITECTURE.md
- relevant capability state
- senaste checkpoint

Leverera en kort, repo-grounded implementation brief.

Ingen ny generell roadmap.

### STEP 2 — SOL: BUILD
Implementera hela vertikalen enligt briefen.

Återanvänd canonical primitives.

Kör relevanta tester löpande.

### STEP 3 — SOL: VERIFY
Verifiera:

- domain correctness
- tenant
- permissions
- idempotency
- partial failure
- reload
- mobile
- provider
- customer journey

så långt miljön medger.

### STEP 4 — ASTRA: CHALLENGE
För större eller känsliga slices:

Granska implementationen oberoende mot:

- styrkontraktet
- canonical architecture
- truthfulness
- launch safety
- customer-visible value

### STEP 5 — SOL: CLOSE
Åtgärda review-fynd.

Kör tester igen.

Uppdatera `CURRENT PROGRAM STATE`.

Markera endast den status som faktiskt är bevisad.

---

## 30.4 När Astra INTE ska användas

Bränn inte Astra på:

- CSS-justeringar
- pixel polish
- ren komponentrefactor
- enkla props/state-fixar
- testfixture-arbete
- copyjusteringar med redan bestämd semantik
- mekaniska typfel
- kända lintfel
- upprepade små testfixar
- implementation där arkitekturen redan är tydligt beslutad

Om Sol kan lösa uppgiften utan nytt arkitekturbeslut ska Sol fortsätta.

---

## 30.5 Escalation rule

Sol ska eskalera tillbaka till Astra när någon av följande uppstår:

### ARCHITECTURE AMBIGUITY
Två eller fler befintliga implementationer verkar vara möjliga canonical sources.

### NEW DOMAIN PRIMITIVE
Slicen verkar kräva en ny:

- tabell
- event
- approvaltyp
- domain engine
- cross-domain read model
- persistent intelligence object

som inte tydligt redan finns.

### SAFETY CHANGE
Implementation kräver ändring av:

- auth
- tenant model
- permissions
- financial safeguards
- approval rail
- customer-facing automatic actions

### SEMANTIC AMBIGUITY
Det är oklart vilken state UI sanningsenligt får hävda.

Exempel:

- "skickat" vs "provider accepted"
- "sparat" vs "identifierat"
- "klart" vs "förberett"
- "bevakar" vs "planerat"

### LARGE CROSS-DOMAIN REFACTOR
Arbetet börjar växa från en vertikal slice till en generell systemombyggnad.

När detta händer:

> Stoppa den breda utvidgningen, checkpointa vad som är gjort och använd Astra för att fatta nästa arkitekturbeslut.

---

## 30.6 Context efficiency

Undvik att byta modell för ofta.

En ny modell/session behöver återorientera sig.

Därför:

- Astra ska lämna en konkret brief/checkpoint.
- Sol ska arbeta länge på en tydligt avgränsad vertikal.
- Astra ska inte reviewa varje liten commit.
- Sol ska inte be om ny arkitekturplan efter varje mindre hinder.
- Samma styrdokument ska användas som kontinuitetslager.

Målet är:

> **färre, tyngre modellöverlämningar — inte ständig ping-pong.**

---

## 30.7 Suggested model allocation by slice

| Slice | Planning / Audit | Implementation | Review |
|---|---|---|---|
| Capability Reality Audit | Astra | Sol för dokumentering/fixar | Astra |
| Home / Mission Control | Astra | Sol | Astra |
| Quote Brain | Astra | Sol | Astra |
| Project Brain | Astra vid komplex state | Sol | Astra vid behov |
| Customer Brain | Sol eller Astra vid memory-ambiguity | Sol | Astra vid behov |
| Explainability | Astra för semantik | Sol | Sol/Astra |
| Value Receipts | Astra vid money semantics | Sol | Astra vid claims |
| Mobile Brain Visibility | Astra endast för cross-domain design | Sol | Sol/Astra |
| Field Command 2.0 | Astra | Sol | Astra |
| Money Brain | Astra | Sol | Astra |
| Full Journey Proof | Sol | Sol | Astra slutreview |

Tabellen är default, inte absolut.

Den verkliga complexity/risk-nivån styr.

---

## 30.8 Quota discipline

Veckokvoten ska behandlas som en produktionsresurs.

Default:

> **Använd inte Astra när Sol redan har tillräcklig kontext och ett tydligt beslut att implementera.**

Prioritera Astra-kapacitet till:

1. Capability Reality Audit
2. arkitekturbeslut med stor downstream-effekt
3. money/security/approval semantics
4. Field Command
5. slutlig cross-product review

Om Astra-kvoten blir knapp:

- fortsätt implementera redan beslutade vertikaler med Sol
- dokumentera öppna arkitekturfrågor
- samla flera review-frågor till en Astra-session
- undvik små separata Astra-anrop

---

## 30.9 Model handoff format

När Astra lämnar över till Sol ska checkpointen minst innehålla:

### OBJECTIVE
Vad ska ändras i kundupplevelsen?

### VERIFIED EXISTING PRIMITIVES
Vilka befintliga engines/services/state ska återanvändas?

### CANONICAL PATH
Vilken write/read path gäller?

### DO NOT BUILD
Vilka parallella lösningar ska undvikas?

### IMPLEMENTATION SCOPE
Vilka lager behöver ändras?

### TRUTH SEMANTICS
Vilka ord/states får UI visa?

### SAFETY / APPROVAL
Vilka guards gäller?

### TEST GATE
Vad måste vara grönt?

### DEFINITION OF DONE
Vad ska kunden faktiskt kunna se/göra efteråt?

När Sol lämnar tillbaka till Astra ska checkpointen minst innehålla:

### IMPLEMENTED
Vad ändrades?

### REUSED
Vad återanvändes?

### TESTED
Vad verifierades?

### NOT PROVEN
Vad saknar live/provider/mobile proof?

### DEVIATIONS
Avvek implementationen från planen? Varför?

### REVIEW QUESTIONS
Vilka konkreta osäkerheter återstår?

---

## 30.10 Final model principle

Modellval ska inte vara prestige.

Astra används där bättre reasoning kan förhindra fel riktning.

Sol används där tydlig execution skapar mer kundvärde per token.

> **Astra prevents expensive mistakes.  
> Sol turns good decisions into product.**
