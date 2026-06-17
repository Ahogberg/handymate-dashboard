# Fable 5 — Riktad granskning #2 (2026-06-12)

**Scope:** Låst till midsommar-MVP för Bee. Ingen kod ändrad. Read-only.
**Metod:** Fyra parallella sökagenter (vårt execution-chain-arbete / värdekedje-glapp / Vapi+mobil / offert→Fortnox) + min egen förstahandskännedom från att ha byggt Steg 0–2. **Varje agent-fynd är kritiskt filtrerat** — jag nedgraderade flera "KRITISK"-etiketter som inte höll vid granskning. Falskt självsäkert fynd kostar mer än ärligt "ser korrekt ut".

> **Headline:** Inget hotar midsommar-MVP katastrofalt. Den största *konkreta, fixbara* risken är **B2 (mobil-godkänn av icke-SMS-actions failar tyst)**. Fortnox är uppskjutet (licens), inte en blockare. Vårt execution-chain-arbete är korrekt; en designfråga väntar inför Steg 3.

---

## A. VAD SOM HOTAR MIDSOMMAR-MVP (rankat)

### A1. B2 — mobil-godkänn av icke-SMS-actions failar tyst 🔴 (fixbart, litet)
**Fil:** `app/api/approvals/[id]/route.ts:218-222` (forwardHeaders) + `handymate-mobile/lib/api.ts:7-13, 214-222`
**Status: BEKRÄFTAT OFIXAT** (jag verifierade förstahands i fable5-verification.md — en av sökagenterna påstod felaktigt att det var fixat via Audit-4; det stämmer inte).

`forwardHeaders()` forwardar bara *cookie*. Mobilen skickar *Bearer* utan cookie → för `create_booking` / `send_quote` / `send_invoice` / `create_quote_draft` blir cookie null → intern fetch 401:ar → status flippas till `approved` men handlingen sker aldrig. Mobilens `respondToApproval` läser bara `res.ok` → visar grönt.

**MVP-relevans:** Flöde 3:s *uttryckliga* krav ("SMS landar") **fungerar** — rena SMS-actions går via `sendSmsViaElks` direkt, opåverkat av cookie-buggen. Men om Bee godkänner ett **boknings-förslag eller offert/faktura från mobilen** failar det tyst. Hantverkaren står på bygget → mobilen är primär yta → reell risk.
**Fix (spec §3.6, ~en kväll):** forwardHeaders forwardar även `authorization`; mobilens respondToApproval läser `execution` och visar fel. Detta är den enda B2-fixen som krävs oavsett execution-chain-refaktorn.
**Alternativ för midsommar utan fix:** begränsa mobil-godkännanden till SMS-typer; låt Bee godkänna offert/faktura/bokning från web.

### A2. Vapi-samtal → lead: betingat grön — env + statisk knowledge 🟡
**Filer:** `app/api/voice/incoming/route.ts` (auto-lead), `voice/transcribe` (Whisper), `voice/analyze` (Claude), `lib/agent/agents/shared.ts:107` (knowledge_base läses en gång)
Kedjan finns och är rimlig (auto-lead vid inkommande samtal, transkribering, AI-analys → ai_suggestion). Risker att verifiera **före** genomkörning:
- **OPENAI_API_KEY satt i prod** — annars 503 på transcribe → inget analyseras. (HÖG om osatt.)
- **Vapi-assistenten är statisk** (knowledge_base läses vid agent-start, synkas inte live — audit-2-B1). För Bee är detta en *accepterad manuell setup* (pilot-fix-plan). Risk: testar Bee mot stale knowledge → fel AI-svar → misstro. **Synka + re-init Vapi-assistenten innan testsamtal.**
- **E.164-matchning** av inkommande nummer mot `customer.phone_number` — annars dubbel-lead i stället för länkad kund. (Medel.)
- **Intent-klassificering** kan missa "boka in"-behov → ingen suggestion. (Medel — testa mot historiska transkript.)
**MVP-relevans:** ~40 min gatekeeping-test (OpenAI-config, ett testsamtal hela vägen, Vapi-knowledge-sync) räcker för go/no-go.

