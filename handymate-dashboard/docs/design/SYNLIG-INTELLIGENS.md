# Synlig intelligens — Kvittoprincipen

**Datum:** 2026-08-13 · Status: STRATEGI (styrande för UI-byggen)
**Mål:** kunden ska SE att ett team resonerar om hens affär — inte bara
att ett system registrerar data. Skillnaden mot dinosaurie-CRM:en ska
finnas på skärmen, inte bara i koden.

## Problemet (verifierat mot kod 2026-08-13)

Handymate räknar ut mer intelligens än det visar. Tre bevisade läckor:

1. **Offertens resonemang visas aldrig.** `GeneratedQuote.reasoning`
   (lib/ai-quote-generator.ts) — modellens egen förklaring av offerten —
   renderas ingenstans i app/. Detsamma gäller syskonfälten `rules`
   (ägarens aktiverade affärsregler), `lessons` (bekräftade debrief-
   lärdomar) och `customerFacts` (bekräftade kundfakta). Ur SAMMA svar
   visas redan `confidence` (badge i QuoteNewHeader) och
   `notIncludedSuggestions` (bockbara rader) — mönstret finns, det
   applicerades bara aldrig på resonemanget. Verifierat live-exempel
   kunden aldrig fick se: *"AFFÄRSREGEL AKTIVERAD: Kunden önskar ett
   pris under 25 000 kr … Ägarens affärsregel anger att
   badrumsrenoveringar under 30 000 kr inte tas emot – de är nästan
   aldrig lönsamma … bör avböjas eller prissättas korrekt mot kunden."*
2. **Guardian-orsakerna dör med kortet.** Lönsamhetsvarningens
   orsaksrader (`GuardianOrsak[]`, lib/projects/margin-guardian.ts)
   renderas på godkännandekortet (approvals/page.tsx, JarvisHome) — men
   projektdetaljsidan (projects/[id]/page.tsx) refererar dem aldrig och
   räknar i stället fram en grövre egen överbudget-signal ur värsta
   milstolpen. När kortet är hanterat är det riktiga resonemanget borta.
3. **Radnivå-säkerheten plattas till.** Varje offertrad har egen
   `confidence` + `note`, men `convertLegacyItems` (quotes/new/page.tsx)
   slänger confidence helt och plattar note till en boolean
   (`ai_price_missing`). En rad Daniel är 60 % säker på ser identisk ut
   med en han är 95 % säker på.

**Motbeviset:** ProjectEconomics (lib/projects/compute-economics.ts)
når skärmen fullt ut — completeness-procent, KÄNT/UPPSKATTAT,
timrader_utan_kostnad konsumeras alla av MarginalCard/EkonomiPulsCard/
KostnadCard. Hela kedjan beräkning→skärm fungerar. Det här är alltså en
prioriteringslucka, inte en arkitekturlucka.

## Principen: Kvittot följer alltid med

Hantverkare litar på kvitton, inte på påståenden. Samma regel gäller
teamet:

> **En slutsats får bara visas tillsammans med sitt kvitto — och
> kvittot skrivs av beräkningen som fattade slutsatsen, aldrig i
> efterhand.** Finns inget kvitto visas mindre, aldrig ett påhittat.

Kvittot är redan skrivet i koden (reasoning-fälten, orsaksraderna,
completeness-flaggorna). Jobbet är att bära det till ytan. Kvittot
svarar alltid i samma ordning, på alla ytor:

1. **Vad som var känt** (fakta, registrerade siffror)
2. **Vad som antogs** (uppskattningar, prognoser)
3. **Vilka av DINA regler, lärdomar och kundfakta som spelade in**

