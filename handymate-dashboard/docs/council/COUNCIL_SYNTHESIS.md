# Handymate Architecture Council — Synthesis

**Round 2: Product Architecture Review & Synthesis**
**Datum:** 2026-08-07
**Roll:** Product Architect (Claude Code)
**Underlag:** checkat ut `main`, `docs/council/PRIORITY_PROPOSAL_CODEX.md`, moat- och
kartläggningsdokumenten inklusive mina granskningsnoter från 2026-08-06, Karin V1 som jag
byggde 2026-08-07, samt riktad verifiering av Codex faktapåståenden.

*Utkast — verifieringsresultat fylls i löpande.*

---

## 1. Executive decision

**Handymate ska inte bygga nästa moat. Det ska göra en pengaloop sann, och sedan låta en
riktig hantverkare använda den.**

Jag delar Codex kärntes helt. Men verifieringen ändrade grunden för den på ett avgörande sätt:

> **Intäktssvepet — Codex rank 1, och hela 90-dagarsprogrammets kundvärde — har med all
> sannolikhet aldrig skapat ett enda kort.**

`app/api/cron/missed-revenue/route.ts:65` selectar `id` från `project_change`. Tabellens
primärnyckel heter `change_id` (`sql/projects.sql:71`) och ingen migration lägger till `id`.
All annan kod i repot använder `change_id`. PostgREST svarar 42703, felkontrollen på rad 89–91
kastar, och catchen på rad 112 hoppar över **hela företagets svep — alla tre reglerna**, inte
bara ÄTA-regeln.

Och skulle kortet ändå skapas: `missad_intakt` förekommer på exakt två ställen i kodbasen,
båda i cron-filen. Det finns **ingen handler**. Godkänner hantverkaren kortet faller det i
`default:` och returnerar "Godkänt utan specifik åtgärd". **Kortet är en återvändsgränd.**

Det här är inte ett undantagsfall — det är husets återkommande felmönster. `advanceDealFlow`
har ingen anropare. `learning_events` avvisades av Postgres i månader utan att någon märkte
det. `MorningBriefWidget` monteras ingenstans. `invoice_sent` är märkt ✅ i eventkontraktet men
finns bara i död kod. Auto-fakturans sändning använder en `_internal_business_id`-workaround
som repot självt dokumenterat som död sedan 2026-06-02.

**Handymates begränsning är inte att funktioner saknas. Det är att funktioner skeppas utan
anropare, och att ingenting upptäcker det.**

Därför är min ordning:

| Våg | Vad | Varför |
|---|---|---|
| **0 — ograderat** | Säkerhetsgrinden (tenant-hålet, fail-open-cron) **och pilottestet** | Ett tenant-hål poängsätts inte. Och pilotgrinden har stått öppen i 24 timmar medan fyra bygg passerat den |
| **1** | Gör pengafakta sanna: fyra verifierade defekter + en röktest-svit som bevisar att varje skeppad väg faktiskt kör | Utan det bygger vi ovanpå fiktion |
| **2** | Revenue Recovery V1 — men "få loopen att *finnas*", inte "stänga" den | Detektionen är död, kortet är en återvändsgränd, och det finns ingen tvärgående vy |
| **3** | Offer-to-Reality pålitlighet + Karin V2 fulfillment | Båda är färskvara och båda är billiga nu |

Beslutsposter (modell, promptversion, indata, utfall) läggs till löpande i våg 1–3 därför att
de är **färskvara** — varje dag utan dem är data permanent förlorad. Company Model, Outcome
Graph, Job Genome, Protocol och Marketplace är **uppskjutbara** och ska inte konsumera 90 dagar.

Jag avviker från Codex på en punkt av vikt: **den varaktiga eventjournalen behövs inte än.**
Se 2.1.

---

## 2. Granskning av Codex förslag

Codex proposal är den bästa analysen någon producerat om den här kodbasen. Kärntesen — att
stänga en pengaloop i stället för att bygga nästa moatnamn — håller jag med om utan reservation.
Nedan gäller avvikelserna.

