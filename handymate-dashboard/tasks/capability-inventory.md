# Handymate — Ärlig kapabilitets-inventering

_För pitch-/strategiändamål. Ingen hype — vad som FAKTISKT finns._
_Genererad 2026-07-01 · **Uppdaterad 2026-07-11** (git-verifierad mot main + branch-läget i båda repon)._

## Statusdefinitioner (läs först)
- **LIVE** = deployat *och* driftsatt/körande i prod sedan tidigare (rimligt bekräftat operativt).
- **BYGGT** = i `main`, kod-vägen wirad, `tsc`+build rent — men **inte** verifierat med
  riktig prod-körning. Juni/juli-audits bevisade upprepat att "deployat" ≠ "fungerar"
  (senast 2026-07-10: dokument-API:t och projektflyttar hade ALDRIG fungerat i prod).
- **BRANCH** = byggt men inte ens mergat till `main`. Får inte omnämnas alls i pitch.
- **SPEC** = inte byggt.

**Epistemisk brasklapp:** författaren kan bekräfta vad som ligger i `main` och om kod är
kopplad — men inte observera prod-runtime. Statusen lutar därför KONSERVATIVT. Där det står
LIVE är det en slutsats, inte en garanti. Sann "LIVE" kräver pilot-bekräftelse (Bee).
**En pitch byggd på fejk-kapabilitet dödar trovärdighet vid första demon.**

---

## 0. NYTT sedan förra inventeringen (2026-07-01 → 2026-07-11)

Allt nedan är i `main` och pushat (= auto-deployat kodmässigt) om inget annat sägs:

| Vad | Datum | Status |
|---|---|---|
| **Förtjänad autonomi** — komplett motor: streak → förtroende-erbjudande → autonom sändning med bypass, Förtroendetrappan-panel, revoke, 30d-cooldown | 07-02 | **BYGGT** — ingen riktig kund har beviljat autonomi ännu |
| **Produktbank + sammansatta produkter + visningsfilter** — kategorier/artikelnr, intern kalkyl → kunden ser en rad, ROT på arbetsandel, tre visningsnivåer i ALLA renderare | 07-07/08 | **BYGGT★** — v67 KÖRD i prod, Bees 5 prisrader migrerade, slutverifierad mot riktig Bee-data. Starkaste nya. Ej använd i skarpt kundflöde ännu |
| **Offert-identitet** — created_by + "Vår referens" = skaparen i mejl/dokument (v68) | 07-05/06 | **BYGGT** |
| **Offert-mejl + riktig PDF** — ett on-brand mejl, jsPDF-nedladdning i portal/public/dashboard | 07-06 | **BYGGT** |
| **Ingen trial** — checkout debiterar direkt (garanti-modell), trial-hål stängda, v69-idempotens | 07-08/09 | **BYGGT** — se Stripe nedan |
| **Onboarding wow-kedja** — import-steg (Fortnox OAuth/CSV) efter betalning → LiveTour-payoff med Karins krona-fynd ur importerad data | 07-09 | **BYGGT** — runbook finns (`tasks/launch-verification.md`), ALDRIG körd end-to-end |
| **Audit-fixrunda 4-8** — GP1/GP2 (Golden Path var trasig IGEN), agenten skapade TOMMA offerter/fakturor (AB1/AB2) → riktiga rader, kill-switch hedras (AB3), o-gatade cron gatade, roll-gating ägar-routes, ROT-årstak + personnummer på slutfaktura | 07-08/09 | **BYGGT** — audit-fynden prod-verifierade (read-only mot DB), fixarna EJ flödesverifierade |
| **FK-embed-svepet** — projektflyttar + dokument-API hade ALDRIG fungerat i prod (tysta PostgREST-fel); fixade + sql/v71 | 07-10 | **BYGGT** — lektionen: hela query-klassen felar tyst, mer kan finnas |
| **Facit-tester** — playwright-facit för instant-value, Fortnox-fakturamappning, produktbank (Christoffers scenario a-h) | 07-08/09 | Testerna gröna lokalt |
| **Idag-vy-omdesign** (desktop + mobil, från Claude Design) | 07-11 | **BRANCH** — `feat/idag-vy-redesign` (desktop klar, tsc+build rent) + mobil under byggnad. EJ mergad, EJ i prod |

