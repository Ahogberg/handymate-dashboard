# Handymate — Ärlig kapabilitets-inventering

_För pitch-/strategiändamål. Ingen hype — vad som FAKTISKT finns._
_Genererad 2026-07-01 · **Uppdaterad 2026-08-04** (offert-sprinten, git-verifierad)._

## ⚡ 2026-08-04: OFFERT-SPRINTEN E1-E5 — "dokumentet ÄR gränssnittet", BYGGT (ej LIVE)

Hela offertupplevelsen ombyggd på en dag (tasks/offert-masterplan.md har
commit-hashar + uppföljningslista): EN dokumentmotor (QuoteDocument)
ersätter tre parallella renderare — live-canvas, preview, PDF och
KUNDENS SIGNERINGSSIDA renderar nu samma dokument. Kunden ser äntligen
mallen hantverkaren valde (Premium når ytan där affären stängs).
Skaparen är canvas-first (dokumentet huvudyta, 13 kort → smal assistent-
kolumn + Mer-rad), mobilen fullvärdig (skalat dokument + bottom-sheet-
radeditor, 44px+), detaljsidan är ett Offertrum (dokumentet i centrum,
EN primär åtgärd per status, VERKLIG händelselogg från tracking-datat,
versionsdiff). ~1700 rader dubblett-/dialektkod bort netto. Fyra äkta
buggar fixade på vägen (tillvalsrader försvann i hantverkarvyn, ROT-
toggle-desync, PDF:ns tomma sida 2, publikt prisläckage i rows-läget).

HOTFIX-lärdom: react-dom/server-importen fällde alla Vercel-deployer i
fem etapper innan den upptäcktes — tsc fångar inte webpack-felklassen;
next build är nu deploy-gate för lib-ändringar (tasks/lessons.md).

Status BYGGT tills Andreas kört manuella verifieringen (lista i
masterplanen: livecanvas, mobil på riktig telefon, PDF per stil,
kundvyns signering end-to-end). Nästa: E6 FAKTURA-SPRINTEN (beslutad —
motorn generaliseras till pengadokument; fakturan renderas idag av
gamla jsPDF:en = varumärkes-whiplash i betalögonblicket).

## ⚡ 2026-08-03: VÄRDEKEDJORNA STÄNGDA — "motorerna fanns, triggrarna saknades", BYGGT (ej LIVE)

Tre parallella kodrevisioner inför lansering konvergerade: motorerna, kön
och godkännandemekaniken fanns — men triggrarna saknades. Allt byggt på
en dag (tasks/value-chain-plan.md har commit-hashar + detaljer):

**Agenterna GÖR nu mer av det som redan var byggt:**
- Auto-offertutkast: kvalificerad lead (score >= 50 + beskrivning) →
  färdigt utkast med produktbanksrader i kön, utan att någon ber om det.
- ÄTA-kedjan: Daniel/Matte föreslår ÄTA-utkast när kundkommunikation
  klassas som tilläggsbeställning på ett identifierat projekt.
- Karin väcks på JUST förfallna fakturor (bedömer kund/belopp/relation —
  mallpåminnelsen kvar som mekanisk fallback).
- Lars väcks på avslutat jobb med avvikelsedata inline; nytt
  get_project_outcome-verktyg (enskilt projekt).
- Daniel får nattlig push på efterkalkyl per jobbtyp + ÄTA-frekvens
  ("badrummen drar X % över — höj tidsraderna i mallen").
- Verktygsallokeringen rättad: specialisterna hade inte sina egna
  domänverktyg (Daniel saknade pris/efterkalkyl, Karin saknade Fortnox).

**Fyra korrekthetsbuggar fixade** (varav en SÄKERHET: auto-approve räknade
redigerade förslag som rena godkännanden → förtjänad autonomi eskalerade
för snabbt) + **foto→offert-revisionen** (RUT→ROT-buggen, ROT-default,
årstak i offertflödet, klientkomprimering av foton som annars kraschade
mobilflödet, AI-tillval, kundprislistor) + **prisdata-UX** (allvarligast:
"Din timkostnad"-fältet skrev till AI:ns försäljningsprisnyckel — kunder
fick offerter till självkostnad; CSV-import; AgentReadinessCard;
självläkande 0-kr-rader) + **landningssidans BankID-påstående ersatt med
sant** (ingen BankID-integration finns — SPEC, backlog).

**Status BYGGT, inte LIVE:** v78-migrationen väntar på Andreas; ingen
kund har använt flödena skarpt. Våg 3 (byggdagbok, grannskapskampanj,
materialorder, recensionsfångst, avvikelselogg) väntar på pilotsignal.

## ⚡ 2026-08-02: STORFIRMAN-PARITET — 9 etapper byggda på en dag, BYGGT (ej LIVE)