| Codex rekommendation | Min bedömning | Skäl |
|---|---|---|
| Kärntes: stäng pengaloopen, bygg inte nästa moat | **AGREE** | Matchar mina egna granskningsnoter från 2026-08-06 oberoende |
| Rank 1: Close Revenue Recovery loop | **AGREE** | Enda kandidaten som kan visa återvunna kronor inom 90 dagar |
| Rank 2: Durable money lifecycle spine (journal + outbox, 12 eventtyper) | **PARTIALLY AGREE** | Se 2.1 — min enda större invändning |
| Rank 3: Evidence-to-invoice readiness | **NEEDS EVIDENCE** | Se 2.2 |
| Rank 4: Offer-to-Reality reliability | **AGREE** | Redan sluten loop, behöver bli pålitlig |
| Rank 5: Thin Action + Decision Ledger | **PARTIALLY AGREE — flytta UPP** | Beslutsposter är **färskvara**. Varje dag utan dem är data permanent förlorad. Codex behandlar den som jämbördig med uppskjutbara epics |
| Rank 6: Tenant/cron/release truth gate | **DISAGREE om rank, AGREE om innehåll** | Ett tenant-hål poängsätts inte mot kundvärde, det lagas. Se 2.3 |
| Rank 7: Fortnox pilot-grade sync | **AGREE (externt blockerad)** | Licens + omsamtycke + modullicenser. Håll utanför 90 dagar |
| Rank 8: Karin V2 fulfillment | **AGREE — och allvarligare än Codex skriver** | Se 4.2 |
| Rank 9: Company Model contract | **AGREE om form, MOVE DOWN om tid** | Uppskjutbart. Karin gjorde det till fem spår, inte fyra |
| Rank 10: Unified policy evaluator | **AGREE** | Men förtroendetrappan är underskattad som moat, se §6 |
| "Handled betyder acknowledged, inte fulfilled" | **AGREE — och värre** | Se 4.2 |
| Company profile provenance för grov | **AGREE** | Mitt fel, profilnivå i stället för fältnivå |
| Bygg inte Outcome Graph / Job Genome / Protocol / Marketplace / Passport | **AGREE** | Alla nedströms kunder vi inte har |
| Karin som ekonomisk kontroller, inte chatbot | **AGREE** | Och Economic Copilot ska MERGE:as in i Karin, inte bli en konkurrerande yta |

### 2.1 Där jag inte håller med: den varaktiga eventjournalen

Codex rankar en journal med outbox för 10–12 eventtyper som nummer två och kallar den
"deliberately small". **Enligt Codex egen måttstock är den för tidig platformisering.**

De två defekterna Codex hittar — ÄTA-fälten och fakturans leveransstatus — kräver ingen journal.
De är felaktiga *skrivningar*, och botas av korrekta skrivningar. En journal med retry och
replay betalar sig när det finns **två konsumenter som behöver spela om**. Idag finns en
(Revenue Recovery), och den behöver att skrivningarna är rätt, inte att de går att spela om.

Det finns dessutom ett billigare och mer träffsäkert ingrepp, som Codex missar:

**Eventkontraktet finns redan** — `ARCHITECTURE.md` §4 listar 23 event med regeln *"Inga event
får uppfinnas lokalt. Nya event läggs till i denna lista FÖRST."* Mätt mot kod:

- **22 event fyras i koden. 10 av dem står inte i kontraktet** (`ata_sent`, `ata_signed`,
  `call_transferred`, `email_received`, `lead_received`, `morning_report_sent`,
  `project_created`, `quote_accepted`, `referral_converted`, `work_order_sent`).
- **11 kontrakterade event fyras aldrig** — flera märkta ✅. `invoice_sent` är märkt som byggd
  men finns **bara i `lib/e2e-deal-flow.ts`, motorn utan anropare**. Kontraktet är delvis fiktion.
- `lead_received` och `lead_created` är dubbletter, precis som Codex skriver.
- `customer_reactivation` i kontraktet är i själva verket en `approval_type`, inte ett event.

`tests/schema-contract.spec.ts` vaktar redan tabellnamn mot `sql/`-facit. **Ingen motsvarighet
vaktar eventnamn.** Att bygga den kostar en dag, gör det befintliga kontraktet sant, och är
exakt Codex-format arbete.

**Ändrar det prioriteringen eller bara genomförandet?** Genomförandet. Vi är överens om att
pengafakta måste bli sanna först. Vi är oense om att det kräver en journal.

### 2.2 Där jag behöver bevis: fakturafärdighet

Codex rankar "Evidence-to-invoice readiness" som tre. Den förutsätter att någon sitter och
granskar färdighet innan fakturering — alltså ett kontor. Bee är en hantverkare vars faktiska
flöde är: jobbet klart, hem, fakturera i kväll eller aldrig.

Bevis→faktura-*kopplingen* är färskvara och ska med. Men en färdighetsgranskningsyta ska
piloten få uttala sig om innan den rankas trea.