**Migrations-grindar (manuella Supabase-körningar):** v67 ✅ KÖRD & verifierad.
**v68/v69/v70/v71: körd-status EJ dokumenterad** — verifiera i Supabase FÖRE demo
(offert-identitet, billing-kolumner, Fortnox-kundimport och dokument-API/projektflytt-fixarna
beror på dem; runbooken flaggar själv v69 som osäker).

---

## 1. Agenter (6)

Agenterna är INTE sex självständiga AI:n som agerar fritt. De är (a) personas ovanpå en
delad verktygs-motor, (b) nattliga observations-generatorer, (c) ägare av vissa
cron-automationer. Den konversationella agenten (Matte) är ansiktet; automations-motorn
gör de faktiska handlingarna.

| Agent | Roll | Gör KONKRET | Triggers | Status |
|---|---|---|---|---|
| **Matte** | Chefsassistent | Chatt (webb+mobil, 24 verktyg): skapa offert/faktura, slå upp kund, boka, svara. Handoff till specialister. | Användarinitierat + nattlig `agent-context` | **BYGGT** — AB1/AB2-fixen (07-09) betyder att agent-skapade offerter/fakturor hade TOMMA rader fram tills nyss; nu riktiga items + kill-switch hedras. Webbchatt kräver fortsatt smoke-test |
| **Karin** | Ekonom | Fakturapåminnelser, ROT/RUT-beräkning (nu m. årstak-kapp + personnummer), ROT→Skatteverket-fil | `check-overdue` 07:00, `send-reminders` 10:00, obs 06:00 | Påminnelser **LIVE**; ROT-fil **BYGGT** (aldrig skarpt inlämnad) |
| **Hanna** | Marknadschef | Väcker gamla kunder (gatade förslag), recensionsförfrågningar | `hanna-outbound` 08:30, `review-requests` 09:00 | Reaktivering **BYGGT** (gatad); review **BYGGT/LIVE**; direkt-sändning vid beviljad autonomi **BYGGT** |
| **Daniel** | Säljare | Följer upp obesvarade/oöppnade offerter, lead-kvalificering | `quote-follow-up` 08:00 | **BYGGT** — nu gatad genom approval/autonomi (07-09), end-to-end i prod EJ bekräftat |
| **Lars** | Projektledare | Projekt-/boknings-koordinering, projekt-hälsa | `project-health` (veckovis) | **BYGGT** — OBS: projektflyttar via UI fungerade ALDRIG före 07-10-fixen |
| **Lisa** | Kundservice/telefonist | KOPPLAR inkommande samtal till din telefon ELLER röstmeddelande + transkribering. Missat samtal → catch-SMS (Tier 0). | `voice/incoming`-webhook | Routing **LIVE**; Tier 0 **BYGGT**; INGEN pratande röstagent |

**Kritiskt (oförändrat):** Lisa pratar INTE. Ingen realtids-röstagent finns. Pratande AI i
telefon = **SPEC** (Vapi ej inkopplat; Röst-Lisa-designen medvetet parkerad tills efter
lanseringssprinten).

---

## 2. Kärnflöden — Golden Path

`lead → deal → offert → projekt → faktura → betalning`

**Brutal sanning, uppdaterad:** Golden Path fixades i juni — och auditen 2026-07-08/09
hittade den trasig IGEN på nya ställen (GP1: deal-insert läste fel stage-tabell → deals
skapades inte; GP2: lead-skrivning mot icke-existerande kolumn). Fixat 07-09 (`14fdf805`).
Dessutom 07-10: projektflyttar och dokument-API hade ALDRIG fungerat (tysta FK-embed-fel).
Kedjan är kodmässigt hel per 2026-07-10 och fynden är verifierade mot prod-DB — men
**ingen riktig deal har någonsin dokumenterat flödat hela vägen till "Vunnen" i prod.**
→ **BYGGT, inte LIVE.** (A-testet i `tasks/launch-verification.md` är beviset som saknas.)

