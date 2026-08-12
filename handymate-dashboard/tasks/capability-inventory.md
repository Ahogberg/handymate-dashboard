# Handymate — Ärlig kapabilitets-inventering

_För pitch-/GTM-ändamål. Ingen hype — vad som FAKTISKT finns._
_Genererad 2026-07-01 · **Helt omskriven 2026-08-12** (kod-, git- OCH
prod-DB-verifierad via Supabase samma dag — radantal nedan är verkliga)._

## Statusdefinitioner (läs först)
- **LIVE** = deployat OCH driftsatt/körande i prod, rimligt bekräftat
  (helst med prod-data som bevis).
- **BYGGT** = i `main`, tsc+build rent, EJ verifierat med riktig prod-körning.
- **SPEC** = inte byggt.

**Epistemisk not:** den här versionen är starkare än tidigare — statusen är
inte bara kodläsning utan avstämd mot prod-databasen (radantal per tabell,
2026-08-12). Där det står "0 rader i prod" är det uppmätt, inte gissat.
**En pitch byggd på fejk-kapabilitet dör vid första demon.**

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

**Migrationsläget:** v116–v122 KÖRDA och verifierade. Prod-skulden är noll.
Väntar på engångskörning: `sql/demo_seed_internal_cost.sql` (demokontot).

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
| **46elks** (SMS + röst) | **LIVE** | Rullar i prod (SMS-rader senaste veckan). Strypunkten: allt går via sendSmsViaElks med opt-out-spärr. Telefonins inspelning/analys: 0 nya inspelningar på 30 dagar — vägen finns men används inte just nu. |
| **Stripe** | **LIVE** (betalväg bevisad) | **B7-testköpet KÖRT** — billing_event-rader finns i prod (senast 2026-08-09). 4 aktiva prenumerationer varav 1 verifierat riktig pilot (Bee). Webhook hanterar checkout/subscription/invoice-events. Kvar: B8 (skarp betalning från riktig ny kund). |
| **Google Calendar** | **LIVE** | 3 kopplingar (inkl. Bee), **91 synkade externa händelser i prod**. OAuth-klienten flyttad till eget handymate.se-projekt 08-12, synk om-verifierad. **Google-VERIFIERINGEN är EJ inskickad** — nya kunder möter varningsskärm tills dess. Gmail-delen pausad ("kommer snart"). |
| **Fortnox** | **BYGGT men LICENS-BLOCKERAD** | Rutträdet konsoliderat + api-logg (08-10) — men `fortnox_sync` har **0 rader i prod**: ingen synk har någonsin körts skarpt. Kundens integrationslicens 149 kr/mån är fortfarande grinden (Christoffer har inte köpt). Funktionellt = går ej att demoa med riktig data. |
| **Vapi** (röst-AI) | **SPEC** | Oförändrat. `vapi_call` är bara en käll-ETIKETT på 46elks-webhooken. En vilande edge-function från februari finns; inget i appen anropar den. INGEN pratande röstagent existerar. |
| **OpenAI Whisper** | **BYGGT/LIVE** | Transkribering (svenska) används av röst-input; mötesvägen byggd men oanvänd (se §1). |

## 4. Golden Path — statusflytt

`lead → deal → offert → projekt → faktura → betalning`

**Uppmätt i prod 2026-08-12: Bee Service AB (riktiga piloten) har 4 vunna
deals och 2 betalda fakturor.** Tillsammans med A-testet (godkänt),
B7-betalningsbeviset (billing_event) och körboken ger det:
**Golden Path = LIVE med brasklapp** — kedjan har bevisligen producerat vunna
affärer och betalda fakturor hos en riktig kund, men vi har inte spårat EN
enskild deal dokumenterat genom VARJE station i följd (det är Reality Week
pass 1:s jobb, protokoll: docs/REALITY-WEEK.md). Säg "kedjan är i drift hos
pilot", lova inte "felfri hela vägen varje gång".

## 5. "Guardian" / Margin Guardian — namnsanning