### 2.3 Där jag ändrar Codex ordning: säkerhetsgrinden

Codex kallar den själv "stop-the-line" och rankar den ändå sexa med viktat betyg 6,55. Det är
en kategoriförväxling. Ett tenant-hål och en fail-open-cron poängsätts inte mot kundvärde —
de lagas innan något annat, och de tar dagar, inte veckor.

I min ordning är de **Våg 0** tillsammans med pilottestet, ograderade.

---

## 3. Nuläget efter Karin V1 — verifierat

### Codex fyra defekter: alla BEKRÄFTADE, två värre än beskrivet

| Påstående | Utfall | Nyansering |
|---|---|---|
| ÄTA-fälten ger falska fynd | **BEKRÄFTAT** | `auto-invoice-on-complete.ts:245-249` sätter bara `status`, saknar dessutom `.eq('business_id')` och läser aldrig `.error`. `create-final-invoice:436-444` är den enda korrekta vägen |
| Fakturan kan ljuga om att den skickats | **BEKRÄFTAT — och sändningen är bevisligen död** | Anropet skickar `_internal_business_id`, som mottagarrutten aldrig läser. Repot dokumenterar workarounden som död sedan 2026-06-02 (`approvals/[id]/route.ts:1653`), men bara approvals-vägen fixades. 401 fångas inte ens av `catch {}` |
| Tenant-hål i monthly-review | **BEKRÄFTAT** | `route.ts:102` — `body.business_id \|\| business.business_id`, service-role, ingen jämförelse. **Både läser och skriver** annan tenants rad. Mönstret finns redan i `patterns/test:57-62` |
| Cron fail-open | **BEKRÄFTAT men smalare** | 2 av 34, inte utbrett: `fortnox-sync:24` och `project-health:19`. **Och Codex "rätt mönster" är inte heller fail-closed** — saknas `CRON_SECRET` blir jämförelsen `"Bearer undefined"`, som går att gissa. Endast `monthly-review` GET har äkta `!expected`-koll |

### Faktapåståenden

Fyra av fem korrekta. **Ett fel:** Codex skriver att ingen GitHub Actions-workflow finns.
Två finns (`playwright.yml`, `agents.yml`) men är **avsiktligt pausade** till
`workflow_dispatch` sedan maj. Slutsatsen "ingen automatisk CI-gate på push" står — formuleringen
gör det inte.

Bekräftat: 36 cron-poster · inget `test`/`typecheck`-script trots ~105 spec-filer · tre
missed-revenue-regler · exakt 35 filer anropar Anthropic direkt.

### Vad som faktiskt fungerar

**Produktionsdugligt:** offertflödet · godkännandekön med 5-sekundersfönster · förtjänad
autonomi (fyra åtgärdstyper, automatisk nedgradering) · ROT/RUT-inlämning · projektekonomi
(`computeProjectEconomics`) · cash-radarn · Karins regelmotor (216 facit) · behörighetskontraktet.

**Delvis:** Offer-to-Reality (frysning körs men best-effort, fem tysta returer utan retry) ·
Revenue Recovery (detektion skriven, sannolikt aldrig kört) · Company Model (fem spår) ·
Fortnox (byggd, licensblockerad, aldrig verifierad mot kundkonto).

**Bara fundament:** beslutsposter (`_decision` på några få vägar) · bevis→faktura (noll
koppling — foton, fältrapporter och formulär saknar `invoice_id`).

**Saknas:** tvärgående ofakturerat-vy · leveransspårning på faktura (`viewed_at` skrivs
aldrig, `sent_method` skrivs aldrig) · en rutt som fakturerar tid + material + ÄTA tillsammans.

**Föråldrat/dubblett:** två Fortnox-rutträd · två projektekonomimotorer · två ÄTA-statusvokabulärer
(`draft/sent/signed` mot `pending/approved/rejected`) — och konsumenter som filtrerar på bara
den ena, så en signerad ÄTA saknas i lönsamheten.

---

## 4. Karins arkitektoniska avtryck

Jag byggde Karin V1 idag och kan svara förstahands. Bedömningen nedan är avsiktligt strängare
mot mitt eget arbete än mot Codex.

### 4.1 Vad som faktiskt tillkom