### A3. Fortnox-synk — UPPSKJUTET, ej midsommar-blockare 🟢(deferred)
**Fil:** `app/api/invoices/[id]/send-via-fortnox/route.ts` + `sql/v58_invoice_fortnox_sync_status.sql`
Dubblett-skyddet är **robust** (verifierat av agent): `fortnox_sync_status` pre-flight-check + `pending`-lås före anrop + 5-min-timeout för in-flight-död + status='sent' *bara* vid lyckad sync + `ExternalInvoiceReference1` för framtida idempotens. Men: **Fortnox OAuth-licens saknas för Bee** (extern blockare, fortnox-license-blocker.md) → synken är inte live för piloten. Christoffer bokför manuellt till midsommar. **Därför ingen midsommar-blockare.** När licensen löses: **kör v58-migrationen FÖRST** (annars kraschar routen på `SELECT fortnox_sync_status`), sedan sandbox-testa retry→ingen-dubblett.

### A4. createProjectFromQuote + auto-invoice — fixat, passiv verifiering 🟢
Steg 0 (review_auto_invoice, PR #3) + createProjectFromQuote silent-failure-fix (pilot-fix-plan A1-B2) är på plats. Båda har fail-safe (skapar synlig `manual_project_create`/`review_auto_invoice`-approval, blockerar inte kund-signering). Passiv verifiering vid nästa projektavslut (steg0-passive-verify.md). Låg risk.

---

## B. VÄRDEKEDJE-GLAPP (rankat, filtrerat)

**Övergripande:** Den *levande* värdekedjan (Golden Path: kontakt→lead→deal→offert→signering→projekt→faktura→betalning→recension) **fungerar end-to-end** med mänskliga godkännande-grindar på rätt ställen (offert-send, faktura-send). Det finns ingen katastrofal brytning. Glappen nedan är städning/tech-debt, inte trasig kedja.

### B1. Deal-flow-motorn är dödkod (supersedd) — RIV
**Fil:** `lib/e2e-deal-flow.ts` (`onDealEvent` anropas från noll ställen).
Redan dokumenterat i `td-deal-flow-disconnected.md`. Sökagenten "återupptäckte" detta + flaggade att deal-flow:ens quote/project-insert saknar `lead_id` (rad 482/567) — **men det är moot**: den koden körs aldrig (motorn initieras/avanceras aldrig automatiskt). Den levande Golden Path hanterar lead→deal→…→faktura och sätter länkarna. **Rekommendation: retire (alt A i td-filen)** — ta bort motorn + flow-routen + rätta ARCHITECTURE.md som felaktigt påstår att orchestratorn anropar `onDealEvent`. Värdet: mindre yta, ingen fälla för en framtida "fixare" som kopplar in den och får dubbel-exekvering mot de levande systemen.

### B2. Quote-lifecycle har tre överlappande event-vägar
`quote_sent` hanteras av smart-communication + threshold-cron (audit-2-B5) **plus** den döda deal-flow-motorn = tre vägar för samma event. Inkonsekvens-risk när de dr.iftar isär. **Backlog (post-MVP): konsolidera till en väg.** Inte midsommar-kritiskt.

### B3. Betalnings-detektion är Fortnox-cron-beroende
Betalning→recension/nurture triggas, men betalnings-*detektionen* hänger på Fortnox-cron. Swish/andra kanaler auto-detekteras inte → manuell "markera betald". För MVP (Fortnox uppskjutet) är detta manuellt ändå. **Backlog: Swish-betalnings-detektion.**

*(Filtrerat bort: agentens "deal saknar lead_id i deal-flow" × 2 — dödkod, ej reell gap. Och "invoice-send kräver godkännande" — det är den avsiktliga human-in-loop-designen, inte ett glapp.)*

---

## C. FEL I VÅRT EXECUTION-CHAIN-ARBETE (filtrerat)

### C0. Kärnan är KORREKT ✅
Adversariell granskning bekräftade: Steg 1-extraktionerna tappade **inga** sidoeffekter (alla tre libbar — activity/customer_activity, moveDeal, fireEvent, portal, Golden Path, calendar-sync, dispatch, stages). Four-eyes-grinden i `quotes/send`-routen håller (triggar före lib-anrop, ingen väg runt). Del 1-attributionen sitter rätt (agent_id i payload, matchar extractAgentId). execute.ts mappar lib-resultaten korrekt och gate:ar på faktisk success.

### C1. Steg 3-designfråga: four-eyes-placering (INTE en bugg nu)
**Fil:** `lib/approvals/execute.ts` execSendQuote.
Sökagenten kallade detta "KRITISK bypass" — **överdrivet**. (a) execute.ts är inte inkopplad (noll call-sites) → noll prod-påverkan nu. (b) Att execute.ts kör four-eyes för system-vägen är **per spec §3.5** (auto-approve >50k → four_eyes_required). **MEN** kärnan är giltig som *Steg 3-designfråga*: när web-routen kopplas till execute.ts måste four-eyes ligga på **ett** ställe — annars dubbel-gate (route gör four-eyes + execute.ts gör four-eyes igen). **Lös innan Steg 3-wiring:** bestäm att four-eyes bor i execute.ts (en sanning) och gör web-routens send-väg till en tunn wrapper utan egen four-eyes, ELLER tvärtom. Flaggat, inte akut.

### C2. permission-gate hoppas för system — BY DESIGN
Sökagenten flaggade det som behörighetsfel. Det är avsiktligt (spec §3.2: system har policy-rättigheter, inte user-permissions; mobilen anropar alltid som `kind:'user'`, aldrig system). Ingen åtgärd.

---

## DE TRE SAKER JAG SKULLE GÖRA FÖRE MIDSOMMAR — OCH VARFÖR

**1. Fixa B2 (mobil icke-SMS) — eller medvetet begränsa mobil till SMS-godkännanden.**
Det är den enda *konkreta, fixbara* MVP-risken. Hantverkaren på bygget godkänner från mobilen; om ett boknings-/offert-godkännande failar tyst där bränns förtroendet på produktens primära yta. Fixen är liten (forwardHeaders + mobilens execution-läsning, spec §3.6). Om tiden inte räcker: lås mobil-godkännanden till SMS-typer för piloten och låt Bee ta offert/faktura från web — en medveten avgränsning slår en tyst bugg.

**2. Kör Vapi+SMS-gatekeeping-passet (~40 min) innan genomkörningen.**
OpenAI-nyckel satt → ett testsamtal hela vägen (samtal→transkript→ai_suggestion) → Vapi-knowledge synkad + re-init:ad → ett mobil-SMS-godkännande som landar. De fyra checkarna avgör go/no-go för flöde 1+3 och tar under en timme. Billigaste försäkringen som finns.

**3. Riv den döda deal-flow-motorn (alt A) — eller åtminstone rätta ARCHITECTURE.md.**
Inte för att den är farlig idag (den körs aldrig), utan för att den **ljuger om systemet**: ARCHITECTURE.md påstår att orchestratorn driver `onDealEvent`, vilket får nästa person (människa eller AI) att antingen lita på en autonomi som inte finns, eller "fixa" den och få dubbel-exekvering mot Golden Path. För en vision om *autonom backoffice* är en kartbild som ljuger om vad som är automatiserat den dyraste skulden — den underminerar förtroendet för vad systemet faktiskt gör autonomt.

---

*Granskning #2 utförd 2026-06-12 av Fable 5 (Opus 4.8). Sökagent-fynd kritiskt filtrerade — nedgraderade etiketter noterade per fynd. Inga kodändringar. Backlog-rader, inte utbyggda feature-förslag, per instruktion. Scope: midsommar-MVP.*
