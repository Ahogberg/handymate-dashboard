# Pre-Launch High-Impact Wave — audit, ranking och treveckorsplan

**Datum:** 2026-08-12 · **Lansering:** 1 september 2026 (fast)
**Metod:** Tre parallella kodauditer samma kväll (hemytor + Mattes verktyg;
värdeattribution + ÄTA-kedjan; playbook-scoping + faktasäkerhet + testinfra).
Koden är sanningen — inte strategidokumenten. Varje påstående är verifierat
mot fil:rad ikväll; äldre revisionsdokument visade sig delvis inaktuella och
citeras inte utan omverifiering.

---

## Executive summary

Nordstjärnefrågan — *kan en stressad hantverkare SE och KÄNNA att allt
hänger ihop?* — har ett tydligt svar: **kompositionen är möjlig med
befintliga primitiver, och förvånansvärt lite saknas.** Tre saker styr
prioriteringen:

1. **Command Center finns till ~70 % men på fel rutt.** `/dashboard/hem`
   (JarvisHome) har redan nästan hela strukturen; prod-startsidan
   `/dashboard` (IdagCore) är en äldre, fattigare parallellvy. Största
   enskilda upplevelselyftet är ett routebyte + ett band — inte ett nybygge.
2. **Tre små sanningsfel ackumulerar fel data varje dag de får leva:**
   Playbook-lärdomar läcker mellan jobbtyper, kundfakta-prompten uppmuntrar
   portkoder i klartext, och godkännande-executorn kastar bort artefakt-ID:n
   som hela värdeattributionen behöver. Alla tre är små fixar. De går först.
3. **Allt efter betalning är osynligt för test och demo.** Livscykelns nya
   halva (stängning → efterkalkyl → debrief → lärdom → nästa offert) kan
   varken demonstreras eller rökprovas, och dess fail-safe-vägar felar tyst
   utanför driftlarmets radar.

Rekommenderad sekvens: **Wave A** sanningsfixar + Command Center-komposition
→ **Wave B** Value Ledger-UI + full livscykel i demokontot → **Wave C**
integrationshärdning + observability → **feature freeze må 25 aug 18:00** →
**Wave D** Reality Week → lansering.

---

## Kandidat 1 — Matte Command Center

**Current state.** Två parallella hemytor existerar:

| | `/dashboard` (IdagCore) — PROD-startsida | `/dashboard/hem` (JarvisHome) — ny |
|---|---|---|
| Beslutskö | max 2 kort, INGEN gruppering | grupperade kort (`groupApprovals`), realtime, max 3 + kompakta rader |
| "Handymate sköter" | "Klart idag" (platt lista) | dygnsdigest med AUTO/Godkänt-märkning + `TeamBevakning` ("teamet håller ögonen på") + hälsningsbevis ("Senaste dygnet: … — inget behövde dig") |
| Riskerar pengar | INGET (inte ens länk till pengar-sidan) | delmängd: `AttHamtaRailCard` (3 rader) + Värdekvitto-rad |
| Agentfynd | TeamActivityStrip + morgonbrief-citat | "Värt att veta" (observations) — men morgonbriefen saknas HÄR |
| Matte-input | bara flytande bubblan | `SkrivRad` stor/pill + chips med prompt-prefill + röst (`Jobbkompisen` har MediaRecorder + transkribering) |

Koden säger själv (`app/dashboard/hem/page.tsx:11-26`) att routebytet väntar
på pilotbekräftelse. Moments (teamets penga-fynd) har ingen yta alls — bara
ett flyktigt kort per sidladdning + badge i Matte-bubblan.