| Primitiv | Fil | Generisk eller Karin-specifik? | Rekommendation |
|---|---|---|---|
| Svenska helgdagar + vardagsförskjutning | `lib/karin/business-days.ts` | **Generisk.** Gauss påskformel, förskjutning framåt, sista dagen i månaden | **Generalisera när andra konsumenten dyker upp.** Fakturans förfallodatum och betalningsvillkor behöver samma logik — men bara en konsument idag |
| Organisationsnummer | `lib/karin/org-number.ts` | **Generisk.** Luhn, format, bolagsform ur första siffran | **Flytta till företagsdomänen.** Kundregistret och Fortnox-matchning behöver samma |
| Skyldighetsregler | `lib/karin/obligation-rules.ts` | **Karin-specifik** | Behåll lokal |
| Materialisering | `lib/karin/obligations.ts` | **Karin-specifik** | Behåll lokal |
| `CalendarEvent` + prioritering | `lib/karin/calendar.ts` | **Halvgenerisk.** "Daterad sak som kräver uppmärksamhet" med källa, säkerhet, brådska | **Generalisera INTE än.** Ett intäktsfynd är samma form, men en konsument räcker inte |
| Hanterat-lagring | `lib/karin/handled-store.ts` | **Karin-specifik — och defekt, se nedan** | Bygg om |
| Företagsprofil | `business_config` +9 kolumner (v94) | **Början på en Company Model, men som kolumner** | Se 4.3 |

### 4.2 Defekten i mitt eget arbete

Codex skriver att `handled` betyder *acknowledged*, inte *fulfilled*, och att det inte får
användas som revisions- eller efterlevnadsfaktum. **Det är rätt, och verkligheten är värre än
Codex beskriver.**

`app/api/cron/karin-deadlines/route.ts:114` läser samma lista och hoppar över påminnelsen:

```ts
if (hanterade.has(e.id)) continue
```

Ett klick på "markera hanterad" på en momsdeadline **tystar alltså alla framtida påminnelser
om den**, utan aktör, tidsstämpel, bevis eller kvitto. En felaktig tryckning är permanent och
osynlig. Det är inte ett namngivningsproblem — det är en bekräftelse som tystar en
lagstadgad frist.

Jag rankar det som en korrekthetsdefekt i samma klass som Codex ÄTA- och leveransfynd, och
den är billigast att rätta nu medan koden är en dag gammal.

### 4.3 Company Model — vad Karin faktiskt ändrade

Karin lade nio kolumner på `business_config` med provenance på **profilnivå**
(`company_profile_source`). Codex påpekar att en enda redigering sätter hela profilens källa
till `user` och därmed döljer vilket fält som kom varifrån. Korrekt.

Men den viktigare observationen är riktningen: Karin gjorde `business_config` till **den
femte** platsen där företagsfakta bor, bredvid `business_preferences`,
`ai_learned_preferences`, `pricing_intelligence` och reservationsinlärningen. Min egen
granskningsnot från 2026-08-06 kallade dem redan "fyra osammanhängande spår". Nu är de fem.

Det talar för Codex slutsats — en **läskontrakt-Company Model, inte en ny tabell** — men
också för att inte bygga den förrän en andra konsument finns.

---

## 6. Moat-bedömning — alla nitton

Skalan är den begärda: KEEP PRIORITY · MOVE UP · MOVE DOWN · MERGE · SPLIT · DEFER · DROP.