"Guardian"/"Margin Guardian" är INTERNA namn — orden finns inte i UI.
Användaren ser: **Karins varningskort** "🔴 Budget överskriden — {projekt}"
/ "⚠️ Riskerar överskridning — {projekt}" med orsaksrader (timmar, material,
osignerad ÄTA, obesvarat ÄTA-förslag, prognos — märkta känt/uppskattat) och
knappen "Jag har sett det" + "Öppna projektet". På Pengar på bordet heter
kategorin **"Marginal i riskzonen"** (gruppen "Risk"). Byggd på kanoniska
ekonomimotorn (ärlighetsprincip: ingen marginal utan konfigurerad intern
timkostnad — hellre "ej konfigurerad" än påhitt). Push endast vid
över-budget. **Prod: 0 varningskort hittills** (inga projekt över tröskeln,
eller ingen data ännu). **Status: BYGGT.** I GTM: beskriv funktionen
("Karin varnar innan projektet äter marginalen — med orsaker"), använd inte
"Guardian" som produktnamn. KÄND SKÖNHETSFLÄCK: kortets typ-etikett i kön
visar "Övrigt" (etikett saknas i TYPE_CONFIG) — fixas i polish.

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
| Customer Facts ("Det här vet Handymate", offertprompt, projektsidans "Att tänka på") | 0 fakta | BYGGT — supersede + åtkomstkodförbud på plats |
| Margin Guardian (kanonisk motor, orsaksrader) | 0 varningar | BYGGT |
| Värdeattribution (kort → artefakt → faktura → betalning, direktreferens) | börjar 08-12 | BYGGT |
| Egenkontroll-agenten (foto→bedömning) | 0 skarp användning | BYGGT (08-02) |

**Moaten är oförändrad i tes, kraftigt starkare i kod, och HELT obevisad i
data:** varje lärande-primitiv finns nu och ackumulerar från idag — men
ingen firma har ännu en enda bekräftad lärdom, ett kundfaktum eller en
autonominyckel. Tid-i-drift är moatens råvara; den börjar räknas nu.

## 9. Vad som INTE finns (ärligt)

- **Pratande röstagent** — SPEC. Oförändrat.
- **Fortnox i skarp drift** — nej (0 sync-rader; licens-blockerad).
- **BankID** — SPEC.
- **ROT-fil inlämnad till Skatteverket** — nej (byggd, aldrig inlämnad).
- **Google-verifieringen inskickad** — nej (nya kunder får varningsskärm).
- **Mobilapp som går att visa** — nej (kraschar på iOS 26; PWA är svaret).
- **Ett enda riktigt möte genom mötesassistenten** — nej (0 i prod).
- **En enda riktig lärdom/kundfaktum/autonominyckel/Guardian-varning** — nej.
- **Företagskollen-leads** — 0 inskickade hittills (sidan är live).

---

## Bottom line för pitchen (2026-08-12)

**Kan visas/lovas UTAN att ljuga:**
- Missat samtal → SMS → bokning (kärnkilen; 46elks LIVE).
- **Startsidan**: "öppna appen — se vad som behöver dig, vad teamet sköter,
  var pengarna riskeras" (demoa; deployad idag, säg inte "beprövad").
- **Hela livscykeln på DEMOKONTOT**: möte → kort → offert → projekt →
  Guardian-varning → efterkalkyl → debrief → lärdom → nästa offert. Seedad
  och demo-körbar. Formulering: "så här fungerar det" — inte "så här har
  det fungerat för våra kunder".
- Golden Path i pilotdrift (Bee: vunna affärer + betalda fakturor finns).
- Betalvägen (Stripe B7 bevisad). Kalendersynk (LIVE hos pilot).
- Värdesynlighet: "identifierat/agerat/fakturerat/betalt hålls åtskilt".
- PWA på mobilen (installera + push).

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

**Verifieringar som flyttar BYGGT → LIVE (= Reality Week, protokoll i
docs/REALITY-WEEK.md):**
1. Pass 1: gyllene vägen station 1-14 på demokontot (inkl. första mötet
   genom mötesassistenten — någonsin).
2. Pass 2: adversarial A1-A15.
3. Pass 3: integrationsfelvägar + PWA på riktig iPhone + Google-verifiering
   inskickad.
4. Första RIKTIGA kundmötet/lärdomen/autonominyckeln hos pilot (post-launch
   räcker — men först då får "beprövat" användas).

## §10 Planstruktur (oförändrad sedan 2026-07-31)

Firman 5 995 kr/mån (professional) + Storfirman 11 995 kr/mån (business) +
"Anpassad — kontakta oss". Starter/Bas (2 495) FÖRBJUDEN i allt publikt.
Interna marginaltak beskrivs aldrig som tokens/tak — kundspråket är "normal
användning". Ingen trial — betala direkt + pengarna-tillbaka-garanti.