**Gap.** (a) Routebytet. (b) "Riskerar pengar"-bandet: datat finns EXAKT
grupperat i `lib/value/pengar-pa-bordet.ts` (`hamta_nu`/`mojligheter`/`risk`
med belopp och href per kategori) men visas bara på undersidan
`/dashboard/pengar`. (c) Mattes verktyg täcker inte kommandofrågorna — av
promptens fyra exempel: "Vilka projekt behöver mig?" **omöjlig** (inget
projektlisteverktyg finns bland de 36), "Vad har vi lovat kunder?"
**omöjlig** (men `customer_fact` typ `commitment` finns sedan i natt —
källan existerar!), "Vilka jobb kan faktureras?" **omöjlig som verktyg**
(logiken finns i `sweepMissedRevenue`), "gamla offerter" **halvdan**
(`get_quotes` saknar `sent_at` och åldersfilter).

**Bugs/correctness.** Inga — detta är komposition.

**Reuse.** Allt: JarvisHome-sektionerna, pengar-på-bordet-grupperna,
moments-härledningen, morgonbriefen, chips/röst-vägen, tool-router-mönstret.

**Architecture (minsta).** (1) `/dashboard` renderar JarvisHome; IdagCore
flyttar till `/dashboard/oversikt` med Sidebar-post som fallback tills
pilotkunderna bekräftat (rollback = en rad). (2) Nytt band "Riskerar pengar"
mellan besluten och digesten som renderar pengar-på-bordets tre grupper
(befintligt API, ren rendering). (3) Moments in i "Värt att veta"-flödet.
(4) Morgonbrief-remsan (TeamActivityStrip) till nya hemytan. (5) Fyra nya
read-only-verktyg: `get_projects_overview`, `get_stale_quotes`,
`get_invoiceable_work`, `get_customer_commitments`.