---

## 3. Integrationer

| Integration | Status | Ärlig kommentar |
|---|---|---|
| **46elks** (SMS + röst) | **LIVE** | SMS + samtals-routing körande i prod sedan tidigare. |
| **Stripe** | **BYGGT** | Nytt sedan 07-01: ingen trial — debiteras direkt (garanti = manuell refund), trial-hål stängda, webhook-idempotens (v69), runbook klar. **B7-testköpet (4242 → `active`) är fortfarande INTE genomfört** — betalvägen är aldrig bevisad end-to-end. |
| **Fortnox** | **BYGGT men LICENS-BLOCKERAD** | Nytt: onboarding-import av kunder + öppna fakturor via OAuth (+ sql/v70). Facit-test för mappningen grönt. MEN: kräver fortfarande kundens Integrationslicens 149 kr/mån (Christoffer har ej köpt — Easoft betalar också, publicering kringgår inte). Funktionellt = SPEC för piloten tills licens finns. |
| **Google** (kalender/Gmail) | **BYGGT** | Oförändrat — koppling + token-refresh finns, ej bekräftat använt. |
| **Vapi** (röst-AI) | **SPEC** | Oförändrat. INTE inkopplat, bara en etikett i koden. Röst-Lisa parkerad tills efter sprinten. |
| **OpenAI Whisper** | **BYGGT** | Oförändrat — röstmeddelanden + mobil röst-input (svenska). |

---

## 4. Mobil (Expo-app)

| Funktion | Status |
|---|---|
| Godkännanden (godkänn/avvisa, läser exekverings-resultat) | **BRANCH** — B2-fixen + autonomy_offer-etiketten ligger på `fix/b2-mobile-execution-read`, EJ mergad till mobile-main |
| Matte chatt + röst-in, Stage 2 (agent-kedja, transkript-fix) | **BRANCH** — samma omergade branch |
| Tid, projekt, bokningar, offert | **BYGGT** (i mobile-main sedan maj) |
| Ny Idag-hemskärm (bevisband, nästa bokning, kö, Klart idag, Matte-dock) | **BRANCH** — byggs 2026-07-11 på `feat/idag-hemskarm` |

**Brutal sanning, uppdaterad:** senaste EAS-production-bygget kördes **2026-05-12**
(+ Sentry-fix 05-20). TestFlight-distributionens checkboxar i runbooken är otickade —
**vad som faktiskt kör på en riktig telefon är obekräftat, och är i bästa fall kod från
2026-05-20.** ALLT mobilarbete efter det (Matte Stage 2, transcribe-fix, B2, Förtroende-
etiketten, nya Idag-skärmen) ligger på omergade branches = finns inte i något bygge,
finns inte på någon telefon. Mobilen kan INTE demoas med senaste funktionerna.

---

## 5. Lärande / moat

| Förmåga | Beräknas? | Används? | Status |
|---|---|---|---|
| Agent-attribution (agent_id på loggar) | Ja | Ja — per-agent scoreboard | **BYGGT** |
| approve_rate + trust-ladder | Ja | Ja — trust-ladder-vy | **BYGGT** |
| **Förtjänad autonomi** (streak → erbjudande → autonom sändning, revoke, cooldown, Förtroendetrappan-panel) | Ja | Ja — motorn wirad i approvals + cron | **BYGGT** (07-02) — ingen riktig kund har beviljat ännu; redigerade godkännanden räknas korrekt inte in i streaken |
| Pattern-extraction (nattlig) | Ja | Delvis | **BYGGT** |
| AI-lärda preferenser (ton/pris/stil) | Ja | Ja — i agent-prompten | **BYGGT** |
| agent_context (nattlig företagsanalys) | Ja | Ja — i prompten | **BYGGT** |
| Veckovärde (kr + tid) | Ja | Ja — dashboard | **BYGGT** |

