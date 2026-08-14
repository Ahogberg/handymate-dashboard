# Handymate — Ärlig kapabilitets-inventering

_För pitch-/GTM-ändamål. Ingen hype — vad som FAKTISKT finns._
_Genererad 2026-07-01 · Helt omskriven 2026-08-12 · **Uppdaterad 2026-08-14**
(kod-, git- OCH prod-DB-verifierad via Supabase — radantal nedan är
verkliga, inklusive alla nya sedan 08-12)._

## Statusdefinitioner (läs först)
- **LIVE** = deployat OCH driftsatt/körande i prod, rimligt bekräftat
  (helst med prod-data som bevis).
- **BYGGT** = i `main`, tsc+build rent, EJ verifierat med riktig prod-körning.
- **SPEC** = inte byggt.

**Epistemisk not:** den här versionen är starkare än tidigare — statusen är
inte bara kodläsning utan avstämd mot prod-databasen (radantal per tabell).
Där det står "0 rader i prod" är det uppmätt, inte gissat.
**En pitch byggd på fejk-kapabilitet dör vid första demon.**

**08-14-uppdateringen specifikt:** ~70 commits sedan 08-12 lästes (rubrik
OCH diff, inte bara commit-meddelandet), fyra parallella researchpass +
direkta Supabase MCP-frågor från huvudsessionen låg till grund. Ett
återkommande mönster hittades och är värt att säga rakt ut: flera tabeller
som stod på "0 rader" i 08-12-versionen har nu 1-2 rader — men nästan alla
spårar tillbaka till EN SAMMANHÄNGANDE testkörning (Golden Path-harnesset,
natten 08-13→08-14, mot DEMOKONTOT Svensson Bygg AB) — inte till spridd
organisk kundanvändning. Det redovisas ärligt per sektion nedan i stället
för att räknas som separata framsteg.

---

## 0. NYTT sedan 2026-08-04 (åtta extrema dagar — allt i main + deployat)

| Vad | Datum | Status |
|---|---|---|
| Resurs-sprinten: fakturamotorn E6 (QuoteDocument → pengadokument) + Schema/Tid/Team R0-R5 | 08-05 | BYGGT |
| Snabbofferten (läge i offert-nya) etapp A-D | 08-06 | BYGGT |
| Karins bolagskalender (svenska myndighetsdatum, v94) | 08-07 | BYGGT |
| Jarvis-first-hemskärmen (då på /dashboard/hem) + Inställningarnas sex områden | 08-07 | → blev startsidan 08-12, se §2 |
| SMS-strypunkten (alla 24 vägar via sendSmsViaElks, opt-out-spärr) | 08-08 | **LIVE** (SMS rullar i prod) |
| Pengar på bordet (5 kategorier, 3 grupper) | 08-08 | BYGGT → yta på startsidan 08-12 |
| **B7 BEVISAD** — Stripe-testköpet kört (billing_event i prod 2026-08-09) | 08-09 | **LIVE** (betalvägen bevisad end-to-end) |
| Lead-intake-sprinten (e-postintag, attribution; v106-v108 körda) | 08-10 | BYGGT |
| Fortnox-rutträdet konsoliderat (ett träd, api-logg) + dead-code-sanering | 08-10 | BYGGT (licensläget oförändrat, se §3) |
| Gyllene vägen-körboken station 1-10 | 08-10 | Dokument — förlängd till 1-14 den 08-12 |
| Meeting Intelligence V1 (möteskontext Epic 0-2, v118) | 08-10/11 | BYGGT |
| RLS-svepet (100+ tabeller/vyer låsta mot anon; v112-v115) | 08-11 | **LIVE** (säkerhet, verifierad) |
| Företagskollen live på handymate.se + Partnerprogram v2 (trappa/liggare/portal, v117) | 08-11 | LIVE på sajten / BYGGT (0 leads, 2 partnerrader — ingen skarp användning) |
| **Mötesassistenten V2** (90-min segmentrotation, förmötespush, v119) | 08-11 | BYGGT — **0 möten i prod** (se §1) |
| Google OAuth-migrerad till eget handymate.se-projekt + settings-kraschen fixad | 08-12 | LIVE (synk verifierad av Andreas) |
| **Moat-vågen** — autonomi-härdning (beloppsgräns, nåbar nedgradering), margin-snapshot (v120), Project Debrief→lärdomar (v121), Customer Facts (v122), Margin Guardian MVP (kanonisk motor + orsaksrader), intern timkostnad i onboarding | 08-11 natt–08-12 | BYGGT — **alla har 0 rader i prod** (inget hunnit hända) |
| Kanoniska ekonomimotorn ENDA källan överallt (mobil-API, agentverktyg, Karin, Daniel migrerade) | 08-12 | BYGGT |
| **Command Center-startsidan** + 4 nya Matte-översiktsverktyg + kundfakta i offertprompt/projektsida | 08-12 | BYGGT (deployad som /dashboard samma dag) |
| **Value Ledger** (fyrstegsvyn) + moments på hemytan + full demo-livscykel + portal-desktop | 08-12 | BYGGT |
| Observability: tysta fail-safe-fel → driftlarmet; e2e-lifecycle-rökprov; Reality Week-protokoll | 08-12 | BYGGT |
| Buggrundan: 4 ruttnade facit-tester fixade (alla var TESTBUGGAR — inga produktregressioner); rena sviten 4 875 gröna, NOLL röda | 08-12 | — |