Andreas-direktiv: alla funktioner ska fungera lika bra för ett flermans-
företag som för en enskild firma. Full kodrevision hittade att detta var
ETT strukturellt hål (`getAuthenticatedBusiness()` identifierar aldrig
VILKEN anställd som agerar, bara vilket företag) som visade sig på 11
ställen — två av dem redan LIVE säkerhets-/dataläckagebuggar, inte bara
framtida begränsningar. Se `tasks/multi-employee-parity-plan.md` för
fullständig teknisk detalj och commit-hashar.

**BYGGT idag (main, tsc+build rent, 82 nya/ändrade facit-tester gröna):**
projektläckage stängd (GET /api/projects filtrerar nu på behörighet),
löneattribuering (time_entry.business_user_id sätts nu på alla 4
insert-ställen — löneexporten var tyst fel/tom per anställd för varje
flermansfirma), kö-routing-infrastruktur + RLS-fix (pending_approvals var
`USING(true)` — inte ens business-scopad i databasen, en tidigare
migration hade av misstag återöppnat en redan fixad policy), per-typ
routing utrullad (finansiella/löne-/projekttyper riktas nu mot rätt
roll/person), riktade push-notiser, bokningstilldelning (UI + API, plus
en dispatch-lucka och ett cross-tenant-hål som upptäcktes och fixades i
samma svep), fakturarader ärver utförare, checklista-spoofing fixad.

**Status = BYGGT, inte LIVE:** två SQL-migrationer (v76, v77) väntar på
att Andreas kör dem manuellt i Supabase — RLS-fixen (v77) är särskilt
känslig och har egna verifieringssteg inbyggda i migrationsfilen. Ingen
riktig flermansfirma har använt något av detta skarpt än.

**Medvetet INTE byggt (Etapp 8, egen framtida plan):** kapacitetsplanering
per anställd, och att Matte (chatt-assistenten) vet vilken anställd som
frågar — båda kräver bredare designarbete utöver denna dags scope.

## ⚡ 2026-07-15: A-TESTET GODKÄNT + ALLT SKÖRDAT — stora statusflyttar

**A-testet (A1–A5) + wow-kedjan är körda och godkända av Andreas** (bockade i
efterhand i launch-docsen). Därmed BYGGT→**LIVE**: tillval-flödet (A2),
aha-samtalet/onboarding-kedjan (A3), Förtroendetrappan-panelen (A4), Pengar
in-radarn (A5), Bee-rollverifieringen (A1), onboarding wow-kedjan inkl.
Fortnox/CSV-import + LiveTour-payoff (Del 1). **Stripe/betalvägen är
FORTFARANDE BYGGT** — B7-testköpet är INTE kört (Andreas enda kvarvarande grind).