**UX.** Ägaren öppnar appen: hälsning + bevis ("Senaste dygnet: 9 åtgärder,
Lisa tog 4 samtal — inget behövde dig förrän nu"), 2-3 beslutskort, ett
pengaband med tre grupper, digesten hopfälld. Frågan "vad behöver jag göra?"
besvaras utan ett enda klick.

**Mobile.** Nej — webb/PWA är lanseringsytan; mobilappen är parkerad och
inte grindande.

**Värde 9 · Demo 10 · Retention 9 · Moat 6 · Effort MEDIUM · Risk MEDIUM**
(routebytet — mitigeras av fallback-rutten)
**→ BUILD BEFORE SEP 1**

---

## Kandidat 2 — Value Ledger / Handymate-kvittot

**Current state.** Mycket mer finns än väntat: `lib/value/` rymmer
attributionskärnan (`recovered-revenue.ts`: direktattribution via
`related_id`/`quote_id` + korrelationsfönster 14/7 dagar + dubbelräknings-
spärr), **Värdekvittot** (`vardekvitto.ts` — månadens bekräftade kronor,
rad-form med `approval_id` + dagar-till-utfall, beräknas live utan tabell),
**Ägarrapporten** (`agarrapport.ts` — tre sanningsnivåer + retentionraden
"Handymate har kostat X — och bidragit till Y kr bekräftat värde"),
pengar-på-bordet (= Identifierat-stadiet) och weekly-value (dag 7-mailet).
ÄTA→faktura→betalning är HELT spårbar: `project_change.invoice_id` +
`invoiced_at` sätts atomiskt (`sql/v104` RPC + `mark-sources.ts`-fallback) —
en äldre gransknings påstående om motsatsen är åtgärdat och stämmer inte
längre.

**Gap — tre välavgränsade brott:**
1. **Artefakt-ID:na kastas bort** (`app/api/approvals/[id]/route.ts:375-388`):
   executorn returnerar `ata_id`/`invoice_id`/`quote_id` i HTTP-svaret men
   persisterar bara `{outcome, error_text, executed_at}` i
   `execution_result`. Kedjan kort→artefakt är obevisbar i DB.
2. **`RECOVERY_APPROVAL_TYPES` utesluter 4 av 5 värdegenererande korttyper**
   (`recovered-revenue.ts:32-40`): invoice_reminder, create_ata_draft,
   missad_intakt, fakturera_projekt kan aldrig attribuera en krona.
3. Utan direktreferens faller attribution till korrelation (kund + 14 dgr) —
   bara offertjakten når `isDirect` idag.

**Bugs.** `learning_events` är ett osäkert fundament (dokumenterad
typkonflikt TEXT→UUID; v78-migrationens status motsäger sig mellan dokument
och minne — ska verifieras mot DB, men Ledger V1 behöver den INTE).
Dag 7-mailets etikett kallar `confirmed_kr` "offerter ute" — fel etikett på
rätt siffra (accepterade offerter + betalda fakturor).

**Reuse.** Hela lib/value-lagret, `v3_automation_logs.approval_id`-mönstret,
`project_change.invoice_id`-kedjan, `invoice.paid_at` (två pålitliga vägar).

**Architecture (minsta sanna V1).** INGEN ny tabell — promptens
"immutable value_event" behövs inte: (1) persistera artefakt-ID:n i
`execution_result` (en utökning av EN update); (2) utöka
RECOVERY_APPROVAL_TYPES med de fyra typerna, med DIREKT-attribution via de
nu persisterade ID:na (aldrig korrelation för pengar-påståenden); (3)
Värdekvittot uppgraderas till fyrstegsvyn — Identifierat (pengar-på-bordet)
/ Agerat (approvals + artefakt-ID) / Fakturerat (`project_change.invoice_id`,
`invoice.quote_id`) / Betalt (`paid_at`) — stadierna får ALDRIG blandas
ihop; (4) Ägarrapportens retentionrad ut på hemytan månadsvis. Tidsvinst
visas endast med weekly-values befintliga konservativa schabloner, märkta.

**UX.** "Handymate den här månaden: 46 700 identifierat · 24 300 agerat ·
18 400 fakturerat · 14 900 bekräftat betalt" + raden "kostat X — bidragit Y".

**Mobile.** Nej.

**Värde 8 · Demo 9 · Retention 10 · Moat 7 · Effort LOW (fix) + MEDIUM (UI)
· Risk LOW**
**→ Attribution-fixarna NU (Wave A); fyrstegsvyn Wave B — BUILD BEFORE SEP 1**

---

## Kandidat 3 — Playbook V1

**Current state.** Debrief-capture är hel på skrivsidan: kortet skapas i
båda stängningsdörrarna med utfallsdeltat, executor skriver `project_lesson`
med job_type, v121 är körd, svarsmodalen fungerar (byggd + verifierad
2026-08-11/12). Lärdomar konsumeras i offertgenereringens prompt +
returneras i metadata.

**Bugs/correctness — promptens misstanke BEKRÄFTAD, plus en till:**
1. `fetchRecentLessons(businessId, jobType?)` filtrerar bara när jobType är
   truthy — och **ingen av de fem produktionsanroparna skickar jobType**
   (`lib/approve-actions.ts`, `lib/ata/suggest-ata-draft.ts`,
   `lib/e2e-deal-flow.ts`, `lib/quotes/suggest-quote-draft.ts`,
   `app/api/quotes/ai-generate/route.ts`). I praktiken: senaste 3 lärdomar
   oavsett typ → badrumslärdomar påverkar altanoffertter, medan prompten
   påstår "LIKNANDE JOBB".
2. Värre uppströms: `job_type` är ofta null vid källan —
   `createProjectFromQuote` (dominerande projektskaparen) skriver
   `project_type`, INTE `job_type`. Bara manuellt skapade projekt och
   seed-datan sätter fältet.

**Reuse.** Hela debrief-kedjan, `aggregateOutcomesByJobType`
(MIN_SAMPLE_SIZE=3) för framtida mönster, business_preferences
(source='user') som mönsterlagring.

**Architecture.** NU (litet): fixa job_type vid källan
(createProjectFromQuote ärver quotes.job_type) + skicka jobType från de
anropare som har den + **utan jobType hämtas INGA lessons** (hellre inga än
fel — sanning före funktion). SENARE (efter volym): mönstermotorn
("3 av era senaste badrumsjobb…" → bekräftelsekort → business_preferences
source='user') — kräver lärdomsvolym som börjar samlas först nu, att bygga
motorn idag vore att bygga mot tom data.

**UX (minsta synliga "Handymate lär sig"-ögonblick).** Redan i prod:
Daniels lärdomsrad i offertgenereringen — blir ÄRLIG i och med fixen.
Mönsterkortet är efter-lansering.

**Mobile.** Nej.

**Värde 7 · Demo 7 · Retention 8 · Moat 9 · Effort LOW (fix) / MEDIUM
(mönster) · Risk LOW**
**→ Scoping-fixen NU (Wave A); mönstermotorn AFTER LAUNCH**

---

## Kandidat 4 — Margin Guardian → Margin Recovery

**Current state.** Kärnan byggdes i natt och fullbordades i morse:
varningar ur kanoniska motorn med golv-semantik, orsaksrader
KÄNT/UPPSKATTAT (timmar, material, osignerad ÄTA, obesvarat ÄTA-förslag i
N dagar, prognos), pending-dedup med uppdatering, expected_margin_snapshot
skrivs i alla tre accept-vägarna (v120 körd), kanoniska motorn är numera
ENDA källan överallt (mobil, agentverktyg, Karin, Daniel migrerade idag).
"28 % → 21 % med orsaker" är alltså redan sant — promptens kärnupplevelse
finns.

**Gap.** (a) Orsaksraden om obesvarat ÄTA-förslag LÄNKAR inte till det
kortet (deeplink saknas). (b) Guardian syns inte på hemytan (marginalrisk-
gruppen bor på pengar-undersidan). (c) Recovery-attributionen (Guardian-fynd
→ ÄTA → fakturerad → betald → Value Ledger) blockeras av Kandidat 2:s
artefakt-ID-fix — löses där. (d) Notisgräns: idag pushas både at_risk och
over_budget; rimligare att bara over_budget (high) pushar och at_risk är
tyst kort — liten justering. (e) ÄTA-hålet i kanoniska motorn (approved
utan signatur räknas ej som intäkt) är en öppen beslutspunkt hos Andreas —
INTE en bifångst.

**Reuse.** Allt från i natt + create_ata_draft-exekutorvägen.

**Architecture.** Tre små tillägg: deeplink i orsaksraden, Guardian-kort i
Riskerar pengar-bandet (Kandidat 1), push-gräns. Ingen migration.

**UX.** Karins kort som idag, nu ett klick från ÄTA-granskningen.

**Mobile.** Nej (mobile-profitability-routen fick kanoniska siffror idag).

**Värde 8 · Demo 9 · Retention 8 · Moat 7 · Effort LOW · Risk LOW**
**→ BUILD BEFORE SEP 1 (Wave A, litet)**

---

## Kandidat 5 — Company Memory som aktivt hjälper

**Current state.** Fyra fact-typer (preference/constraint/commitment/
contact), kort med ordagrant citat, executor skriver customer_fact (v122
körd, RLS enligt v101-mönstret verifierad i SQL). Fyra läsvägar, alla
filtrerar korrekt på `superseded_by IS NULL`: Matte-resolvern (10 senaste →
intent-agentens prompt), kundkortet ("Det här vet Handymate"), tidslinjen.

**Bugs/correctness — två allvarliga, båda från i natts bygge:**
1. **Säkerhet: 'contact'-prompten uppmuntrar ordagrant "portkod"** (båda
   analysvägarna), demo-transkriptet innehåller "Portkoden är 1893", och
   koder lagras i klartext utan särbehandling. Åtkomstkoder (portkod,
   larmkod, nyckelgömma, lösenord) ska ALDRIG extraheras — kontaktpreferens
   och telefonnummer är en annan sak än inbrottsvägar.
2. **`superseded_by` sätts ALDRIG** — executor gör ren INSERT utan
   motsägelsekontroll; schemakommentaren lovar en mekanik som inte
   existerar. Motstridiga fakta ackumuleras ("portkod 1893" + "portkod
   2024" båda aktiva), och ingen UI-väg finns att pensionera ett faktum.

**Gap (injektion).** Fakta når INTE offertgenereringen (noll träffar i
ai-quote-generator) och INTE projektvyerna — bara SMS/mejl-agenten och två
läsytor. Promptens tre injektionspunkter: offert (preferenser) SAKNAS,
projekt ("Att tänka på") SAKNAS, pre-kommunikation FINNS (resolvern).

**Reuse.** Befintliga facts-API:t, resolver-mönstret, kundkortssektionen.

**Architecture.** NU: (1) förbjud åtkomstkoder i alla tre prompterna +
rensa demo-transkriptet; (2) supersede i executor (samma kund + fact_type →
äldre markeras) + "ta bort"-knapp på kundkortets faktalista; (3) två
injektionspunkter: bekräftade preference/constraint-fakta in i
offertpromptens kontext + "Att tänka på"-ruta på projektsidan. Mattes
"vad vet vi om X?" fungerar redan via resolvern.

**UX.** Daniel i offertutkastet: "Kunden har tidigare sagt: föredrar ek ·
vill vara klar före midsommar." Lars på projektsidan: "Att tänka på:
tillträde efter 08:00."

**Mobile.** Nej.

**Värde 8 · Demo 8 · Retention 9 · Moat 9 · Effort LOW+LOW-MED · Risk LOW**
**→ Säkerhet + supersede NU (Wave A); injektionspunkterna BEFORE SEP 1**

---

## Kandidat 6 — Launch Reliability / Reality Simulation

**Current state.** Mer finns än väntat: `e2e-quote` (11 steg: kund → offert
→ signeringslänk → PDF → signering → projekt → deal won), `e2e-invoice`
(8 steg t.o.m. paid), gyllene vägen-körboken (station 1-10, preflight,
nattens motorer, åtta kända fällor), tenant-isolation-integrationstestet
(riktig disponibel Supabase, fyra säkerhetsspärrar), demo-seeden (kunder,
deals, offerter, projekt, schema, fakturor, kort, möte via
demo-seed-meeting).

**Gap.**
- **Allt efter betalning saknas överallt**: körboken slutar vid station 10;
  ingen debug-endpoint täcker tidrapport/ÄTA/stängning/efterkalkyl/debrief;
  seeden hoppar över livscykelhändelserna (offerter seedas statiskt → ingen
  snapshot, inga time_entries, ingen ÄTA, inget completed projekt → ingen
  outcome, inget debrief-kort, inga lessons — "Handymate lär sig"-halvan är
  odemonstrerbar på demokontot).
- **Noll fault-lägen** för Fortnox/Google/46elks (grep: 0 träffar på
  mock/sandbox/fake) — felvägar kan bara observeras när de råkar inträffa.
- **Ingen Sentry**; driftlarm-cronen sveper TABELLER (sms_log,
  automation_activity, billing_event) — allt som bara gör `console.error`
  är osynligt, och det gäller exakt de nya fail-safe-vägarna (debrief-kort,
  lessons-insert, customer_fact-insert, snapshot-skrivning,
  morgonbrief). Rätt mönster finns dokumenterat i proactive-care: skriv
  failed-rad i automation_activity.
- customer_fact/project_lesson ingår inte i tenant-isolation-testets
  tabellista.

**Architecture (minsta effektiva Reality Week).** (1) Tyst→synligt: alla
fail-safe-vägar skriver failed-rader som driftlarmet sveper. (2) Körboken
förlängs station 11-14 (stängning → efterkalkyl → debrief → lesson → ny
offert) + adversarial-checklistan ur prompten. (3) `e2e-lifecycle`
debug-endpoint: tidrapport → ÄTA → stängning → outcome → debrief-kort.
(4) Demo-seeden får full livscykel (även Wave B-demovärde). (5) Freeze +
manuell Reality Week på demokontot med adversarial-varianterna; varje
avvikelse är stop-the-line.

**Manuellt vs automatiskt.** Automatiskt: livscykelkedjan, tenant-isolation
(+ nya tabeller), fail-safe-larmen. Manuellt: integrationsfelvägar
(Fortnox-token, Google-frånkoppling), samtidiga användare,
behörighetsvarianter, PWA på iOS Safari.

**Mobile.** PWA-flödet ingår i Reality Week; mobilappen (parkerad) grindar
inte lanseringen.

**Värde 7 (indirekt men existentiellt) · Demo 6 · Retention 9 · Moat 3 ·
Effort MEDIUM · Risk — (sänker risk)**
**→ BUILD BEFORE SEP 1 (Wave C/D-kärnan)**

---

## Ranking

| Kandidat | Kundvärde | Demo | Retention | Moat | Effort | Risk | Timing |
|---|---:|---:|---:|---:|---|---|---|
| 1 Command Center | 9 | 10 | 9 | 6 | MEDIUM | MEDIUM | **BEFORE SEP 1** |
| 2 Value Ledger | 8 | 9 | 10 | 7 | LOW+MEDIUM | LOW | **fix NU · UI BEFORE SEP 1** |
| 3 Playbook V1 | 7 | 7 | 8 | 9 | LOW / MEDIUM | LOW | **fix NU · mönster AFTER** |
| 4 Guardian→Recovery | 8 | 9 | 8 | 7 | LOW | LOW | **BEFORE SEP 1** |
| 5 Aktiv Memory | 8 | 8 | 9 | 9 | LOW+LOW-MED | LOW | **säkerhet NU · injektion BEFORE SEP 1** |
| 6 Reality Sim | 7 | 6 | 9 | 3 | MEDIUM | sänker | **BEFORE SEP 1 (Wave C/D)** |

## De tolv svaren

1. **Först:** sanningsfixarna — Playbook-scoping, fakta-säkerhet/supersede,
   attribution-persistens. Alla små; varje dag utan dem ackumulerar fel
   eller förlorad data.
2. **Sedan:** Command Center-kompositionen (routebyte + Riskerar pengar-band
   + moments + fyra Matte-verktyg) + Guardian-länkarna + Memory-injektionen.
3. **Tredje:** Value Ledger-fyrstegsvyn + full livscykel i demokontot.
4. **Väntar explicit:** Playbook-mönstermotorn (behöver volym), Memory-sök,
   Guardian-trend, konfigurerbara automationer (redan beslutat
   post-lansering), Expectation Drift (sedan tidigare).
5. **Mest UX/komposition:** Command Center — nästan noll backend.
6. **Starkaste demo-wow:** Command Center-öppningen + Guardians orsakskort.
7. **Starkaste ROI-story:** Value Ledger — Ägarrapportens "kostat X —
   bidragit Y"-rad finns redan och blir bevisbar med attributionsfixen.
8. **Mest churn-reducerande:** Value Ledger + Command Center (dagligt
   "titta vad som sköttes åt dig").
9. **Starkaste moat:** Playbook + Memory — ackumulerad bekräftad firmadata.
10. **Största lanseringsrisk:** routebytet — mitigeras med fallback-rutt
    och egen commit; därefter integrationsfelvägarna (därav Wave C).
11. **Redundant givet koden:** Kandidat 4 var till största delen redan
    byggd (i natt); Kandidat 2:s nya "value_event"-tabell behövs inte —
    befintliga rader räcker när artefakt-ID:n persisteras. Ingen ny
    plattform, inget nytt ramverk, ingen ny agent behövs någonstans.
12. **Bättre idé ur repot:** "Tyst degradering → driftlarm" — de nya
    fail-safe-vägarnas fel är idag helt osynliga; att göra dem svepbara är
    billigare och viktigare än ytterligare en featurekandidat. Plus:
    split-brain-upplösningen mellan de två hemytorna ÄR Kandidat 1:s kärna
    — koden hade redan svaret på promptens fråga.

## Treveckorsplan (1 sep fast)

**WAVE A — SANNING & KUNDVÄRDE · ons 13 – sön 17 aug**
- A1 Sanningsfixarna (först, en push): Playbook-scoping (job_type vid
  källan + skickas av anropare + inga lessons utan typ), fakta-säkerhet
  (åtkomstkoder förbjuds i prompterna, demo-transkript rensas, supersede
  implementeras, ta bort-knapp), attribution (artefakt-ID:n persisteras i
  execution_result; RECOVERY_APPROVAL_TYPES utökas med direktattribution).
- A2 Command Center: `/dashboard` → JarvisHome (IdagCore →
  `/dashboard/oversikt` som fallback), Riskerar pengar-bandet, moments in i
  Värt att veta, morgonbrief-remsan.
- A3 Fyra Matte-verktyg: get_projects_overview, get_stale_quotes,
  get_invoiceable_work, get_customer_commitments (alla read-only).
- A4 Guardian: ÄTA-deeplink i orsaksraden, kort i pengabandet, push bara
  vid over_budget.
- A5 Memory-injektion: offertprompten + projektsidans "Att tänka på".

**WAVE B — GÖR MAGIN SYNLIG · mån 18 – tors 21 aug**
- B1 Value Ledger-fyrstegsvyn (härledd, ingen ny tabell) + Ägarrapportens
  retentionrad på hemytan månadsvis.
- B2 Demo-kontot får FULL livscykel (accept via riktiga vägen → snapshot,
  time_entries, signerad ÄTA, completed projekt → outcome → debrief-kort →
  lessons) — säljdemon kan visa hela slingan inkl. "Handymate lär sig".
- B3 Portal-desktop (media query på .bp-mobile-shell) + onboarding-länkar
  mot nya hemytan.

**WAVE C — INTEGRATIONSHÄRDNING · fre 22 – mån 25 aug**
- C1 Tyst → synligt: fail-safe-vägarna skriver failed-rader i
  automation_activity (driftlarmet sveper).
- C2 Google-verifiering inskickad; kalender-frånkopplad + Fortnox-token-
  utgång verifieras manuellt, svalda fel fixas.
- C3 Körboken station 11-14 + adversarial-checklistan.
- C4 `e2e-lifecycle`-endpoint (tidrapport → ÄTA → stängning → outcome →
  debrief).

**FEATURE FREEZE: MÅNDAG 25 AUGUSTI 18:00.** Därefter endast korrekthet,
tillförlitlighet, UX-blockerare, säkerhet, prestanda och lanseringskritiskt
GTM/demo-arbete — om inte Andreas uttryckligen häver frysen.

**WAVE D — REALITY WEEK · tis 26 aug – mån 1 sep**
- Hela gyllene vägen + adversarial-varianterna körs manuellt på demokontot
  (två samtidiga användare, anställd utan ekonomibehörighet, redigerat
  godkännande, autonomt utskick som failar, Fortnox nere, Google
  frånkopplad, superseded faktum, projekt utan timkostnad, utgången token).
  Varje avvikelse = stop-the-line.
- PWA-flödet på iOS Safari ingår; mobilappen grindar inte.
- 1 sep: driftlarm + cost-guard är watch-ytorna.

## Principer som bevaras

Ingen ny agent, inget nytt godkännanderamverk, ingen ny ekonomimotor, ingen
ny minnesplattform, ingen ny värdeplattform. Tenant-isolation, fail-closed,
sanning, proveniens, explicit godkännande, idempotens, förtjänad autonomi
och KÄNT/UPPSKATTAT/MÖJLIGT-semantiken är orörda ramar. Målet är färre,
starkare ytor — inte fler sidor.