**Migrationsläget (08-12):** v116–v122 KÖRDA och verifierade. Prod-skulden
var noll.

---

## 0b. NYTT sedan 2026-08-12 (~70 commits, 08-12 kväll → 08-14 förmiddag)

| Vad | Datum | Status |
|---|---|---|
| Måndagskortet etapp 1 (veckovis lägesbild ur ledger+lärdomar+Guardian+autonomi) | 08-13 | BYGGT → takeover ersattes av Veckomötets dialogform 08-14, se §10 |
| Måndagsmötet etapp 2 (fullskärms-takeover) + pushnotis vid nytt kort | 08-13 | BYGGT → samma |
| Business Twin-strategidokument (vision + återskapad idébacklogg, `docs/strategy/`) | 08-13 | Dokument |
| **Golden Path E2E-harness: station 1-14 gröna i EN sammanhängande körning** (demokontot) — första gången någonsin | 08-13 | **LIVE, harness-bekräftad** — se uppdaterat §4 |
| 8 produktionsbuggar hittade+fixade av harnesset (bl.a. en offert-visningskrasch som träffade alla 22 företag, och en röstanalysväg som ALDRIG fungerat sedan lansering) | 08-13 | Fixat+deployat, se §4 |
| Kvittoprincipen (synlig intelligens, Fall 1-4): Daniels resonemang synligt, Guardian-orsaker delade, radnivå-osäkerhet, Lars dispatch-resonemang sparat | 08-13 | BYGGT — se §12, i praktiken 0 rader i prod på det som går att räkna |
| Guardian → ÄTA-länk vid lönsamhetsvarning (testbevisat E2E) | 08-13 | BYGGT, 0 varningar i prod ännu |
| Project Closeout Magic (resultatskärm när ett projekt avslutas) | 08-13 | BYGGT |
| "Varför vet Handymate detta?" — kundfaktabevis | 08-13 | BYGGT — se §6/§8 för var den enda datapunkten kommer ifrån |
| Värde-ramade godkännande-kvitton | 08-13 | BYGGT — 2 riktiga godkännanden sedan deploy skulle triggat texten, ingen rendering bevisad |
| Company Goals — omsättningsmål (#11, v128) | 08-13 | BYGGT — **0/22 företag** har satt ett mål |
| "Lär Handymate" — ägar-dikterade affärsregler i offertmotorn (#12, v129) | 08-13 | BYGGT — **0 regler** skrivna i prod |
| Next Best Action Engine — Christoffers prioriteringsramverk (v131, v132) | 08-13 | BYGGT — **0 `priority_rule`, 0 `next_best_action`-rader**; väntar på Christoffers dokument, se §10 |
| Claude Design-redesignen på projektytorna + två portalbuggar fixade (meddelandeikon, recensionslänk) | 08-14 | BYGGT |
| **Veckomötet** — Måndagsmötets takeover blir en dialog med riktiga NBA-beslutskort | 08-14 | BYGGT, datakontrakt MCP-verifierat, EJ browserverifierat (blockerat) — se §10 |
| **Project Reality + Cross-Agent Case** (Business Twin #9 V1) | 08-14 | BYGGT, **live-verifierat via autentiserat API-anrop** (seedad+städad data) — 0 naturliga case i hela prod, se §11 |
| Snabbofferten-omskrivning (steg-för-steg standard, review isoleras, ny "blank start"-väg) | 08-14 | BYGGT — **fullt browserverifierad** (riktig inloggning, skärmdumpar av alla tre startvägar: AI/mall/blankt, granskade och bekräftat korrekta, sedan raderade per konvention) |
| F30 "De första 30 minuterna" (hemtur på riktiga startsidan, startkort, Company Scan) | 08-12/13 | BYGGT — hade en dold bugg (turen "död vid ankomst", flaggan skrevs för tidigt), fixad 08-13; 1 äkta genomförd tur sedan fixen (ser ut som internt test, inte kund) |
| Kundröst-fix — förnamn i stället för fullnamn i 3 kundvända SMS-mallar (v123, 31 utskicksvägar svepta) | 08-12 | **LIVE** — 33/33 mallar bekräftat omskrivna i prod, 0 kvar på gamla formen |
| Mötesassistenten synliggjord (genväg på startsidan + onboardingpost) | 08-12 | BYGGT |
| Auth-genombrott i testriggen — `tests/auth.setup.ts` bytt från trasig magic link till riktig `/api/auth`-lösenordsinloggning (samma väg som appens egen inloggningssida) | 08-14 | Test-infrastruktur — ingen produktfunktion, men löst PÅ RIKTIGT (inte bara kringgått): riktig inloggd Playwright-browserverifiering fungerar nu igen för alla framtida sessioner |

**Migrationsläget (08-14):** v123–v132 samtliga KÖRDA och verifierade direkt
mot schema/data (constraint-definitioner, kolumn-defaults, tabellexistens,
0-pending-backfills). Prod-skulden är fortsatt noll. `sql/
demo_seed_internal_cost.sql` (demokontots interna timkostnad) är
**fortfarande INTE körd** — bekräftat: `default_internal_hourly_cost` är
`null` på demokontot i prod, vilket är exakt varför Golden Path-harnessets
Guardian-station (lönsamhetsvarning) fick hoppas över i sin körning.

---

## 1. MÖTESASSISTENTEN — exakt sanning (GTM-kritisk)

**Vad den ÄR:** Hantverkaren startar inspelningen AKTIVT med en knapp
("Starta mötesinspelning") under fliken **Möte i Inkorgen** — det finns ingen
passiv/kontinuerlig avlyssning och ingen realtidslyssning. Ljudet spelas in i
5-minuterssegment (max 90 min), laddas upp löpande, och transkriberas i
EFTERHAND (Whisper, svenska; worker-cron var 5:e min). AI-analysen körs
EFTER mötet, på hela transkriptet. Ljudet RADERAS efter transkribering —
bara texten består. Samtyckestext visas alltid före start.

**Vad analysen producerar (automatiskt, som godkännandekort):** mötes-
sammanfattning, offertutkast, uppföljningar/påminnelser/ombokningar, och
bekräftbara kundfakta (preferens/förutsättning/löfte/kontakt — åtkomstkoder
är förbjudna att extrahera). **ÄTA:** detekteras automatiskt ur transkriptet
MEN blir ett offertutkast-kort med "ÄTA" i titeln — inte ett separat
ÄTA-objekt. Inget skickas till kund utan godkännande.

**Prod-verkligheten (uppmätt 2026-08-12): 0 möten någonsin.**
`meeting_job` = 0 rader, `call_recording source='site_visit'` = 0. Inte ens
Andreas eget skarptest är kört. Bee har aldrig använt den. Kortvägen
mötesfynd→kort är enhetstestad (facit) och demo-körbar via demokontots
"Skapa testmöte"-knapp — men ingen riktig kund, inget riktigt möte.
**Status: BYGGT.** Förmötespushen ("Möte om 15 min") är BYGGT med samma noll.

**Rörelse sedan 08-12 (uppmätt 08-14) — ingen av delarna räknas som ett
riktigt möte:**
- `meeting_job` har nu **1 rad**: Bee Service AB (den riktiga piloten,
  `biz_21wswuhrbhy`), skapad 2026-08-12 19:13, `status='finalized'` — men
  `segment_count=1`, `total_duration_seconds=2` och `recording_id=null`.
  Två sekunder utan inspelnings-id är ett tekniskt testförsök, inte ett
  möte; ingen transkribering eller analys kan ha kört på den.
- `call_recording` har nu **1 rad** (`source='site_visit'`, 18 minuter,
  riktig transkript) — men den kommer från Golden Path-harnessets Station
  13 (§4), körd mot DEMOKONTOT (Svensson Bygg AB), natten 08-13→08-14.
  Inte en riktig kund.
- Bakomliggande bugg fixad under samma harnesskörning (v127, se §4): fram
  till 2026-08-13 kraschade VARJE insert i `call_recording` (saknat
  NOT NULL-fält) — hela röstanalysvägen, telefonsamtal OCH möten, kan
  alltså aldrig ha sparat en rad förrän det fixades. Det förklarar
  delvis varför tabellen stod på exakt 0 i 08-12-versionen.

**Slutsats oförändrad: fortfarande inget bekräftat riktigt kundmöte genom
hela kedjan.** De två nya raderna är ett testförsök och en harness-körning
mot demokontot — inte kundbevis.

**Får sägas i demo/annons:** "Spela in kundmötet — Handymate sammanfattar,
skriver offertutkastet och fångar det kunden sa, du godkänner innan något
händer" (demonstrerbart på demokontot). **Får INTE sägas:** "lyssnar på dina
möten" (passivt), "i realtid", "hanterar ÄTA automatiskt" (det blir ett
offertutkast att granska), eller något som antyder att funktionen är beprövad
hos kunder.

## 2. COMMAND CENTER — exakt sanning (GTM-kritisk)

"Command Center" är ett INTERNT namn — ordet finns inte i något UI. Det
användaren ser är **startsidan** (`/dashboard`, menypost "Översikt"), sedan
2026-08-12 omgjord till fyra sektioner i exakt denna ordning:

1. **"Det här behöver dig idag"** — beslutskort med agentens avatar, röst
   och EN verb-knapp ("{n} saker behöver ditt beslut")
2. **"Pengar just nu"** — "{X kr} som Handymate tycker kräver uppmärksamhet"
   + tre grupper (Att hämta nu / Möjligheter / Risk)
3. **"Det här sköter teamet"** — bevakningslista per agent + hopfälld
   dygnsdigest ("{n} automatiskt · {n} godkända av dig")
4. **"Värt att veta"** + Värdekvitto-raden

Detta MATCHAR GTM-beskrivningen ("vad som behöver ägaren, vad teamet sköter,
vad som riskerar pengar") — men **deployades IDAG** och har inte setts av en
enda kund ännu. Gamla vyn ligger kvar på /dashboard/oversikt som fallback.
**Status: BYGGT** (deployad, ej kundbekräftad). I GTM-material: kalla den
"startsidan"/"hemskärmen" eller beskriv sektionerna — aldrig "Command
Center" som produktnamn (det finns inte i produkten).

## 3. Integrationer

| Integration | Status | Ärlig kommentar (prod-data 2026-08-12) |
|---|---|---|
| **46elks** (SMS + röst) | **LIVE** | Rullar i prod (SMS-rader senaste veckan). Strypunkten: allt går via sendSmsViaElks med opt-out-spärr. Telefonins inspelning/analys: fram till 08-13 kraschade VARJE `call_recording`-insert (saknat NOT NULL-fält, fixat v127, se §1/§4) — ingen lyckad skarp analys bekräftad ännu efter fixen heller. |
| **Stripe** | **LIVE** (betalväg bevisad) | **B7-testköpet KÖRT** — billing_event-rader finns i prod (senast 2026-08-09). 4 aktiva prenumerationer varav 1 verifierat riktig pilot (Bee). Webhook hanterar checkout/subscription/invoice-events. Kvar: B8 (skarp betalning från riktig ny kund). |
| **Google Calendar** | **LIVE** | 3 kopplingar (inkl. Bee), **91 synkade externa händelser i prod**. OAuth-klienten flyttad till eget handymate.se-projekt 08-12, synk om-verifierad. **Google-VERIFIERINGEN är EJ inskickad** — nya kunder möter varningsskärm tills dess. Gmail-delen pausad ("kommer snart"). |
| **Fortnox** | **BYGGT men LICENS-BLOCKERAD** | Rutträdet konsoliderat + api-logg (08-10) — men `fortnox_sync` har **0 rader i prod**: ingen synk har någonsin körts skarpt. Kundens integrationslicens 149 kr/mån är fortfarande grinden (Christoffer har inte köpt). Funktionellt = går ej att demoa med riktig data. |
| **Vapi** (röst-AI) | **SPEC** | Oförändrat. `vapi_call` är bara en käll-ETIKETT på 46elks-webhooken. En vilande edge-function från februari finns; inget i appen anropar den. INGEN pratande röstagent existerar. |
| **OpenAI Whisper** | **BYGGT/LIVE** | Transkribering (svenska) används av röst-input; mötesvägen byggd men oanvänd (se §1). |

## 4. Golden Path — statusflytt

`lead → deal → offert → projekt → faktura → betalning`

**Uppmätt i prod: Bee Service AB (riktiga piloten) har 4 vunna deals och 2
betalda fakturor** (oförändrat sedan 08-12). Till det kommer nu ett
mycket hårdare bevis: **2026-08-13 kördes ett E2E-harness (Playwright,
riktig browser) genom ALLA 14 stationer i EN sammanhängande körning mot
verklig produktionskod/DB** — första gången i hela projektets historia
(`docs/REALITY-WEEK.md`, commit bf29d749: *"station 1-14 gröna i EN enda
sammanhängande browser-resa, för första gången i hela projektets
historia"*). Körningen gick mot DEMOKONTOT (Svensson Bygg AB), inte en
riktig kunds affär.

Under vägen dit hittade harnesset **8 produktionsbuggar**, alla fixade
samma dag:
- Offertens visningssida kraschade för VARJE ny offert (JSONB-fält läst
  som sträng, React-fel) — träffade alla 22 produktionsföretag som saknar
  en egen `payment_terms_text`, inte bara testdata (`be549e44`).
- Projektets stegkedja (`current_workflow_stage_id`) initierades aldrig
  vid signering, pga en dubblerad projektskapare som race:ade —
  bekräftat 29/33 prod-projekt påverkade (`7c59b2db`, `ae400d22`).
- `PUT /api/projects` skrev aldrig statuskolumnen vid avslut — 3 projekt
  i prod hade fel status (`22391b87`, backfillat v125, **0 kvar**).
- `POST /api/invoices/send` skrev aldrig `sent_at`/`sent_method` — 4
  fakturor i prod visade fel tidslinje (`78242603`, backfillat v126,
  **0 kvar**).
- `customer_activity`-loggningen vid fakturautskick floppade tyst — 100 %
  av utskicken saknade sin logg-rad (`1473b02a`, ingen backfill möjlig
  utan att hitta på historik).
- `call_recording` hade NOLL rader i hela produktionsdatabasen sedan
  tabellen skapades — ett saknat NOT NULL-fält plus en föråldrad
  `customer.address`-referens gjorde att INGEN röstanalys (telefonsamtal
  ELLER mötesinspelning) någonsin kunnat sparas (`74727173`, `7c44c02e`,
  v127, se §1).

Två icke-kodrelaterade blockerare (46elks SMS-saldo, Anthropic
API-kredit) löstes samma dag. En känd, icke-blockerande harness-kvirk
(A9, 401 vs 403) kvarstår öppen.

**Golden Path = LIVE, harness-bekräftad.** Kedjan har nu BÅDE bevisligen
producerat vunna affärer och betalda fakturor hos en riktig kund (Bee),
OCH körts felfritt station-för-station i en enda sammanhängande körning
mot skarp produktionskod (demokontot). Det som fortfarande INTE finns:
en enskild RIKTIG kunds affär spårad dokumenterat genom varje station i
följd — demokörningen bevisar att mekaniken fungerar, inte att en riktig
kund haft den resan. Säg "kedjan är bevisad end-to-end mot skarp kod och
i drift hos pilot" — lova inte "vi har sett en riktig kund gå igenom
varje steg i följd", och inte "felfri hela vägen varje gång" (det krävdes
8 fixar för att komma dit).

## 5. "Guardian" / Margin Guardian — namnsanning

"Guardian"/"Margin Guardian" är INTERNA namn — orden finns inte i UI.
Användaren ser: **Karins varningskort** "🔴 Budget överskriden — {projekt}"
/ "⚠️ Riskerar överskridning — {projekt}" med orsaksrader (timmar, material,
osignerad ÄTA, obesvarat ÄTA-förslag, prognos — märkta känt/uppskattat) och
knappen "Jag har sett det" + "Öppna projektet". På Pengar på bordet heter
kategorin **"Marginal i riskzonen"** (gruppen "Risk"). Byggd på kanoniska
ekonomimotorn (ärlighetsprincip: ingen marginal utan konfigurerad intern
timkostnad — hellre "ej konfigurerad" än påhitt). Push endast vid
över-budget. **Prod: fortfarande 0 varningskort (`profitability_warning`)
någonsin** — oförändrat sedan 08-12. Två funktioner byggda ovanpå Guardian
sedan dess har därför heller ingen skarp data att visa: Guardian→ÄTA-länken
(kortet kopplar automatiskt till ett ÄTA-underlag om Karin ser ett,
testbevisat med ett eget fristående E2E-test, men aldrig kört mot en riktig
varning) och Lars tilldelningsresonemang i dispatch (`dispatch_reasoning`
JSONB på `booking`/`work_orders`, v130 — **0 rader ifyllda** i prod).

**Nytt sedan 08-12, och faktiskt levande — men från samma harness-körning
som §1/§4, inte organisk kundanvändning:** projektstängningens
godkännandekort grupperas nu under en delad rubrik
(`completion_batch_id`). Det har verkligen hänt en gång: **2 kort delar 1
batch i prod**, båda för demokontot (`biz_0lovw5vcwzqn`), natten
2026-08-13→14 (samma fönster som Golden Path-harnessets Station 13-14).
**Status: BYGGT** (Guardian-kärnan, ÄTA-länken, dispatch-resonemanget) /
**LIVE** (bara closeout-grupperingen, och bara mot demokontot). I GTM:
beskriv funktionen ("Karin varnar innan projektet äter marginalen — med
orsaker"), använd inte "Guardian" som produktnamn. KÄND SKÖNHETSFLÄCK:
kortets typ-etikett i kön visar "Övrigt" (etikett saknas i TYPE_CONFIG) —
kvarstår, fixas i polish.

## 6. "Value Ledger" — namnsanning

"Value Ledger" är ett INTERNT namn. Användaren ser: sidan **"Pengar på
bordet"** med blocket **"Handymate den här månaden"** — fyra strikt
åtskilda steg: **Identifierat / Agerat / Fakturerat / Bekräftat betalt** —
plus **"Värdekvitto {månad}"**-raden på startsidan och **"Värdet i
{månad}"**-blocket i Månadsrapporten (Bekräftat / Vilande / Uppskattat,
"blandas aldrig"). Kronor i Fakturerat/Betalt är FAKTURANS belopp via
direktreferens (aldrig korrelation, aldrig kortets uppskattning);
tidsbesparing är konservativa schabloner och märks som uppskattning.
**Viktig ärlighet:** attributions-ID:na började persisteras 2026-08-12 —
siffrorna ackumulerar från NU. En demo idag visar demokontots seedade data;
en riktig kunds ledger är nästan tom första veckorna. **Status: BYGGT.**
Får sägas: "Handymate visar vad den hittat, vad som agerats och vad som
bevisligen betalats — åtskilt". Får INTE sägas: "har drivit in X åt kunder"
(ingen historik finns).

**Rörelse sedan 08-12 (uppmätt 08-14):** `customer_fact` gick från 0 till
**1 rad** — men den kommer också från Golden Path-harnessets körning mot
demokontot (`biz_0lovw5vcwzqn`, 2026-08-14 04:32, ett riktigt
`evidence_quote`-citat om ett telefonnummer), inte en riktig kund. Första
gången ytan "Varför vet Handymate detta?" (§12, Kvittoprincipen Fall 1) har
NÅGOT alls att visa, men fortfarande obefintligt för alla 22 riktiga
företag. Nya värde-ramade godkännande-kvitton (de26aac1) har svagare men
äkta tecken på skarp användning: minst 2 riktiga godkännanden
(`confirm_payment` ×1, `review_auto_invoice` ×1) sedan de deployades 08-13
som skulle triggat den nya texten — men ingen loggning bevisar att en
användare faktiskt såg den renderad.

## 7. Mobil (Expo-appen) — sämre än förra inventeringen trodde

**Uppmätt:** senaste LYCKADE EAS-production-bygget är okänt/gammalt;
2026-05-12/15-försöken FAILADE (cert-problem). 2026-08-11 gjordes nya
preview-byggen — de **KRASCHAR vid start på iOS 26** (känd PAC/Hermes-bugg;
newArch-avstängd variant hjälpte inte). Apparbetet är PARKERAT ("måste fixa
appen ordentligt", Andreas). Dessutom: main i mobilrepot ligger **28 commits
före origin** (hela Jarvis-first-mobilombyggnaden, opushad) och INGET av
det som byggts sedan maj finns på någon telefon.
**Status: appen kan INTE demoas och är INTE lanseringsyta. PWA:n
(webbappen installerad på hemskärmen, med push) ÄR mobilupplevelsen för
lanseringen** — och den är LIVE. Säg aldrig "ladda ner appen".

## 8. Lärande / moat

| Förmåga | Prod-data 2026-08-12 | Status |
|---|---|---|
| Förtjänad autonomi (streak → nyckel; nu med beloppsgräns + nåbar nedgradering + förtroendebevis-UI) | **0 kunder har beviljat autonomi** | BYGGT — säg "förtjänar", aldrig "brukar" |
| Expected-margin-snapshot vid offertaccept | 0 snapshots | BYGGT — ackumulerar från nu |
| Project Debrief → lärdomar → Daniels offertrad | 0 lärdomar | BYGGT — jobbtyps-scopad (fix 08-12) |
| Customer Facts ("Det här vet Handymate", offertprompt, projektsidans "Att tänka på") | **1 fakta** (upp från 0 — demokontot, Golden Path-harnesset 08-14, se §6) | BYGGT — supersede + åtkomstkodförbud på plats, 0 för alla 22 riktiga företag |
| Margin Guardian (kanonisk motor, orsaksrader) | 0 varningar | BYGGT |
| Värdeattribution (kort → artefakt → faktura → betalning, direktreferens) | börjar 08-12 | BYGGT |
| Egenkontroll-agenten (foto→bedömning) | 0 skarp användning | BYGGT (08-02) |
| Company Goals (omsättningsmål, #11) | **0/22 företag** har satt ett mål | BYGGT (08-13) |
| "Lär Handymate" (ägar-dikterade affärsregler i offertmotorn, #12) | **0 regler** skrivna i prod | BYGGT (08-13) |
| Next Best Action-rankning (Christoffers prioriteringsramverk) | **0 `priority_rule`, 0 `next_best_action`-rader** | BYGGT (08-13) — väntar på Christoffers dokument, se §10 |
| Dispatch-resonemang (Lars tilldelning synlig och sparad) | **0 rader ifyllda** | BYGGT (08-13), se §12 |
| Closeout-kortgruppering (`completion_batch_id`) | **2 rader / 1 batch** (demokontot, samma harness-körning) | LIVE mot demokontot, 0 mot riktig kund |

**Moaten är oförändrad i tes, kraftigt starkare i kod, och NÄSTAN HELT
obevisad i data:** varje lärande-primitiv finns nu och ackumulerar från
idag — men ingen RIKTIG firma har ännu en enda bekräftad lärdom, ett
kundfaktum eller en autonominyckel. Den enda datapunkten som rört sig
(1 kundfaktum, 2 closeout-kort) kommer från en och samma harness-körning
mot demokontot, inte från en betalande kund. Tid-i-drift är moatens
råvara; den börjar räknas när en riktig kund använder produkten, inte när
ett test gör det.

## 9. Vad som INTE finns (ärligt)

- **Pratande röstagent** — SPEC. Oförändrat.
- **Fortnox i skarp drift** — nej (0 sync-rader; licens-blockerad).
- **BankID** — SPEC.
- **ROT-fil inlämnad till Skatteverket** — nej (byggd, aldrig inlämnad).
- **Google-verifieringen inskickad** — nej (nya kunder får varningsskärm).
- **Mobilapp som går att visa** — nej (kraschar på iOS 26; PWA är svaret).
- **Ett enda riktigt möte genom mötesassistenten** — nej. `meeting_job` har
  1 rad men är ett 2-sekunders testförsök utan `recording_id`;
  `call_recording` har 1 rad men är demokontots harness-körning. Se §1.
- **En enda riktig lärdom/autonominyckel/Guardian-varning** — nej,
  fortfarande 0. **Kundfaktum:** teknisk gång 0→1, men den ena raden är
  demokontot (samma harness-körning), inte en riktig kund — se §6/§8.
- **Company Goals, "Lär Handymate"-regler, Next Best Action-rankning** —
  byggda 08-13, 0 rader/mål/regler i prod på alla tre, se §0b/§8/§10.
- **Ett riktigt projekt-case (Project Reality)** — nej, 0 naturligt
  förekommande i hela databasen trots ett skarpt API-bevis, se §11.
- **Företagskollen-leads** — 0 inskickade hittills (sidan är live).

## 10. VECKOMÖTET & NEXT BEST ACTION ENGINE — exakt sanning (GTM-kritisk)

Måndagsmötets fullskärms-takeover (byggd 08-13, `MandagsmoteTakeover.tsx`)
skrevs om 08-14 till en riktig dialog: agenterna (Karin/Daniel/Matte/Lars)
pratar i tur och ordning genom resultat → lärdomar → risker → förtroende,
och `lib/jarvis/mandagsmote.ts` (`byggVeckomoteRepliker`) genererar
replikerna ur samma data Måndagskortet redan visar. `/api/next-best-action`
fick ett additivt `recommendations`-fält (topp 3) som dialogens beslutskort
bygger på — RIKTIG NBA-rankning, inte mockup-exempeldata. Vad som INTE
ändrades (blast radius minimerad): `lib/jarvis/monday-brief.ts` äger
fortfarande n>0-regeln för de fyra sektionerna, och godkänn-vägen är
fortfarande samma `/api/approvals/:id` — ingen ny endpoint.

**Verifierat:** `npx tsc --noEmit` rent, 75/75 nya/uppdaterade facit gröna
(`mandagsmote-takeover.spec.ts`), `npx next build` rent, full svit 5467
gröna/0 failed. Datakontraktet MCP-verifierat mot seedad (sedan städad)
testdata på Andreas eget interna testkonto (`business_name='Test'`,
`biz_al7pjuu5smi` — INTE Bee, den riktiga piloten) — bekräftar att
`next_best_action`-radens form och `monday_brief`-payloaden matchar exakt
vad koden förväntar sig. Det bevisar datakontraktet, INTE den faktiska
renderingen/interaktionen i en webbläsare, och inte mot en betalande
kunds data.

**Blockerat:** en riktig, inloggad browser-klick-genom gick INTE att köra.
`tests/auth.setup.ts`s magic link-inloggning studsar tillbaka till
`/login` inom en sekund (reproducerat tre gånger, även mot en helt orörd
befintlig test) — trolig orsak: admin-genererade länkar är inte
kompatibla med appens PKCE-baserade `/auth/callback`. En fungerande omväg
hittades samma natt under Project Reality-passet (§11) men har inte
porterats in i den delade testriggen.

**Prod-verkligheten: `next_best_action` = 0 rader, `business_knowledge`
med `knowledge_type='priority_rule'` = 0 rader.** Motorn kan alltså i
praktiken inte visa något förrän minst en `priority_rule` finns — väntar
på Christoffers prioriteringsdokument.

**Status: BYGGT**, deployat, datakontrakt bevisat, INTE
browserverifierat, NOLL skarp data att rangordna ännu. Får sägas:
"Handymate rankar dina konkurrerande beslut efter dina egna
prioriteringar" (som bevisad mekanism). Får INTE sägas: "visar dig vad
som är viktigast idag" som om det redan sker hos en kund — det gör det
inte förrän en `priority_rule` finns och beräkningen faktiskt körts.

## 11. PROJECT REALITY + CROSS-AGENT CASE (Business Twin #9 V1) — exakt sanning (GTM-kritisk)

Ny funktion 08-14: när minst två OLIKA agenter (t.ex. Karin + Daniel) har
en pending-approval-signal på SAMMA projekt, grupperas de till ett
"projekt-case" på startsidan (`hittaProjektCase` i
`lib/jarvis/project-case.ts`, ren funktion, kräver ≥2 distinkta
signaltyper) med projektets ekonomi och fas
(`deriveProjectReality`/`lib/projects/project-reality.ts`, komposition av
redan kanoniska `computeProjectEconomics`+`deriveProjectLifecycle` — inga
nya beräkningar, inget nytt lagrat). `ProjektCaseKort.tsx` har inga egna
knappar (fyra-ögon-regeln bevarad, samma mönster som
`completion_batch_id`).

**Verifierat:** `npx tsc --noEmit` rent, 26 nya facit-tester gröna
(`tests/project-case.spec.ts`, `tests/project-reality.spec.ts`), full
svit 5762 gröna/0 failed, `npx next build` rent.

**Live-verifierat mot skarp prod — ett genombrott i testmetoden i sig:**
ett engångsskript kringgick den kända auth-luckan (ovan, §10) genom att
generera OCH konsumera en magic link server-side
(`supabase.auth.verifyOtp({token_hash, type:'magiclink'})`) i stället för
att navigera en webbläsare dit — gav ett riktigt `access_token`, använt
som `Authorization: Bearer` direkt mot den skarpa routen. Seedad testdata
(2 signaler, olika typ, på ett riktigt existerande projekt på Andreas
eget interna testkonto, `business_name='Test'`, `biz_al7pjuu5smi` — INTE
Bee, den riktiga piloten) → `GET /api/project-cases` → **HTTP 200**, exakt
förväntat svar (ett case, rätt agentId, `fasLabel: "Pågår"`, marginal
ärligt `null` när kostnad saknas — hellre tyst än gissat). Städat direkt
efter, 0 kvar.

**Prod-verkligheten: 0 naturligt förekommande case i hela databasen.** Av
de fyra signaltyperna har bara `missad_intakt` några rader alls (2
pending, 1 rejected) — `profitability_warning`, `create_ata_draft` och
`fakturera_projekt` har ZERO rader totalt i hela prod. Funktionen är
korrekt byggd och skarpt API-verifierad, men väntar på verklig
signalvolym — samma mönster som Måndagsmötet/NBA.

**Status: BYGGT, API-lagret skarpt bevisat, 0 naturlig data.** Får sägas:
"Handymate kopplar ihop flera agenters observationer om samma projekt"
(bevisat att fungera mot skarp kod). Får INTE sägas att det redan HÄNDER
hos en kund — det har det inte.

## 12. KVITTOPRINCIPEN — synlig intelligens (Fall 1-4)

Designstrategi (`docs/design/SYNLIG-INTELLIGENS.md`, 08-13, kallad
"Fable 5" internt): "en slutsats får bara visas med sitt kvitto, skrivet
av beräkningen själv, aldrig i efterhand." Fyra fall byggda samma dag:

- **Fall 1** — Daniels bedömning (resonemang, regler, lärdomar,
  kundfakta) syns nu i offerteditorn. Ren klient-rendering av redan
  beräknad `GeneratedQuote`-data, inget nytt att räkna i prod. **BYGGT.**
- **Fall 2** — Guardians orsaksrader delas mellan godkännandekortet och
  projektsidan via en gemensam `computeGuardianVarningForProject`-kärna +
  `GuardianOrsaker.tsx`. **BYGGT** — men `profitability_warning` = 0
  rader i prod (§5), så komponenten har aldrig renderats mot riktig data.
- **Fall 3** — radnivå-osäkerhet (`ai_uncertain`/`ai_note`) syns nu även i
  dokument-canvasen, inte bara editorn. Fälten är avsiktligt flyktiga
  (sätts bara vid AI-konvertering, strippas innan `quote_items` sparas)
  — designat för att INTE lämna ett DB-spår, går alltså inte att räkna i
  prod. **BYGGT.**
- **Fall 4** — Lars tilldelningsresonemang sparas nu i stället för att
  kastas (`dispatch_reasoning` JSONB på `booking`/`work_orders`, v130,
  syns i schema-vyn). **BYGGT** — 0 rader ifyllda i prod ännu.

**Status: alla fyra BYGGT, ingen LIVE ännu** — samma mönster som resten av
denna klunga: kräver att Guardian eller dispatch faktiskt producerar en
signal i prod först, vilket inte har hänt.

---

## Bottom line för pitchen (2026-08-12, uppdaterad 08-14)

**Kan visas/lovas UTAN att ljuga:**
- Missat samtal → SMS → bokning (kärnkilen; 46elks LIVE).
- **Startsidan**: "öppna appen — se vad som behöver dig, vad teamet sköter,
  var pengarna riskeras" (demoa; deployad 08-12, säg inte "beprövad").
- **Hela livscykeln på DEMOKONTOT, nu bevisad i EN sammanhängande körning**:
  möte → transkript → kort → offert → projekt → efterkalkyl → debrief →
  lärdom → nästa offert → stängning (Golden Path-harnesset, §4, 08-13).
  Seedad och demo-körbar (Guardian-varningen hoppas fortfarande över —
  demokontot saknar konfigurerad timkostnad). Formulering: "så här
  fungerar det, och vi har kört det själva end-to-end" — inte "så här har
  det fungerat för våra kunder".
- Golden Path i pilotdrift (Bee: vunna affärer + betalda fakturor finns)
  OCH harness-bekräftad mot skarp kod (§4).
- Betalvägen (Stripe B7 bevisad). Kalendersynk (LIVE hos pilot).
- Värdesynlighet: "identifierat/agerat/fakturerat/betalt hålls åtskilt".
- PWA på mobilen (installera + push).
- Veckomötet (§10) och projekt-case (§11): datakontrakt/API-lagret är
  skarpt bevisat mot skarp kod (via Andreas eget interna testkonto, INTE
  Bee) — beskriv som "mekaniken fungerar", aldrig som en pågående
  kundupplevelse (0 rader i naturlig prod-data på båda, hos alla riktiga
  företag).

**Får INTE sägas i demo/annons (dödar trovärdighet):**
- ❌ "AI:n lyssnar på dina möten" / "i realtid" — den SPELAR IN på
  knapptryck och analyserar EFTERÅT. Säg "spela in mötet, få allt sorterat".
- ❌ "Hanterar ÄTA automatiskt från mötet" — den föreslår ett OFFERTUTKAST
  märkt ÄTA som du granskar.
- ❌ "Handymate har lärt sig våra kunders företag" — 0 lärdomar/fakta i
  prod; säg "lär sig ERT företag" (framåtblickande).
- ❌ "Har drivit in X kr åt kunder" — attributionshistoriken börjar idag.
- ❌ "Kopplar till Fortnox" utan licens-brasklappen (kundens licens 149
  kr/mån krävs; aldrig skarpkörd).
- ❌ "En AI som pratar i telefon" — SPEC, finns inte.
- ❌ "Ladda ner appen" — appen kraschar; PWA:n är mobilupplevelsen.
- ❌ "Command Center" / "Margin Guardian" / "Value Ledger" som produktnamn
  kunden möter — de heter Startsidan, Karins varningar och Pengar på
  bordet/Värdekvittot i produkten. (GTM får gärna DÖPA koncepten i
  marknadsföring — men demon måste då säga "det här kallar vi X".)
- ❌ "Handymate rankar dina beslut åt dig" / "vet vilket projekt som
  behöver dig mest" som om det redan sker för en kund — Next Best Action
  och Project Reality har 0 naturliga rader i prod (§10, §11); mekaniken
  är bevisad, upplevelsen är inte levd av någon kund än.
- ❌ "Har haft ett riktigt kundmöte" — meeting_job/call_recordings rörelse
  sedan 08-12 är ett testförsök + en demokontokörning, inte en kund (§1).

**Verifieringar som flyttar BYGGT → LIVE (= Reality Week, protokoll i
docs/REALITY-WEEK.md):**
1. ~~Pass 1: gyllene vägen station 1-14 på demokontot~~ — **KLART
   2026-08-13** (bf29d749, se §4). Undantag som kvarstår öppet: "mötet
   genom mötesassistenten" i harnesset var en 18-minuters demokörning
   (och den tidigare Bee-raden ett 2-sekunders testförsök) — INGET av
   dem räknas som ett riktigt kundmöte (§1).
2. Pass 2: adversarial A1-A15 — kvarstår.
3. Pass 3: integrationsfelvägar + PWA på riktig iPhone + Google-
   verifiering inskickad — kvarstår.
4. Första RIKTIGA kundmötet/lärdomen/autonominyckeln/projekt-caset hos
   pilot (post-launch räcker — men först då får "beprövat" användas).
   Kundfaktum har rört sig tekniskt (0→1) men på demokontot, inte hos
   Bee — räknas alltså INTE som uppfyllt än.

## §13 Planstruktur (oförändrad sedan 2026-07-31)

Firman 5 995 kr/mån (professional) + Storfirman 11 995 kr/mån (business) +
"Anpassad — kontakta oss". Starter/Bas (2 495) FÖRBJUDEN i allt publikt.
Interna marginaltak beskrivs aldrig som tokens/tak — kundspråket är "normal
användning". Ingen trial — betala direkt + pengarna-tillbaka-garanti.