**Skördat till prod 2026-07-15** (mergat + deployat, tsc 0 fel + 204 facit-
tester gröna): Idag-vy-omdesignen (deployad redan 07-11), offert-vinnaranalysen
(hopfällbar Offert-prestanda + Daniel-coach), grön teknik-avdraget Fas 1
(15/50/50%, arbete+material-bas, 14 facit), pengaloopen Del 1 ("Jag har
betalat"-bekräftelse + delad apply-payment-kärna). Status: **BYGGT/deployade**
— LIVE först när piloten använt dem skarpt.

**Mobil:** fix/b2 + nya Idag-hemskärmen mergade till mobile-main (tsc 0 fel),
pushade. **EAS-bygge återstår** — inget på telefoner ännu.

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

**Migrations-grindar (manuella Supabase-körningar):** v67 ✅ · v68 ✅ · v70 ✅ ·
v71 ✅ (verifierade i prod 2026-07-19). **v69 KÖRD 2026-07-20** (billing_period-
kolumner + billing_plan.limits) — därmed är HELA migrations-grinden grön och
B7-testköpets DB-facit (billing_period_start) kan uppfyllas.

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
| **Egenkontroll-agenten** (foto mot checklistpunkt → vision-bedömning → förslag/avvikelse i kön; checklist-förslag vid projektskapande) | Ja | Nej — 0 kund har använt den skarpt | **BYGGT★** (08-02) — tasks/easoft-gap-plan.md etapp 1 (1a-1d) komplett, tsc 0 fel, 86 facit-tester, ej demokörd på riktigt konto ännu |

**Moat-bedömning (oförändrad i sak, starkare i bevis):** moaten = DJUPET i svensk
back-office (ROT-split på arbetsandel i produktbanken, årstak + personnummer mot
Skatteverket, Fortnox-loop) — inte agent-tekniken (commodity, jfr GHL). Förtjänad
autonomi är nu den tydligaste produkt-manifestationen av lärandet.

**Easoft-gap-planen (08-02, tasks/easoft-gap-plan.md):** Easofts egen
"tio tidstjuvar"-artikel som mätsticka — 5 av 10 nu AI-först (kommunikation,
planering, budget/Motor 1, realtidsdata, kvalitetskontroll/egenkontroll-
agenten). 3 halva (tid, arbetsorder), 2 luckor (dokument, inventarier).
FÅR INTE SÄGAS: "alla tio" eller "10 av 10" förrän samtliga är BYGGT★ MED
kunddrift — se planens ärlighetsregel.

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

**Får INTE sägas i demo (dödar trovärdighet) — uppdaterad 2026-07-15:**
- ❌ "En AI svarar i telefon och pratar" (finns inte — SPEC).
- ❌ "Kopplar till din Fortnox" (licens-blockerat för kunden; importen kräver att KUNDEN köper licens 149 kr/mån).
- ❌ "Betala smidigt i appen" (Stripe B7-testköpet fortfarande INTE kört — betalvägen obevisad). OBS: "registrera dig och kom igång själv" är nu OK t.o.m. betalsteget — wow-kedjan är verifierad, men själva köpet är inte.
- ❌ "Senaste appen i mobilen" (koden mergad 07-15 men INGET EAS-bygge — telefoner kör fortfarande maj-versionen).
- ❌ "Agenterna sköter sig själva när de förtjänat det" som bevisat (motorn LIVE-verifierad via A4, men ingen riktig kund har nått 15-streaken än — säg "förtjänar", inte "brukar").
- ❌ Grön teknik/vinnaranalys/betalbekräftelsen som beprövade (deployade 07-15, facit-testade, men ingen har använt dem skarpt — demoa gärna, lova inte drift-historik).

**BORTTAGET från förbudslistan 2026-07-15** (nu OK att visa): nya Idag-vyn
(LIVE i prod), wow-kedjan/onboarding (A-test-verifierad), tillval, radarn,
Förtroendetrappan, Golden Path t.o.m. offert→projekt (A-testets flöden körda;
faktura→Vunnen-steget dock fortfarande obevisat tills B7/riktig betalning).

**Verifieringar som flyttar BYGGT → LIVE (= sprintens definition of done):**
1. A-testet: wow-kedjan signup → import → payoff → dashboard i ett svep (runbook: `tasks/launch-verification.md`).
2. B7: Stripe-testköp (4242) → `subscription_status='active'` + `billing_event`-rad.
3. EAS-mobilbygge (efter merge av `fix/b2-mobile-execution-read`) + bekräftad TestFlight-installation.
4. Migrations-svep: bekräfta v68–v71 körda i Supabase (v67 ✅).
5. En riktig deal genom hela Golden Path till "Vunnen".

## 7. Partner-systemet (upptäckt odokumenterat 2026-07-28)

| Del | Status |
|---|---|
| Partner-registrering/login/dashboard (app/partners/*) + API (app/api/partners/*) | **BYGGT** — aldrig verifierat i drift |
| P-kod-attribution i registreringen (referred_by + referrals-rad + partner-webhook) | **BYGGT** |
| Provisionsmotor 20%/12 mån (lib/partners/commission.ts, nattlig via agent-context, hoppar churnade) | **BYGGT** — matchar publika erbjudandet på /partners |
| Utbetalningsmarkering (markCommissionPaid, manuell admin) | **BYGGT** |
| Partneravtal + partner-paket | **UTKAST** (content/partner/, avtal kräver jurist) |

**Verifiering som flyttar BYGGT→LIVE:** end-to-end-test (testpartner → kod →
registrering → dashboard → provisionsrad) + bekräfta v14_partners körd i prod.
Får INTE säljas som beprövat till partner innan dess.

## §8 Planstruktur (ändrad 2026-07-31, Andreas-beslut)

Publikt utbud: **Firman 5 995 kr/mån** (intern nyckel: professional) (ingång — hela AI-teamet, sex
medarbetare) + **Storfirman 11 995 kr/mån** (intern nyckel: business) (skillnad = volym & människor:
obegränsade användare, 1 000 SMS, större användningsutrymme, hemsida+SEO,
dedikerad support) + **"Anpassad — kontakta oss"** (inget löfte om
enterprise-funktioner; bara kontaktväg). **Starter/Bas (2 495) är BORTTAGEN
ur allt publikt utbud och säljmaterial** — den bröt kategorilöftet (bara
Matte ≠ AI-team). Plantypen finns kvar i koden för befintliga konton och
tyst nedgradering. FÖRBJUDET framåt: nämna 2 495/Bas/Starter i pitch, demo
eller publika sidor. Interna marginaltak per plan ($1,5/$3/$8 per dag,
degradera-inte-stoppa) är INTERNA — får aldrig beskrivas som "tokens" eller
tak mot kund; kundspråket är "normal användning" (se
content/juridik/fair-use-utkast.md, jurist krävs).