**Moat-bedömning (oförändrad i sak, starkare i bevis):** moaten = DJUPET i svensk
back-office (ROT-split på arbetsandel i produktbanken, årstak + personnummer mot
Skatteverket, Fortnox-loop) — inte agent-tekniken (commodity, jfr GHL). Förtjänad
autonomi är nu den tydligaste produkt-manifestationen av lärandet.

---

## 6. Vad som INTE finns (ärligt)

- **Pratande röstagent** — **SPEC**. Oförändrat.
- **Skarpa Stripe-betalningar verifierade** — nej. Runbook klar, B7 ej körd.
- **Fortnox användbart för piloten** — nej (licens-blockerat).
- **BankID** — **SPEC**.
- **ROT faktiskt inlämnat till Skatteverket** — nej (nu med årstak/personnummer-hantering, fortfarande aldrig skarpt inlämnad).
- **Onboarding self-serve end-to-end** — **BYGGT** hela vägen (inkl. import + payoff) men aldrig körd i ett svep; runbook väntar.
- **Golden Path prod-verifierat** — nej (och den gick sönder igen mellan inventeringarna — ödmjukhet här).
- **Mobil med senaste funktionerna på riktig telefon** — nej (se §4).
- **Nya Idag-vyn** — BRANCH, ej mergad (desktop klar, mobil byggs).

---

## Bottom line för pitchen

**Kan visas/lovas UTAN att ljuga idag:**
- Missat samtal → SMS → AI bokar (Tier 0) — kärnkilen. (46elks LIVE.)
- CRM + offert + faktura + ROT-beräkning med årstak + veckovärde i kronor.
- **Produktbank + sammansatta produkter + visningsfilter** — verifierad mot pilotens
  riktiga data; tryggaste nya demon (demoa i eget konto, inte lova "beprövat i drift").
- Gatad proaktiv reaktivering (Hanna) + Förtroendetrappan som KONCEPT ("teamet förtjänar
  självständighet") — visa panelen, lova inte att den "brukar" bevilja.
- Matte-chatt på webben (text). Mobil-chatt bara om EAS-bygget gjorts först.

**Får INTE sägas i demo (dödar trovärdighet):**
- ❌ "En AI svarar i telefon och pratar" (finns inte — SPEC).
- ❌ "Kopplar till din Fortnox" (licens-blockerat för kunden; importen kräver att KUNDEN köper licens 149 kr/mån).
- ❌ "Betala smidigt i appen" / "registrera dig och kom igång själv" (Stripe-köp + wow-kedjan ALDRIG körda end-to-end).
- ❌ Golden Path som bevisat fungerande (kodmässigt hel sedan 07-10, aldrig flödesverifierad — och den har gått sönder tyst två gånger).
- ❌ "Senaste appen i mobilen" (inget bekräftat bygge efter 2026-05-20; juni/juli-fixar omergade).
- ❌ "Agenterna sköter sig själva när de förtjänat det" som bevisat (motorn är byggd, ingen riktig kund har beviljat autonomi).
- ❌ Nya Idag-vyn (branch — visa inte ens screenshots som "produkten idag").

**Verifieringar som flyttar BYGGT → LIVE (= sprintens definition of done):**
1. A-testet: wow-kedjan signup → import → payoff → dashboard i ett svep (runbook: `tasks/launch-verification.md`).
2. B7: Stripe-testköp (4242) → `subscription_status='active'` + `billing_event`-rad.
3. EAS-mobilbygge (efter merge av `fix/b2-mobile-execution-read`) + bekräftad TestFlight-installation.
4. Migrations-svep: bekräfta v68–v71 körda i Supabase (v67 ✅).
5. En riktig deal genom hela Golden Path till "Vunnen".