| # | Koncept | Beslut | Skäl |
|---|---|---|---|
| 1 | Offer-to-Reality Engine | **KEEP PRIORITY** | Mest kompletta punkten i hela strategin. `freezeProjectOutcome` körs vid båda avslutsvägarna och `pricing-engine.ts` läser frusna rader. Loopen är sluten — den behöver bli *pålitlig*, inte byggas |
| 2 | Autonomous Revenue Recovery | **MOVE UP → 1** | Tre detektionsregler finns sedan `e3b1cef6`. Enda kandidaten som kan visa återvunna kronor inom 90 dagar |
| 3 | Customer Promise Ledger | **DEFER** | Kräver extraktion ur samtal och meddelanden — dyrt, och löftesbrott är inte piloten Christoffers uttalade smärta |
| 4 | Project Autopilot | **SPLIT** | Komponenterna finns och ska härdas var för sig. Den samlade "autopilot"-produkten skjuts upp |
| 5 | Decision Replay | **SPLIT** | **Registreringen är färskvara — MOVE UP.** Uppspelnings-UI:t är uppskjutbart — DEFER |
| 6 | Company Model | **MOVE DOWN** | Karin gjorde `business_config` till den *femte* platsen för företagsfakta. Läskontrakt, men först när en andra konsument finns |
| 7 | Outcome Graph | **DEFER** | Ingen graf att traversera, bara id-strängar. `v71` lade 16 FK:er, ingen av dem lead→quote→project→invoice |
| 8 | Job Genome | **DEFER** | `job_types` är namn, slug, färg och ikon. Kräver volym vi inte har |
| 9 | Dispute Prevention | **DEFER** | Substratet finns men ingen efterfrågan är belagd hos piloten |
| 10 | Economic Copilot | **MERGE → Karin** | Ska inte bli en konkurrerande yta. Karin ÄR ägarens ekonomiska yta; allt annat blir en andra dashboard |
| 11 | Evidence-to-Payment | **SPLIT** | Fakturafärdighet är värdefull men förutsätter ett kontor. Bevis→faktura-*kopplingen* är färskvara och ska med i Revenue Recovery |
| 12 | Trade Packs | **DEFER** | Innehållet finns, strukturen inte. Kräver flera kunder för att ha någon mening |
| 13 | Constraint-aware Scheduling | **KEEP PRIORITY (som assistent)** | Brett inkopplat redan. Full lösare DEFER |
| 14 | Homeowner Twin | **DEFER** | Ingredienser finns, ingen efterfrågan belagd |
| 15 | Supplier Intelligence | **DEFER** | Kräver leverantörsfakturor vi inte har och volym vi inte har |
| 16 | Handymate Protocol | **DROP (för i år)** | `docs/api/openapi.yaml` dokumenterar EN endpoint och pekar på fel server. Ingen partnerefterfrågan |
| 17 | Autonomy Marketplace | **DROP (för i år)** | Kräver protokoll, sandlåda, versionering, fakturering och installerad bas |
| 18 | Verified Contractor Passport | **DROP (för i år)** | Ekosystem- och juridikarbete, inte produkt |
| 19 | Margin Insurance / Risk | **SPLIT** | Riskintelligens DEFER. Försäkring DROP — reglerad verksamhet |

**Den underskattade moaten som ingendera dokumentet rankar rätt:** `lib/autonomy/earned-autonomy.ts`
är en fungerande förtroendetrappa med automatisk nedgradering, inkopplad på fem ställen. Vår
konkurrensanalys säger att **ingen konkurrent skeppar approval-kö-autonomi**. Vi är längst
fram just där — och begränsningen är att trappan har två lägen över fyra av dussintals
åtgärdstyper. Vägen till en riktig 0–4-modell är kortare än båda dokumenten antar.

---

## 5. Delade primitiver — bara de som nästa kundarbete kräver

| Primitiv | Varför nu | Konsumenter | Minsta implementation | Bygg INTE än |
|---|---|---|---|---|
| **Röktest per skeppad väg** | Husets felmönster är kod utan anropare. Fem verifierade fall. Detta är det enda som upptäcker nästa | Alla | En facit-svit som anropar varje cron-rutt och varje approval-handler med en syntetisk rad och kräver icke-tomt svar | Full E2E-miljö |
| **Eventnamnvakt** | Kontraktet finns i `ARCHITECTURE.md` men 10 event kringgår det och `invoice_sent` är fiktion | Automationsmotorn | Kopiera `tests/schema-contract.spec.ts`-mönstret för eventnamn | Journal, outbox, replay |
| **Kortkontext** | Byggd idag efter pilotfynd — kunden syntes inte på korten | Idag-vyn, Jarvis-vyn | `lib/jarvis/card-context.ts` — klar | Generisk entitetsupplösning |
| **Beslutspost på nya vägar** | **Färskvara.** Varje dag utan är data borta | Revenue Recovery, Karin | Utöka `_decision` till nya konsekventa åtgärder | Replay-UI, counterfactuals |

Uttryckligen **inte** nu: varaktig eventjournal · outbox · Company Model-läskontrakt ·
policy-DSL · bevislager · Outcome Store.

---

## 7. Beroendeordning

```text
Våg 0  Säkerhetsgrind + PILOTTEST          (ograderat, parallellt)
          │
Våg 1  Fyra defekter + röktest             (gör fakta sanna)
       ├── change_id-select
       ├── invoiced_at + business_id
       ├── fakturans sändning (401-workarounden)
       └── tenant-hålet + två fail-open-cron
          │
Våg 2  Revenue Recovery V1                  (få loopen att FINNAS)
       ├── missad_intakt-handler
       ├── tvärgående ofakturerat-vy
       └── en rutt: tid + material + ÄTA
          │
       ┌──┴───────────────┐
Våg 3  Offer-to-Reality   Karin V2 fulfillment
       retry + versionering   (bekräftat ≠ fullgjort)
```