Punkt 3 är differentieringen. Ett system som citerar ägarens egna
regler tillbaka till honom ("din regel om badrum under 30 000 kr slog
till här") kan inte förväxlas med ett register.

### Tre lager i visuella grammatiken

**Lager 1 — Siffran och dess ärlighetsmarkörer (alltid inline).**
KÄNT/UPPSKATTAT, "Preliminär"-pillen, "Osäker"-markören är en del av
själva värdet och göms aldrig bakom klick, på någon yta. Prejudikat:
evidence-ramen i customers/[id] ("att gömma bakom expand/collapse hade
varit en transparens-regression") och MarginalCards regel att färg
förtjänas — grön/röd först när datat bär den, annars slate-grå.

**Lager 2 — Kvittot (inline eller bakom "Visa varför", efter ytans
roll).**
- **Beslutsyta** (kort i kön, JarvisHome, varningar): kvittot inline,
  alltid. Ingen ska klicka sig fram till det den ska godkänna.
- **Arbetsyta** (offert-editorn, detaljsidor, listor): en
  sammanfattningsrad + expansionen **"Visa varför"** — exakt den
  etiketten överallt, aldrig "Detaljer"/"Mer info". **Undantag:** om en
  affärsregel aktiverats eller något avråds öppnas kvittot expanderat
  från start — en regel som säger "ta inte jobbet" får inte gömma sig.
- Expansionens form återanvänder evidence-ramen: vänsterkant i
  primary, liten versal-etikett som ställer frågan ("Varför detta
  pris?"), sedan innehållet.

**Lager 3 — Rösten (agentattribuering).**
- **Bedömningar** (förslag, varningar, fynd, resonemang) attribueras
  alltid till en namngiven agent — prick/porträtt ur AGENT_INFO, aldrig
  en ny färgkarta (D1-lärdomen: kopior gled isär). Verbet härleds ur
  card-voice (föreslår/frågar) — aldrig hårdkodat.
- **Aritmetik** (summa, marginal, procent) attribueras inte. En summa
  är inte en åsikt — att sätta Karins ansikte på varje tal vore teater.
- Aldrig "AI:n"/"systemet" i UI-text. Alltid namnet: Karin, Daniel,
  Lars, Hanna, Lisa, Matte.

**Grundton: lugn.** Tystnad är normaltillståndet. Markörer dyker upp
när något förtjänar uppmärksamhet — inte som dekor på varje rad. Det är
det som skiljer "ett team som tänker" från "en produkt som blinkar".

### Semantikreglerna (får aldrig blandas)

| Markör | Betyder | Var den får användas |
|---|---|---|
| **KÄNT** | registrerad faktisk siffra | orsaksrader, ekonomikort |
| **UPPSKATTAT** | prognos/antagande — grå kursiv | samma ytor, aldrig omfärgad till "nästan känt" |
| **Säkerhet NN %** | modellens egen siffra ur svaret | endast där modellen faktiskt gav den (offerter) |
| **Preliminär/Bekräftad** | datakompletthet, härledd | ekonomikorten (finns) |

KÄNT/UPPSKATTAT och procent-säkerhet är två olika sanningar (fakta-
status respektive modellens självskattning) och visas aldrig som
varandra.

## Tillämpning på de tre fallen

### Fall 1 — Daniels bedömning i offert-editorn (SKEPPAS FÖRST, beslutat)

**Idag:** reasoning/rules/lessons/customerFacts genereras, returneras
och slängs. Kunden ser en procent-badge i headern och inget mer.

**Ska:** ett block **"Daniels bedömning"** direkt under headern efter
generering, före radlistan. Arbetsyta ⇒ ihopfällt till en rad — utom
när `rules` är icke-tom: då expanderat från start (regel-undantaget).

Ihopfällt:
> ⟨Daniel-porträtt⟩ **Daniels bedömning** · 2 regler · 1 lärdom · **Visa varför**

Expanderat:
> ⟨Daniel-porträtt⟩ **Daniels bedömning** · säkerhet 75 %
> *"Kunden önskar ett pris under 25 000 kr. Din affärsregel anger att
> badrumsrenoveringar under 30 000 kr inte tas emot — jobbet bör
> avböjas eller prissättas om."* ← `reasoning`, modellens egna ord
> ─ **Din regel** · Badrumsrenoveringar under 30 000 kr tas inte emot
> ─ **Lärdom** · Rivning av gammalt tätskikt tar ofta 4–6 h extra
> ─ **Kundfakta** · Vill alltid ha fakturan via e-post

Radetiketterna är "Din regel" / "Lärdom" / "Kundfakta" — allt tre är
kundens EGEN bekräftade kunskap som återanvänds, och copyn ska säga
det. Tomma listor renderar ingen rad; tomt `reasoning` renderar inget
block alls (aldrig ett tomt skal). Säkerhetsprocenten flyttar in i
blocket och badgen i headern kan på sikt pensioneras — en sanning, en
plats.

### Fall 2 — Guardian-orsakerna på projektsidan

**Idag:** orsaksraderna renderas bara på godkännandekortet.
Projektsidan visar en egen, grövre överbudget-beräkning — två varningar
om samma projekt kan säga olika saker.

**Ska:** orsaksrads-renderingen lyfts ur approvals/page.tsx till en
delad komponent (`components/projects/GuardianOrsaker.tsx`) och
monteras även på projektdetaljsidans ekonomiyta, så länge motorn
flaggar projektet — oberoende av om kortet är hanterat:

> ⟨Lars-prick⟩ **Lönsamhetsvarning** — amber kort
> Extra el-dragning i badrum ────────────── **+8 400 kr** (KÄNT)
> *Prognos återstående timmar ───────────── +12 000 kr* (UPPSKATTAT, grå kursiv)
> Materialkostnad våtrumsskiva ──────────── **+3 100 kr** (KÄNT)

Samma rader, samma stil (UPPSKATTAT grå/kursiv), samma länkar till
underliggande ärenden som på kortet — en sanning, två ytor, exakt som
MarginalCard/EkonomiPulsCard redan delar `deriveMarginalState`.
Projektsidans egen grövre milstolpe-signal underordnas eller tas bort:
den kanoniska motorn vinner, två motstridiga varningar är förbjudna.

### Fall 3 — Osäkra rader i offerten

**Idag:** `convertLegacyItems` slänger radens `confidence` och plattar
`note` till en boolean. Alla rader ser lika säkra ut.

**Ska:** confidence + note följer med genom konverteringen in i
raddatat. ItemRow visar en tyst markör ENDAST på rader under tröskeln
(förslag: 70 %): en liten amber-pill **"Osäker"** vid beskrivningen,
och modellens egen `note` som liten rad under (t.ex. *"Mängden är svår
att bedöma från fotot — kontrollera"*). Rader ≥ 70 % visar ingenting —
tystnad är normalläget; en grön bock på varje säker rad vore brus.
Procenttalet i sig visas inte per rad (falsk precision i en lista);
pillen + noten räcker. `ai_price_missing`-beteendet behålls oförändrat.

## Ordning

**Före frysen 2026-08-25** (billigt, återanvänder befintliga mönster):

1. **Fall 1 — Daniels bedömning.** Beslutat att skeppas först. Ren
   rendering av data som redan finns i svaret; evidence-ramen och
   AGENT_INFO finns.
2. **Fall 2 — GuardianOrsaker delas.** Komponentlyft + montering; noll
   ny beräkning, noll schema. Tar samtidigt bort den motstridiga egna
   signalen.

**Efter lansering:**

3. **Fall 3 — radnivå-säkerhet.** Rör raddatamodellen och
   konverterings-/sparkedjan; värdet är störst tillsammans med en
   granskningsvana som hinner sätta sig efter lansering.
4. **Utrullning av "Visa varför"** som stående affordans på fler ytor
   (kundfakta har den redan i inline-form; kandidater: JarvisHome-kort
   med långa motiveringar, Karins påminnelseförslag).

## Hårda gränser (ärlighetsprincipen)

Det här får strategin ALDRIG göra — hellre en tom yta än en lögn:

- **Inget efterhandsresonemang.** Kvittot kommer ur samma beräkning/
  svar som producerade siffran. Aldrig ett separat anrop som ombeds
  "förklara" ett tal det inte räknade fram.
- **Ingen tankesimulering.** Inga spinners, skrivanimationer eller
  "teamet analyserar…" som inte motsvarar pågående faktiskt arbete.
- **Inga påhittade siffror.** Säkerhetsprocent visas bara där modellen
  gav den; en default (t.ex. fallback 50) renderas aldrig som om den
  vore en bedömning. Aldrig en gissad siffra som ser exakt ut.
- **Tomt är normalt.** Tom `rules`/`lessons`-lista ⇒ ingen sektion.
  Aldrig platshållartext som låtsas att kunskap finns.
- **KÄNT och UPPSKATTAT blandas aldrig**, och en uppskattning byter
  aldrig kostym till fakta för att den "känns säker".
- **Röst och knappar härleds, hårdkodas aldrig** (card-voice-lärdomen:
  ett kort som inte KAN utföra något får aldrig låta som att det kan).

## Verifiering

tsc + build som alltid. Facit-tester där det bär: Fall 1 — regelfallet
renderar expanderat, tomt reasoning renderar inget block; Fall 2 —
projektsidan och kortet visar samma orsaksrader för samma projekt;
Fall 3 — rad under tröskeln får markör + not, rad över får ingenting.