---

## 8. 90-dagarsplan

**Våg 1 — NU (v 1–3).** Mål: inget som visas är osant.
Utfall: svepet skapar kort som går att verifiera · ingen faktura kan stå som skickad utan att
ha skickats · inget företag kan läsa ett annats data · röktestet fångar nästa anroparlösa väg.
*Claude:* produktbeslut, Karin V2. *Codex:* de fyra defekterna, röktestet, eventvakten.

**Våg 2 — NÄST (v 4–8).** Mål: en hantverkare får en krona han glömt.
Utfall: `missad_intakt` går att godkänna till fakturautkast · en tvärgående vy visar allt
ofakturerat · minst ett riktigt fall dokumenterat hos piloten.
*Claude:* flödet och ytan. *Codex:* idempotens, dubblettskydd, regressionstester.

**Våg 3 — EFTER BEVIS (v 9–13).** Mål: loopen lär sig.
Utfall: utfallsfrysning med retry och versionering · Karin skiljer bekräftat från fullgjort ·
beslutsposter på alla nya konsekventa åtgärder.

**Mätetal:** andel avslutade projekt fakturerade inom 72 h · falsklarmsandel · identifierat
mot fakturerat mot betalt · andel skeppade vägar med röktest · pilotens veckoanvändning.

---

## 9. NOT NOW — och vad som flyttar dem

| Uppskjutet | Flyttas in när |
|---|---|
| Varaktig eventjournal + outbox | En **andra** konsument behöver spela om. Idag finns en |
| Outcome Graph, Job Genome | Lineage är hel OCH minst 30 jämförbara avslutade jobb finns |
| Company Model-läskontrakt | En andra konsument utöver Karin |
| Fortnox bred finansfeed | Licens klar, scopes beviljade, omsamtycke genomfört hos anslutna kunder |
| Promise Ledger | Piloten säger att löftesbrott är ett problem. Det har ingen sagt |
| Project Autopilot som produkt | Komponenterna är härdade var för sig |
| Constraint-lösare | Verkliga varaktighetsfördelningar finns |
| Trade Packs, Homeowner Twin, Supplier Intelligence | Fler än en kund |
| Protocol, Marketplace, Passport, Margin Insurance | Inte i år |

---

## 10. Arbetsfördelning

**Claude:** produktarkitektur · Karin · offert- och godkännandeflöden · agentbeteende ·
UX och svensk copy · tvärdomänfunktioner.

**Codex:** de fyra defekterna (isolerade, verifierbara) · röktest- och eventvakt-sviter ·
tenant- och cron-granskning · CI-grinden · migrationsverifiering · lineage-inventering ·
sanering enligt `tasks/codex-brief-sanering.md`.

**Aldrig samma fil samma dag.** Codex fick idag en spärrlista över mina aktiva kataloger, och
den principen ska gälla åt båda håll.

---

## 11. Korsgranskning

| Arbete | Byggare | Granskare | Krav |
|---|---|---|---|
| Pengatillstånd | Codex | Claude (produktsemantik) | Röktest + facit på övergångarna |
| Karins regler | Claude | Codex (reproducerbarhet, felstillstånd) | Facit mot Skatteverkets publicerade datum |
| Säkerhet | Codex | Claude (arbetsflödespåverkan) | `permission-contract.spec.ts` grön |
| SQL | En författare | En oberoende + prod-verifiering | Ingen kod påstår klart före verifierad körning |

---

## 12. Föreslagen ACTIVE_ROADMAP

Skapas **inte** nu. Föreslagen struktur: Våg 0 (ograderad grind) · Våg 1 (sanna fakta) ·
Våg 2 (Revenue Recovery V1) · Våg 3 (Offer-to-Reality + Karin V2) · NOT NOW med
inflyttningsvillkor. Codex gör en sista teknisk rimlighetskontroll innan den blir styrande.

---

## Slutposition

Codex och jag är överens om riktningen och oense om ett verktyg. Den viktigaste skillnaden är
inte analytisk utan empirisk: **verifieringen visade att Codex rank 1 vilar på detektion som
sannolikt aldrig kört.** Det gör epiken mindre och mer konkret än någon av oss först trodde —
en kolumnnamnsfix, en handler och en vy, inte ett plattformsprogram.

Och den enskilt högsta informationsavkastningen kostar noll utvecklingstid: **låt Christoffer
använda produkten.** Den grinden har stått öppen sedan i går, och fyra bygg har passerat den.
