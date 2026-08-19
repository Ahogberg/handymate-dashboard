# Handymate Active Roadmap

```text
Status: AUTHORITATIVE
Architecture Council completed: 2026-08-07
Supersedes execution ordering in older strategy documents.
Those documents remain strategic reference material.
```

**Underlag:** `PRIORITY_PROPOSAL_CODEX.md` (Codex förslag), `COUNCIL_SYNTHESIS.md` (Claude
granskning av Codex), `FINAL_CODEX_REVIEW.md` (Codex granskning av Claude — dom: *YES, WITH
REQUIRED CHANGES*, fem obligatoriska korrigeringar, alla införda nedan), Karin V1, och
riktad verifiering mot koden 2026-08-07.

**Ett sakfynd tillkom efter att granskningarna skrevs** och ändrar viktningen i NOW. Det
står i N1. Inga andra strategiska frågor är öppnade.

---

# Läge 2026-08-19 — Teamet i fickan / AgentNotification (ANDRA post-launch-programmet)

Codex förslag (via Andreas): ett gemensamt presentations- och
prioriteringslager för mobilpush — tre notisklasser (kräver beslut / något
viktigt hänt / teamuppdatering), aldrig tomma engagemangsnotiser, agent-
identitet på varje notis, exakt deep link till rätt kort, mottagare efter
ansvar snarare än hela företaget, dedupe, tyst tid, prioritet, diskret
låsskärmstext.

**Verifiering 2026-08-19 (två parallella granskningar, backend + mobil)
motsäger Codex huvudpåstående** — "ni har redan mycket av infrastrukturen...
det som saknas är ett presentationslager, inte ett nytt notissystem" stämmer
INTE. Verifierat läge:

- **En riktig bugg hittades och fixades samma dag, oberoende av det här
  programmet** (se `tests/push-target-user.spec.ts` / commit-loggen): mobil-
  push (Expo, `push_tokens`) blastade till HELA företaget oavsett vem ett
  beslut gällde, eftersom `routed_business_user_id` i praktiken aldrig
  sattes. Web-push honorerade redan riktning korrekt — bara mobilsidan
  läckte. Detta var inte del av notissystem-bygget, det var en fristående
  rätt-person-får-rätt-info-fix.
- **Inget deep-link-schema finns** i mobilappen (`handymate-mobile`) — inget
  `handymate://`, ingen `Linking.parse`. Mobilens tap-listener routar bara
  2 av ~11 pushtyper (ÄTA) till en specifik vy; allt annat öppnar hemskärmen.
- **Ingen dedupe på själva pushsändningen** — bara på agent-observationers
  SKAPANDE (48–168h-fönster). Offert/ÄTA/bokning/review kan dubbelpushas.
- **Ingen tyst tid för push** — SMS har ett riktigt klockslags-baserat
  mönster (`smart-communication.ts`), push importerar det aldrig. Push har
  bara det binära frånvarofönstret (helt på/av).
- **Ingen prioritet, inget TTL** skickas till Expo/APNs alls idag.
- **"Agent moments"** (`MomentsProvider`) är en ren webb-badge med
  `localStorage`-state — noll koppling till push, inte återanvändbar som
  Codex antog.
- **Nollpush-täckning idag** för tre av Codex sex V1-händelser: Mission
  Control-progress/blockerare, projektöverlämning/jobbpass, betald faktura.
  `mandate_paused_signal` finns i `ACTION_CONTRACT` men saknar helt en
  pushmall.
- **Det som FAKTISKT redan finns gratis**: agentidentiteten. Mobilappens
  `theme/tokens.ts` har exakt samma sex agenter (id/namn/roll/porträtt) som
  dashboardens, med `AIAvatar.tsx` färdig för ringstil per agent.

**Beslut (Andreas, samma dag):** mottagarbuggen fixas omgående (fristående,
liten, avgränsad — samma kategori som Mission Control-behörighetsfyndet
2026-08-18). Själva notissystemet — de tre klasserna, nya pushmallar för
uppdrag/jobbpass/betalning, deep-link-schema, dedupe-på-sändning, tyst tid,
prioritet — blir **ANDRA post-launch-programmet**, med samma disciplin som
OperatingExperiment ovan: produkten fryses ren fram till lansering, bygget
tar vid direkt efteråt. Codex strategiska ram (tre klasser, aldrig tomma
notiser, agent-identitet, exakt deep link, ansvarsbaserad mottagare) är
korrekt och blir grunden för etappspecen — bara omfattningsuppskattningen
("presentationslager") var fel; det är riktig bakänds-/klientkoppling i flera
lager, inte en tunn presentationsyta.

**Status:** roadmap-post skriven 2026-08-19. Mottagarbuggen fixas samma dag
(fristående commit). Inget av notissystemets övriga skikt är påbörjat.

---

# Läge 2026-08-19 — Adaptive Business Twin / OperatingExperiment (FÖRSTA post-launch-programmet)

Tre datafångst-läckor täpptes samma dag i det som blir underlaget för detta
program (debrief-kortets 7-dagarsfönster, den läkande labor-cost-refrysningen
i `reconcile-outcomes.ts`, saknat startsteg i två projekt-skapelsevägar) —
inte programmet självt, men grunden det ska stå på. **OperatingExperiment är
det FÖRSTA programmet i post-launch-fasen**, och skiljer sig från allt ovan i
den här filen: allt tidigare är byggt och skarpt; det här är en **namngiven
kommande riktning med en kvantifierad grind**, inte kod som finns idag.

**Vad det är:** en loop som räknar på VERKLIGA projektutfall
(`project_outcome`, `financial_learning_eligible=true`) över tid, per
företag och jobbtyp, och gradvis låter systemet forma starkare påståenden om
vad som faktiskt fungerar — bortom enskilda lärdomar (`project_lesson`, V1)
och bekräftade mönster (`business_knowledge` pattern-rader, Playbook Pattern
Confirmation V1) till experiment som medvetet varierar EN sak och mäter
utfallet.

**Grinden omformulerad 2026-08-19 — MOTORN BYGGD I FÖRVÄG (Etapp 1: datalager
+ läs-only mätmotor), OCH STÅR TOM. AKTIVERAS AV DATA.**

`sql/v157_operating_experiment.sql` (körs manuellt av Andreas),
`lib/experiment/types.ts` och `lib/experiment/measure.ts` finns i repot,
färdigtestade (`tests/operating-experiment.spec.ts`) — men tabellen har noll
rader tills en riktig `operating_experiment`-rad skapas, och ingen kod i
Etapp 1 skriver dit. Grinden är alltså INTE längre "börja bygga när N kunder
finns" — den flyttas till två senare, tydligare avgränsade punkter:

1. **Förslagslagret (Etapp 2)** — kortet som föreslår ett avgränsat försök åt
   ägaren (skapar den faktiska `operating_experiment`-raden) byggs när
   ```
   ≥3 riktiga betalande kunder
   har ≥5 avslutade projekt vardera
   med kompletta utfall (financial_learning_eligible = true)
   ```
   Riktiga = inte demo/testdata (`lib/testdata.ts`-filtret). Kompletta utfall
   = `calculation_version = OUTCOME_CALCULATION_VERSION` OCH
   `financial_learning_eligible = true` — samma sanningskontrakt som Outcome
   Quality Gate V1 (`sql/v138_outcome_quality_gate.sql`) redan håller,
   oförändrat av att Etapp 1 nu finns.
2. **Presentationsgrinden** — de namngivna trösklarna i
   `lib/experiment/types.ts` (`EXPERIMENT_MIN_COMPARABLE_DEFAULT = 3`,
   `EXPERIMENT_MAX_PROJECTS_CAP = 5`) är uttryckligen dokumenterade som
   förhandsgissningar ("förhandsgissning 2026-08-19, kalibreras mot verkliga
   utfall före första presenterade slutsats") — de kalibreras mot faktiska
   mätresultat INNAN någon slutsats någonsin visas för en ägare som mer än
   räknade fakta. Ett `underlag_finns`-facit betyder bara "tillräckligt
   många projekt att räkna på", ALDRIG ett kvalitetsomdöme —
   `deriveExperimentVerdict` (`lib/experiment/measure.ts`) kan strukturellt
   inte returnera ett värdeord, källskanningen i
   `tests/operating-experiment.spec.ts` låser det.

**De fyra sanningsnivåerna** (varje påstående programmet någonsin gör måste
bära sin nivå synligt, aldrig blandas ihop):
1. **Observation** — en enskild registrerad datapunkt. Ett `project_lesson`-
   svar, en `project_outcome`-rad. Sann för EN instans, påstår inget om
   mönster.
2. **Hypotes** — flera observationer pekar åt samma håll men är obekräftade.
   Motsvarar en oconfirmed `business_knowledge`-kandidat innan ägaren
   godkänt den (Playbook Pattern Confirmation V1-kortet, väntande).
3. **Avgränsat försök** — en medvetet skopad, tidsbegränsad variation
   (t.ex. "testa högre timpris för badrumsjobb hos detta företag i N
   projekt") med ett förutbestämt mätvillkor. Fortfarande INTE en generell
   sanning — gäller bara det avgränsade försöket tills det utvärderats.
4. **Bekräftad regel** — ägaren har uttryckligen godkänt att mönstret ska
   forma FRAMTIDA offerter/beslut generellt (samma disciplin som redan
   gäller för `business_knowledge`-rader idag: ingen AI-inferens blir en
   regel utan en människas godkännande-klick).

Ett påstående får aldrig hoppa nivå utan den nivåns beviskrav — en hypotes
som presenteras som en bekräftad regel är den typ av fabricering Matte redan
bevisat VÄGRAR göra i planflödet (Mission Control V1, 2026-08-17).

**Kausalitetsbanet gäller ovillkorligt:** programmet räknar och korrelerar,
men skriver ALDRIG "X orsakar Y" — bara "X observerades tillsammans med Y, N
gånger, under Z villkor". Samma disciplin som `mandate-facit.ts` redan
tillämpar på autonomifacit ("räknade fakta, aldrig ett kausalitetspåstående").
Ett handverk med 5 projekt är inte ett kontrollerat experiment — programmets
egna avgränsade försök (nivå 3) är den enda platsen kausalspråk ens
NÄRMAR sig, och bara inom det uttryckligt skopade villkoret.

**Beslutad första pilot (när grinden öppnas):** Lars + kickoff-checkpoints
(`lib/playbook/kickoff-candidates.ts`, Playbook Kickoff Copilot V1) — redan
byggd infrastruktur för att citera källprojekt och visa bevis vid ett
projekts start. OperatingExperiment bygger vidare på samma "visa beläggen,
aldrig bara påståendet"-princip, men med kvantifierat, nivåsatt bevis i
stället för en fri textformulering.

**Status (uppdaterad samma dag):** Etapp 1 OCH Etapp 2 är BÅDA byggda, testade
och pushade 2026-08-19 (`e2644c1e`, `79ed5f1f`, kontraktsfixen `cf1265fc`) —
`sql/v157_operating_experiment.sql` KÖRD av Andreas, skarpbevisat 9/9
stationer mot prod (`tests/e2e-golden-path/experiment-proof.spec.ts
--project=experiment-proof`, kört två gånger, städning select-verifierad).
Förslagslagret, inskrivningen, redovisningen och ägarens tre beslut
(fortsätt/avvisa/gör till standard) finns i `lib/experiment/`. Demokontot
visar motorn i två lägen sedan `sql/v158_demo_reset_v3.sql` (D4, `9c860661`).
Motorn är **vilande, inte bara byggd** — den väntar på att en riktig kund
bekräftar sitt första playbook-mönster, vilket är den enda återstående
grinden (ingen kod-grind kvar).

---

# Läge 2026-08-18 — Mission Mandates V1 byggd (hybrid: mandat som mätinstrument)

Andreas medvetna rådsbeslut: bygg avgränsad delegation — ägaren godkänner ETT
uppdrags genomförande inom exakta gränser i stället för varje kort — men i
**hybridform**, begränsad till de fyra redan förtjänta-autonomi-typerna
(`invoice_reminder`, `booking_reminder`, `quote_followup_sms`,
`review_request`, `lib/autonomy/earned-autonomy.ts`), med inbyggd per-typ-
utfallsmätning så mandaten själva genererar det säkerhetsbevis autonomigrinden
längre ner i den här filen (N1/rad "Autonomy Marketplace") efterlyste.

**Det som nu är sant:**

- Ett mandat (`mission_mandate`, `sql/v150`, körs manuellt) är ägarens
  uttryckliga, avgränsade delegation för ETT uppdrag: namngivna mål
  (`invoice_ids`/`quote_ids`/`booking_ids`/`project_ids` — aldrig fritext,
  aldrig en ny mottagare), dag-/totaltak, valfritt beloppstak, sista
  giltighetsdag ≤ uppdragets deadline. `mandateCovers`
  (`lib/mandates/mission-mandate.ts`) är fail-closed på ALLT: fel typ, mål
  utanför listan, tak nått, okänt belopp när ett tak gäller, utgånget,
  pausat, återkallat — minsta avvikelse faller alltid tillbaka till ett
  vanligt godkännandekort.
- Mandatkontrollen sitter BREDVID `isAutonomous()` i callers
  (send-reminders, quote-follow-up, review-requests, automation-engine),
  aldrig via tool-routerns exekverings-spegel — alla nedströms-vakter
  (STOPP/sms-gate, SMS-kvot, fyra-ögon, frekvens) ärvs oförändrat.
- **Mandatet ÄR mätinstrumentet.** `lib/mandates/mandate-facit.ts` räknar,
  per mandat och per typ: utförda utskick, leveransfel, STOPP-registreringar
  inom 7 dagar efter kontakt, ägaråterkallelse, pausorsak — räknade fakta,
  aldrig ett kausalitetspåstående (samma disciplin som checkpoint-outcomes).
  Publiceras i uppdragspanelen ("4 utförda · 0 leveransfel · 0 STOPP inom 7
  dagar") med Återkalla-knappen alltid nåbar.
- Mandatskapande är UTESLUTANDE en ägar-UI-handling
  (`POST/PATCH /api/mission/[id]/mandate`, owner/admin-grindad,
  `created_by` alltid från serverkontexten) — Matte kan aldrig skapa ett
  mandat, ingen tool-definition eller router-case finns för det
  (källskanningslåst). Dialogen visar EXAKT planens omfattade steg, tillåtna
  typer, namngivna mål och en ALLTID-SYNLIG "kräver alltid separat
  godkännande"-lista (fakturaskapande, prisändringar, ÄTA, nya mottagare,
  pengaförflyttningar) — strukturellt sant eftersom bara de fyra sändtyperna
  ens KAN mandateras.
- Ärlig begränsning, dokumenterad överallt i koden: kontaktmålens utskick
  (`proactive_care`, Hannas mission-outreach) ingår INTE i V1 — förblir
  godkännandebaserat tills det förtjänar sin plats på trappan nedan.

**Autonomy Marketplace-grinden omformuleras** (se raden i NOT NOW-tabellen
längre ner): öppnandet är inte längre "vänta på bevisad autonomi i
allmänhet", utan **öppnar per åtgärdstyp när mandatens publicerade per-typ-
facit visar ett bevisat säkert utfall för just den typen.** Mandaten
genererar nu själva det löpande beviset — grinden väntar inte på ett separat
mätprojekt.

**Vägen till fullständighet** (designad in från start, ALLOWLIST är den enda
utbyggnadspunkten): V1 = de fyra typerna. Nästa kandidat = `proactive_care`
(starkast vaktstack av alla), släpps in när mandate-facit visar bevisat säkert
per-typ-facit för de fyra. Därefter datastyrt per typ — varje ny kandidat
kräver eget publicerat facit före inträde. Skapande/ändrande åtgärder
(fakturor, ÄTA, priser, nya mottagare, pengar) står strukturellt utanför
trappan tills vidare.

**Etapp Y (samma dag): grindregeln är nu mekanisk, inte magkänsla.**
`lib/mandates/type-maturity.ts:bedomTypMognad` bedömer varje åtgärdstyp mot
FEM namngivna konstanter (`MATURITY_MIN_EXECUTED=25`, `MATURITY_MAX_STOPP=0`,
`MATURITY_MAX_DELIVERY_FAILURE_PCT=2`, `MATURITY_MAX_SAFETY_REVOCATIONS=0`,
`MATURITY_MIN_HISTORY_DAYS=30` — Andreas justerar siffrorna vid granskning,
koden ändras aldrig i smyg). `mogen` är sant bara när ALLA fem är uppfyllda,
aldrig delbetyg. `GET /api/admin/mandate-maturity` (isAdmin-gated, samma
ask-coverage-idiom som Etapp L, plattformsövergripande — inte tenant-scoped
och därför medvetet utanför permission-contract-kartan) aggregerar
`lib/mandates/platform-maturity.ts` — mandat-stämplade kort ÖVER ALLA
FÖRETAG, återanvänder `byggMandateFacit` per mandat i stället för att
duplicera räkningen — och publicerar `bedomTypMognad`-resultatet per typ med
kriterielista ("12/25 · 0 STOPP · 0% av 12 · 0 återkallelser · 18/30 dagar").
Grindregeln (raden ovan) pekar nu på dessa konstanter: **att öppna en typ
kräver TRE lås tillsammans — `mogen=true`, Andreas uttryckliga godkännande,
och en migration som vidgar `mission_mandate.allowed_action_types`
CHECK-begränsningen.** `mogen=true` är beviset, aldrig beslutet i sig.

**Verifiering:** `npx tsc --noEmit` och produktionsbuilden gröna. Facit för
`lib/mandates/*` (mission-mandate/mandate-facit/resolve/create/
load-mandate-facit/type-maturity/platform-maturity), callerintegrationen
(send-reminders/quote-follow-up/review-requests/automation-engine), rutten
och panelen/kortet, samt Etapp Y:s kvantifierade grind
(`type-maturity`/`mandate-maturity`-faciten) — samtliga gröna.
`mission-proof.spec.ts` utökad med en mandatstation mot riktig databas
(skip-with-fix-instruktion om `sql/v150` inte är körd i miljön).

---

# Läge 2026-08-16 — Project Closeout Copilot V1 byggd

Projektagenten Lars hittar nu projekt som med strukturerade, verifierbara
signaler ser färdiga ut. Matte äger den samordnade presentationen, medan
hantverkaren fortfarande själv granskar och avslutar projektet i den riktiga
projektvyn.

**Det som nu är sant:**

- Kandidatbedömningen är deterministisk. Slutförda bokningar, 100 procents
  progress eller slutförda milstolpar efter slutdatum kan ge ett förslag;
  slutdatum ensamt räcker aldrig och framtida arbete blockerar alltid.
- En redan väntande `four_eyes_project_close` filtreras bort så samma beslut
  inte visas två gånger.
- Lars visar den projektspecifika evidensen. Matte står som användarens
  samordnare och kortet attribuerar inget deterministiskt räknat värde till en
  agent.
- Saknad offertkoppling, jobbtyp, tid eller kostnadsunderlag visas som
  förbättringspunkter för efterkontrollen. Luckorna stoppar inte ett sant
  avslutsförslag och blandas inte ihop med blockerande arbete.
- Läsningen är tenantfiltrerad för varje källa, fel stänger funktionen som
  `unavailable`, och API:t är begränsat till owner/admin.
- Kortets enda handling är att öppna den riktiga projektvyn. Ingen ny
  mutation, approvaltyp eller LLM-styrd stängning har byggts; den kanoniska
  `completeProject`-vägen och fyra-ögon-grinden är oförändrade.

**Verifiering:** `npx tsc --noEmit` och produktionsbuilden (422 routes/sidor)
är gröna. 57/57 riktade closeout-, kanonisk-avslut-, fyra-ögon- och
AgentInteraction-facit är gröna. Full Chromium-svit: 3 167/3 296 gröna; 126
sessions-/nätfall blockeras av sandboxens `connect EACCES` mot
`app.handymate.se`, och tre kända Jarvis/stegkedje-facit är röda utanför denna
diff. Ingen migration krävs.

---

# Läge 2026-08-16 — Benchmark Readiness V1 byggd, V140 väntar

Business Twin har nu fröet till en verklig nätverkseffekt utan att Handymate
låtsas ha ett branschunderlag innan datan finns. Företag kan uttryckligen
ansluta kvalitetsgodkända projektutfall till framtida anonymiserad
branschstatistik och lämna igen med omedelbar verkan.

**Det som nu är sant:**

- Samtycke är `false` som default, versionerat och separat från tjänstens
  vanliga funktioner. Ett nej eller en återkallelse försämrar ingenting.
- Endast owner/admin får ändra samtycket. En atomisk service-only RPC verifierar
  aktören mot samma tenant och revisionsloggar varje opt-in/opt-out utan kund-
  eller projektdata.
- Demo-tenanter blockeras i RPC:n före första mutation så syntetiska utfall
  aldrig kan förorena ett framtida benchmark.
- Inställningar → Så ska teamet jobba → Avancerat → Business Twin-data visar
  enbart det egna företagets readiness. Endast Outcome V2-rader med relevanta
  eligibility-flaggor räknas, och tre utfall måste finnas inom samma jobbtyp.
- Framtida kohortgolv är låsta i kod till minst fem företag och trettio
  kvalificerade utfall. V1 gör ingen tvärtenantfråga, kopierar ingen
  `project_outcome`, visar ingen ranking och genererar ingen branschsiffra.
- Integritetspolicyn beskriver samma frivilliga, specifika och återkalleliga
  ändamål som samtyckesytan.

**Aktivering:** kör först den sedan tidigare väntande
[`sql/v138_outcome_quality_gate.sql`](../../sql/v138_outcome_quality_gate.sql)
och därefter
[`sql/v140_benchmark_readiness.sql`](../../sql/v140_benchmark_readiness.sql)
manuellt i Supabase SQL Editor. Ingen migration kördes från kod eller test.

**Verifiering:** `npx tsc --noEmit` och produktionsbuilden (422 routes/sidor)
är gröna. 88/88 riktade benchmark-, inställnings-, outcome-, offert-, kolumn-
och behörighetsfacit är gröna. Full Chromium-svit: 3 131/3 260 gröna; 126
sessions-/nätfall blockeras av sandboxens `connect EACCES` mot
`app.handymate.se`, och tre kända Jarvis/stegkedje-facit är röda utanför denna
diff.

---

# Läge 2026-08-16 — Business Twin Quote Reality Check V1 byggd

Offertens sista kontroll före utskick använder nu företagets egna
kvalitetsgrindade projektutfall i stället för den tidigare skenbara
Daniel-varningen. Den gamla vägen matchade accepterade offerter via ett brett
prisintervall, läste legacy-projekttimmar och visade en knapp som inte ändrade
någonting.

**Det som nu är sant:**

- Offert, offertrader och utfall läses tenantbundet. Jämförelsen kräver en
  explicit offertmall eller jobbtyp; ingen keyword- eller prislikhet får skapa
  ett falskt jämförelseunderlag.
- Offerttimmar härleds av den kanoniska budgetmotorn och historiken kommer från
  Outcome Quality Gate. Minst tre kvalificerade utfall krävs.
- Bara en positiv genomsnittlig tidsavvikelse på minst tio procent ger en
  rådgivande tidsbuffert. Rekommenderade timmar avrundas uppåt till närmaste
  halvtimme och verklighetskontrollen sänker aldrig en offert automatiskt.
- `ready`, `insufficient` och `unavailable` är skilda tillstånd. Ett källfel
  ser därför aldrig ut som att företaget bara saknar historik.
- UI:t visar Business Twin-evidens i den befintliga utskicksmodalen. Det finns
  ingen LLM-matte, prisrekommendation, automatisk radändring eller sändspärr;
  enda ändringsvägen går till den riktiga offerteditorn.
- Realiserad marginal redigeras bort på servern om användaren saknar
  `see_financials`. Jobbtyp från en affär sparas nu på nya offerter och både
  `template_id` och `job_type` överlever duplicering/versionering.

**Aktivering:** ingen ny SQL tillkom. Funktionen kräver att den redan skrivna
[`sql/v138_outcome_quality_gate.sql`](../../sql/v138_outcome_quality_gate.sql)
körs manuellt; innan dess visar kontrollen ett ärligt otillgängligt tillstånd.
V139 behövs endast för Watch & Verify, inte för själva offertkontrollen.

**Verifiering:** `npx tsc --noEmit` och produktionsbuilden (421 routes/sidor)
är gröna. 89/89 riktade Reality Check-, outcome-, scenario-, tenant- och
kolumnfacit är gröna. Full Chromium-svit: 3 118/3 248 gröna; 126
sessions-/nätfall blockeras av sandboxens `connect EACCES` mot
`app.handymate.se`, och fyra orelaterade Jarvis-, stegkedje- och parallella
Bränsle-facit är röda utanför denna diff.

---

# Läge 2026-08-16 — Business Twin Watch & Verify V1 byggd, V138/V139 väntar

Business Twin har nu sin första stängda prognosloop: en ägare eller admin kan
uttryckligen bevaka ett projektmarginalscenario, låta projektet löpa och få ett
sanningskvitto när den kanoniska efterkalkylen fryses. Funktionen lär ännu inte
om modellen automatiskt; V1 bevisar först att prognosen kan följas till ett
kvalitetsgrindat facit.

**Det som nu är sant:**

- Endast projektmarginal på ett öppet projekt är bevakningsbart. Kassa och
  omsättningstakt förblir read-only tills de har entydiga observationsfönster.
- Knappen `Bevaka detta` visas bara för owner/admin. Klientens belopp lagras
  aldrig blint: servern kör om scenariot mot aktuell tenantdata och vägrar en
  stale fingerprint.
- Prognos, request och beräkningsversion fryses i ett smalt service-only
  kontrakt. Dubbletter stoppas deterministiskt per tenant och fingerprint.
- Projektstängningen jämför först efter lyckad `freezeProjectOutcome` och bara
  mot finansiellt lärbart realiserat utfall. Otillräckligt facit blir
  `unverifiable`, aldrig en påhittad träff.
- Samma prognoskvitto återanvänds i scenariokortet och projektets Efterkalkyl:
  bevakas → verifierad avvikelse och ledtid, eller en tydlig blockeringsorsak.
- Verifieringen är idempotent även vid samtidiga stängningsanrop. Inga
  trösklar självjusteras och ingen autonom handling eller ny approvalväg har
  tillkommit.

**Aktivering:** databasen saknar enligt read-only prob fortfarande V138.
Kör därför [`sql/v138_outcome_quality_gate.sql`](../../sql/v138_outcome_quality_gate.sql)
manuellt först och därefter
[`sql/v139_business_twin_forecast.sql`](../../sql/v139_business_twin_forecast.sql).
Ingen migration kördes från kod eller test; UI:t failar säkert till read-only
innan V139 finns.

**Verifiering:** `npx tsc --noEmit` och produktionsbuilden (421 routes/sidor)
är gröna. 94/94 riktade scenario-, outcome-, auth-, tenant- och
migrationsfacit är gröna. Full Chromium-svit: 3 076/3 205 gröna; 126
sessions-/nätfall blockeras av sandboxens `connect EACCES` mot
`app.handymate.se`, och tre sedan tidigare kända Jarvis/stegkedje-facit är
röda utanför denna diff.

---

# Läge 2026-08-16 — Business Twin Scenario Engine V1 byggd

Matte kan nu besvara tre typer av kontrafaktiska “vad händer om?”-frågor
med deterministisk matte ovanpå företagets riktiga data. Det är samma
read-only produktfunktion i demo och produktion — ingen separat simulator,
mockad AI-text eller ny lagringsmodell.

**Det som nu är sant:**

- Projektmarginal, försenade kundbetalningar och omsättningstakt delar ett
  litet versionerat scenariokontrakt. Modellen väljer scenario och argument;
  den räknar aldrig beloppen själv.
- En central tenantbunden loader läser befintlig projektekonomi, Cash Radar
  och uttryckligt omsättningsmål. Källfel blir synliga och ett projekt matchas
  aldrig genom gissning.
- Marginalscenarier blockeras vid saknad intern timkostnad eller möjligt
  överlapp mellan leverantörsfakturor och manuellt material. Kassascenariot
  summerar aldrig pipelinepotential med kända fakturainflöden.
- Scenarioresultatet persisteras i befintlig `thread_message.metadata` och
  renderas av samma mobilanpassade kort i Jobbkompisen och MatteChatModal:
  nuläge → scenario, delta, KÄNT/UPPSKATTAT, antaganden och riktig CTA.
- En projektsida erbjuder demo-frågan om 20 extra timmar och 10 procent dyrare
  material. Matte får den aktuella sidans strikt sanerade projekt-id, men
  verktygets `business_id`-kontroll förblir den auktoritativa tenantgränsen.
- Funktionen är helt läsande: ingen SQL, mutation, approval eller extern
  handling har tillkommit.

**Verifiering:** `npx tsc --noEmit` och produktionsbuilden (421 routes/sidor)
är gröna. 93/93 riktade facit är gröna. De använda läskolumnerna verifierades
read-only mot testdatabasen. Full Chromium-svit gav 3 041 gröna; 126
nät-/sessionsfall blockerades av sandboxens `connect EACCES` och fem
parallella, orelaterade baselinefacit var röda.

---

# Läge 2026-08-16 — Outcome Quality Gate V1 byggd, V138 väntar på manuell körning

Offer-to-Reality-loopen har nu en explicit sanningsgräns mellan ett fryst
projektutfall och data som faktiskt får påverka nästa offert eller agentråd.
X2a, X2b, X2c, X2e och X2f är byggda i kod. X2d är fortsatt ett separat
produktregister-/materialbeslut; tills det är löst utesluts överlappande
materialkällor från finansiell lärdata.

**Det som nu är sant:**

- Den kanoniska ekonomihärledningen läser fel från samtliga nio källor och
  tenantfiltrerar även medlemskostnader. Ett trasigt uppslag kan inte längre
  bli en trovärdig nolla.
- `project_outcome` V2 bär beräkningsversion, offertkälla, källräknare,
  fullständighetsflaggor, blockeringsorsaker och separata eligibility-flaggor
  för tids- respektive finansiell inlärning.
- Förväntad intäkt och realiserad intäkt är två olika tal. Realiserad marginal
  använder bara utfärdade fakturors `subtotal` exklusive moms; utkast,
  makulerade/krediterade original och rader med saknad nettosumma tränar inte.
- ROT/RUT-behörighet klassar en rad som arbete men får inte längre göra `st`
  eller andra enheter till timmar. Bara riktiga timenheter påverkar tidslärandet.
- En frysning returnerar strukturerat resultat. Projektstängningen, demoseed och
  E2E-livscykeln kontrollerar just den körningen; en gammal rad kan inte maskera
  ett aktuellt fel. Saknat `completed_at` ersätts aldrig av ett påhittat datum.
- En tenantbunden owner/admin-rutt räknar idempotent om saknade och legacy-
  utfall. Legacy-rader får aldrig V2-status genom en blind `UPDATE`.
- Efterkalkylinsikter, jobbtypsaggregat och prisintelligens kräver V2,
  relevant eligibility och minst tre jämförbara utfall. Projektkortet märker
  samtidigt förväntad respektive realiserad marginal korrekt.

**Aktivering:** [`sql/v138_outcome_quality_gate.sql`](../../sql/v138_outcome_quality_gate.sql)
ska köras **manuellt** i Supabase SQL Editor. Ingen migration kördes från kod
eller test. Efter körningen kan owner/admin anropa
`POST /api/admin/project-outcomes/reconcile`; läskonsumenterna gör även en
begränsad idempotent avstämning.

**Verifiering:** `npx tsc --noEmit` och produktionsbuilden (421 routes/sidor)
är gröna. 206/206 riktade ekonomi-, efterkalkyl-, auth- och migrationsfacit
är gröna. Fullsviten lästes via felsammanfattningen: 6 051 tester passerade;
sessions-/nätfallen blockerades av sandboxens `connect EACCES`, och tre äldre
Jarvis/stegkedje-facit är fortsatt röda utanför denna diff. Det enda
Outcome-relaterade fullsvitsfelet var ett äldre facit som krävde fyra
duplicerade driftlarmsanrop; facitet är uppdaterat till den nya centrala
felvägen och är grönt i den riktade sviten.

---

# Läge 2026-08-16 — Revenue Recovery Case V1 byggd

Business Twin kan nu följa en identifierad missad intäkt eller ett ÄTA-utkast
hela vägen från fynd till verifierad betalning. Kedjan är en härledd,
read-only sanningsbild ovanpå befintliga approvals, projekt, ÄTA-rader och
fakturor; den inför inget parallellt workflow.

**Det som nu är sant:**

- En central tenantbunden loader läser `pending_approvals`, `project_change`,
  `project` och `invoice`. Varje service-role-fråga har `business_id`-filter
  och varje databasfel blir synligt i stället för att tolkas som tomt läge.
- Härledningen använder bara direkta referenser. Saknad, främmande eller
  tvetydig koppling blir `unknown`; systemet gissar aldrig kund, projekt,
  ÄTA eller faktura.
- Leverans anses bevisad först av kanoniskt projektavslut. Betalning anses
  bevisad först när fakturan både är markerad betald och har `paid_at`.
- Identifierad potential och fakturans belopp visas separat och summeras
  aldrig till ett påhittat värde.
- Owner/admin får högst tre prioriterade case under “Pengar just nu”. Kortet
  är Matte-attribuerat, visar varje evidenssteg och länkar endast till
  befintliga approval-, projekt- eller fakturaytor.
- Ingen SQL, ny approvalmekanik, skrivväg eller extern effekt infördes.

**Verifiering:** `npx tsc --noEmit` och produktionsbuilden (420 routes/sidor)
är gröna, 270/270 riktade domän-, auth-, kolumn- och permission-facit är gröna,
och de exakta läskolumnerna verifierades read-only mot den konfigurerade
testdatabasen. Den stora Chromium-sviten
startades men avbröts när samtliga nätberoende fall konsekvent blockerades av
sandboxens `connect EACCES`; detta redovisas inte som en grön fullsvit.

---

# Läge 2026-08-15 — Outbound Safety & STOPP Closure V1 byggd

Alla kund-SMS som använder den kanoniska 46elks-sändaren passerar nu en enda
fail-closed exekveringsgrind. Det stänger luckan där ett trasigt kund-/STOPP-
uppslag tidigare tolkades som tillåtelse att skicka.

**Det som nu är sant:**

- Kund-id, telefon och tenant verifieras tillsammans före den externa
  effekten. Saknad, främmande eller tvetydig kund samt DB-fel blockerar.
- Varje sändväg anger explicit intern, transaktionell, konversationell,
  proaktiv eller samtyckeskvittens. Interna mottagare är allowlistade och kan
  inte användas som ett tyst kundundantag.
- Alla kundklasser respekterar STOPP. Bara den exakta STOPP-kvittensen får gå
  efter att spärrflaggan bevisligen sparats.
- STOPP/START läser Supabase-felet och returnerar 503 vid persistensfel i
  stället för att bekräfta ett skydd som inte finns.
- Proaktiva utskick kontrollerar faktisk `sent`/`delivered` historik över alla
  agentvägar i sju dagar. Transaktionella utskick och pågående samtal
  frekvensblockeras inte.
- Ett redan levererat approval-SMS blir en idempotent retry och kvoträknas
  inte igen. Skyddet är sekventiellt; absolut samtidighet kräver en framtida
  unik DB-claim och påstås inte här.
- Ingen SQL, ny sändare, ny approvalmekanik eller ändrad SMS-copy infördes.

**Verifiering:** TypeScript och produktionsbuilden (420 routes/sidor) är
gröna. 127/127 riktade SMS-/approval-/kolumnfacit är gröna. Hela Chromium-
sviten gav 2 953 gröna och 128 röda: 126 nät-/sessionsberoende tester
blockerades av `connect EACCES`, och två föråldrade stegkedje-facit från den
tidigare projektrefaktorn träffar inga filer i denna diff. En read-only prob
mot den konfigurerade testdatabasen verifierade de använda `customer`- och
`sms_log`-kolumnerna. Ett verkligt 46elks STOPP-prov återstår tills ett
uttryckligt testnummer finns; ingen extern sändning gjordes i verifieringen.

---

# Läge 2026-08-15 — Cross-Agent Customer Case V1 byggd

Jarvis kan nu sammanföra flera olika väntande signaler om samma kund till en
gemensam läsbild ovanför den ordinarie godkännandekön. Kund-caset ersätter
inga approvals och har inga egna beslutsknappar; varje underliggande handling
behåller sin befintliga riskgräns och sitt eget godkännande.

**Det som nu är sant:**

- En explicit allowlist beskriver 13 approval-typer och exakt EN kundväg per
  typ: tenantfiltrerat projekt-, offert- eller fakturauppslag, direkt
  tenantverifierad kundreferens eller `autopilot_package.package_data`.
  Okända typer och saknade nycklar gissas aldrig fram.
- Ett case kräver minst två distinkta `approval_type`, samma tröskel som
  Project Case. Två dublettrader av samma typ blir inget case.
- Projektet äger en delad signal. Approval-id:n som redan ingår i ett synligt
  projekt-case tas bort innan kund-casets tröskel räknas, så samma fynd inte
  berättas i två staplade kort.
- Routen använder autentiserad tenant, tenantbunden `getCurrentUser`, samma
  `canActOnApproval`-kontroll som kön och tenantfilter på varje service-role-
  uppslag.
- Jarvis visar Matte som samordnare och varje signal med producentens agent.
  Om minst två olika kundriktade signaltyper kan leda till kontakt visas den
  läsande varningen “Samordna kontakten”; den blockerar eller skickar inget.
- Ingen SQL, ingen ny approvalmekanik och inga ändringar i SMS- eller
  exekveringskedjan tillkom.

**Verifiering:** `npx tsc --noEmit` är grön, 143/143 riktade Jarvis-/approval-
facit är gröna och produktionsbuilden är grön. En read-only liveprob mot
databasen kunde inte köras eftersom den lokala arbetsytan saknar Supabase-URL
och service-role-nyckel; inget live-DB-bevis påstås därför i denna leverans.

---

# Läge 2026-08-15 — Canonical Project Completion V1 stängd

De tre produktionsdörrarna för projektavslut — desktop-API:t, mobilens
`complete-job` och fyra-ögon-godkännandet — använder nu samma kanoniska
serverfunktion i `lib/projects/complete-project.ts`. Claude-fixen i
`7e32413d` stängde de två akuta P0-felen; denna leverans stänger de tre
separata P1-fynden utan ny SQL eller nya affärsregler.

**Det som nu är sant:**

- En tenantfiltrerad compare-and-set-övergång avgör exakt vilket anrop som får
  utföra avslutskedjan. Återanrop och samtidiga förlorare skapar inte en andra
  faktura, review-begäran eller agentkedja.
- Ett fel i den primära projektuppdateringen stoppar alla sidoeffekter. Varje
  befintlig effekt rapporteras därefter separat som lyckad, misslyckad,
  överhoppad, utskickad eller försökt — partiella fel maskeras inte som ett
  fullständigt lyckat avslut.
- Workflow-steg, `job_completed`, auto-faktura, fryst efterkalkyl, debrief,
  Lars-trigger, review-begäran, dealsteg och completion-batch ligger i samma
  kedja oavsett ingång.
- Desktop och fyra-ögon visar samma befintliga `ProjectCloseoutModal`, inklusive
  varningar. Mobil-API:t returnerar samma strukturerade closeout-kontrakt.
- Ett kontraktsfacit spärrar nya direkta `project.status = completed`-skrivare
  utanför den kanoniska övergången.

**Verifiering:** TypeScript och produktionsbuild är gröna. Den avgränsade
closeout-/fyra-ögon-/efterkalkylsviten är grön. Hela browserfacitet startades,
men sessions- och nätverksberoende tester mot `app.handymate.se` blockeras i
den lokala sandboxen med `connect EACCES`; detta är inte redovisat som en grön
fullsvit.

**Nästa större Business Twin-insats:** Cross-Agent Customer Case V1 ligger
kvar som nästa kandidat. Den ska återanvända den nu kanoniska avslutshändelsen
och får inte återinföra en separat projektavslutskedja.

---

# Läge 2026-08-13 — Gyllene vägen grön (alla 14 stationer) + två externa ChatGPT-rapporter stämda av

**Gyllene vägen är klar.** `tests/e2e-golden-path/` (byggt 2026-08-13) körde
station 1-14 i EN sammanhängande, riktig webbläsarresa mot produktion — alla
gröna, första gången i projektets historia (`docs/REALITY-WEEK.md`,
`docs/reality-week/pass1-2026-08-13.md`). Åtta riktiga produktionsbuggar
hittades och fixades under körningen (bl.a. `project.status` skrevs aldrig
vid statusändring, `invoice.sent_at`/`sent_method` skrevs aldrig,
`call_recording.recording_id` saknade default — hela röstanalysvägen hade
aldrig kunnat slutföra en analys). Detta löser den här filens gamla NEXT
ACTION-punkt 1 ("Kör och dokumentera pilotens gyllene väg") — se
uppdaterad lista längst ner.

**Två nya externa dokument** landade i repot 2026-08-12/13 (git-identitet
"Ahogberg", ChatGPT/Codex-genererade, repo-ROTEN `docs/roadmap/` och
`docs/strategy/` — inte den nästlade appmappens `docs/`): `POST_REALITY_
LAUNCH_VALUE_WAVE.md` (8 idéer, uttryckligen gated "efter Reality Week är
grön" — precis det läge vi nu är i) och `BUSINESS_TWIN_VISION.md` +
`BUSINESS_TWIN_IDEA_BACKLOG.md` (ett större arkitekturramverk + 10 idéer).
Samma "stäm av mot koden innan bygge"-disciplin som 2026-08-10-rapporten
nedan, med samma metod (läs dokumenten, verifiera varje påstående mot
faktiska filer, inte gissa).

**Domen: en majoritet av topplistans förslag är redan byggda eller
delvis byggda, oberoende, av Andreas mellan 2026-08-11 och idag —
dokumenten skrevs innan de landade.**

| Förslag (källa) | Dom |
|---|---|
| Första 30 minuterna/Company Scan (POST_REALITY #1) | **Byggd.** `components/tour/CompanyScan.tsx` + `app/api/onboarding/company-scan/route.ts`, matchar exemplet i rapporten nästan ordagrant. |
| Weekly Owner Report (POST_REALITY #5) | **Delvis.** Måndagsmötet (`lib/jarvis/monday-brief.ts`+`mandagsmote.ts`, byggt 2026-08-13) har 4 sektioner (Resultat/Lärdomar/Risker/Förtroende) mot rapportens föreslagna 5 — saknar egna Projekt- och Sälj-sektioner samt per-agent-aktivitetsbrytning. |
| Agent Presence Everywhere (POST_REALITY #2) | **Delvis.** Global "Moments"-overlay (`components/moments/`) täcker UX-principerna (en i taget, prioriterad, avvisbar) som EN flytande overlay — men offert-/kund-/faktura-sidorna saknar helt inbäddad agent-copy PÅ sidan själv, vilket är vad förslaget faktiskt vill ha. |
| Explainability "Varför vet Handymate det?" (POST_REALITY #3) | **Delvis.** `customer_fact.evidence_quote` visas redan (kundsidan, alltid synlig kursiv text) — men som en fast bildtext, inte förslagets expanderbara "Varför?"-reveal. `decision_record` finns bara i backend-payloaden, ingen UI läser den. |
| Distributed Value Receipts (POST_REALITY #4) | **Inte byggd.** Bara den samlade månadsvisa Värdekvitto-vyn finns. Efter ett godkännande är feedbacken generisk ("Godkänt", "SMS skickat!") utan kronbelopp (`app/dashboard/approvals/page.tsx`). |
| Mobil "Säg det en gång" (POST_REALITY #6) | **Delvis, dold kapacitet.** `app/api/voice/process/route.ts` gör REDAN exakt detta (en inspelning → flera strukturerade förslag med typ+confidence) — men har INGEN anropare i det här repot, dokumenterad död kod sedan `docs/audits/ROSTVAGAR_KARTLAGGNING_2026-08-08.md`. Mobilappens repo (separat, ej granskat härifrån) kan möjligen redan anropa den. |
| Project Closeout Magic (POST_REALITY #7) | **Delvis.** Hela backend-kedjan (autoInvoiceOnComplete/freezeProjectOutcome/skapaDebriefKort) körs redan korrekt vid stängning (bevisat idag, Golden Path Station 11) — men ingen visuell sammanfattningsskärm finns, bara ett debriefkort som dyker upp senare i kön. |
| Next Best Action Engine (BUSINESS_TWIN #1) | **Inte byggd.** Godkännandekön sorteras bara på `created_at` (`app/api/approvals/route.ts:47`), ingen impact/risk-ranking. |
| One Decision → Whole Company (BUSINESS_TWIN #2) | **Delvis.** `lib/autopilot/trigger.ts` fläktar redan ut EN händelse (offert accepterad) till flera bundlade åtgärder med ett "Godkänn allt"-läge (`autopilot_package`) — men bara för DEN triggern. Fritextyttranden i agent-loopen ger fortfarande separata kort per verktygsanrop. |
| Owner-by-Exception (BUSINESS_TWIN #3) | **Delvis.** Dygnsdigest + Måndagsmötet täcker "vad hände"-halvan; Earned Autonomy täcker bara 4 hårdkodade åtgärdstyper — långt ifrån den självständiga volym förslaget beskriver. |
| Business Simulation (BUSINESS_TWIN #4) | **Inte byggd.** Noll träffar på simulation/scenario/forecast i `lib/`. |
| AI Leadership Meeting/Company Pulse (BUSINESS_TWIN #5) | **Delvis.** Måndagsmötet är EN enhetlig sammanfattning, inte per-agent-röster ("Karin säger X, Lars säger Y") som förslaget vill ha. Ingen Firmapuls-poäng finns alls. |
| Autonomous Recovery (BUSINESS_TWIN #6) | **Delvis.** Value Ledger har 4 av de 7 föreslagna livscykelstegen (Identifierat→Agerat→Fakturerat→Betalt); saknar egna "Verifierad" och "Levererad" som distinkta, spårade steg. |
| Firm-specific Operating Model/Playbook (BUSINESS_TWIN #7) | **Inte byggd — bekräftat data-gated.** Matchar next-moat-wave steg 6. `MIN_SAMPLE_SIZE=3` i `lib/profitability.ts`; `project_lesson` har **0 rader totalt** i produktion just nu. |
| Owner Absence Mode (BUSINESS_TWIN #8) | **Inte byggd.** Earned Autonomy är permanent per nyckel — inget tidsboxat "borta till måndag"-läge existerar. |
| Business State/Project Reality-modell (BUSINESS_TWIN #9) | **Delvis.** Byggstenarna finns (project.status, Margin Guardian, ProjectEconomicsCard, FramdriftCard) men renderas separat sida vid sida — ingen sammanhållen härledd typ. Samma "vänta på andra konsument"-princip som redan gäller i den här filens Operating Principles §5 talar för att INTE bygga detta i förtid. |

**Distillerad "genuint nytt, billigast först"-lista** (ingen är beslutad
— presenterad för Andreas 2026-08-13, väntar på hans val):
1. Koppla in `voice/process` (mobil "Säg det en gång") — backend klar, bara oanvänd.
2. Distributed Value Receipts — värde-rama de generiska godkännande-texterna.
3. Project Closeout Magic — presentationslager ovanpå redan bevisad backend.
4. Explainability-reveal — UI-affordans ovanpå redan existerande `evidence_quote`/`source_text`/`decision_record`.
5. Allt annat i tabellen ovan är antingen data-gated (Playbook), medvetet uppskjutet enligt redan existerande principer i den här filen (Business State), eller för stort för fönstret fram till frysningen.

**Separat, icke-"innovation"-spår som fortfarande är öppet:**
- **B8 Stripe LIVE-växlingen** — ren ops, noll kod, körbok klar (`tasks/b8-live-vaxling.md`). Förutsättningarna B7 ✅ och Gyllene vägen ✅ är nu uppfyllda. STOPP-provet och tvåtenantprovet har oklar status (se nedan).
- **C2/Google-verifiering** — Andreas egen inlämning till Googles Verification Center (`docs/PRODUCTION_SETUP.md` §4); kodfixarna som en gång hörde ihop med utredningen är redan LIVE.
- **STOPP-provet** — refereras som en namngiven grind på flera ställen men **ingen skriven testprocedur hittades**; mekaniken finns i kod (`sql/v86_customer_optout.sql`). Kräver riktiga SMS — blockerat av att 46elks-kontots saldo tog slut under dagens Golden Path-körning.
- **sql/v123_kundrost_customer_first_name.sql** + **sql/demo_seed_internal_cost.sql** — båda skrivna, ingen körd. Den senare är varför Golden Path Station 7:s Guardian-bevis hoppades över i varje körning idag.

**Ingen grind ändras av detta.** Samma disciplin som 2026-08-10: absorbera
det som är billigt och verkligt nytt, avvisa eller skjut upp resten.

---

## Tillägg samma dag — ChatGPT-analys av en AI-native-company-podd

Andreas lät ChatGPT analysera transkriptet av podden "How to Build an
AI-Native Company in 2026" mot Handymate. Åtta punkter granskades mot
faktisk kod (samma metod som ovan — läs koden, gissa aldrig). Fyra
konkreta, tidigare overifierade påståenden kontrollerades explicit
(Explore-agent, 2026-08-13):

| Poddens punkt | Dom |
|---|---|
| Agenter som infrastruktur, människan sätter mål/eskalerar | **Redan vision.** = `BUSINESS_TWIN_VISION.md`s SENSE→UNDERSTAND→PREDICT→...-loop, skriven två dagar tidigare. Extern bekräftelse, ändrar inget. |
| "Verkmästaren"/"Agent Council" (korrelera flera agenters signaler om samma projekt/kund till EN rekommendation) | **Inte byggd, bekräftat.** `lib/moments/derive.ts` mappar varje `pending_approvals`/`business_knowledge`-rad 1:1, ingen sammanslagning på delat project_id/customer_id. `agentForApproval()` routar varje typ till EN agent. Enda undantaget: "Inför mötet"-blocket i `lib/matte/morning-brief.ts` (rad 158-208), hårdkodat för mötesförberedelse. **Det här är BUSINESS_TWIN_IDEA_BACKLOG #1 (Next Best Action Engine) igen** — redan katalogiserad, redan bortvald i dagens "genuint nytt"-runda. Inte en ny idé, förnyad extern validering av en redan känd. |
| Dashboards → visibility/anomaly/insight/action | **Redan byggt och levande.** = Command Center/JarvisHome, verifierat live i webbläsaren samma dag under Guardian-arbetet. |
| Mål-driven agent-resonemang ("Do smart things") | **Genuint saknas — bekräftat.** Enda spåret är `business_config.margin_target_percent`, aldrig läst av `lib/projects/margin-guardian.ts` eller någon annan agent-logik (noll träffar, verifierat direkt). Poddens fulla exempel (mål + historiska mönster) kräver samma `project_lesson`-data som redan är data-gated (0 rader). Se backlog #11 nedan för den ogatade, billiga delen. |
| Company Memory / "Lär Handymate" (rösta in en affärsregel) | **Viktig invändning, inte bara "obyggd".** `business_knowledge` skrivs ENBART passivt av agenternas observationsprompts — ingen väg där ägaren dikterar en regel. Och de tre läsplatserna (`app/api/moments/route.ts`, `app/api/observations/route.ts`, en dedup-koll) är ren VISNING — ingenting i offertmotorn eller Karins varningar tillämpar en enda rad. Att bygga input-knappen nu vore en input UTAN consumer — en ärlighetsregression, inte ett Business Twin-steg. Se backlog #12: regelmotor + minst en verklig konsument FÖRST, röst SIST. |
| "Software Factory" (internt Claude/Codex-flöde som självständigt prioriterar nästa feature ur kundsignal) | **Post-launch, inte nu.** Kräver kundfeedback-/support-/pilot-volym som inte finns förrän efter kund 1. Matchar `POST_REALITY_LAUNCH_VALUE_WAVE.md`s eget gate. |
| Earned Autonomy = "expand intelligence faster than authority" | **Redan arkitekturen.** = `lib/autonomy/earned-autonomy.ts` + Operating Principle §4 nedan. Validering, ingen ny idé. |

**Slutsats:** poddens värde är extern validering, inte ny riktning. Ingen
grind ändras, ingen kod skrivs. Två nya idéer tillagda i
`docs/strategy/BUSINESS_TWIN_IDEA_BACKLOG.md` (#11 Company Goals, #12
"Lär Handymate") så de inte tappas bort eller återuppfinns fel nästa gång
ett externt dokument landar.

---

# Extern rapport 2026-08-10 — absorberat / avvisat / fanns redan

En extern roadmap-rapport (ChatGPT med repo-tillgång) granskades 2026-08-10 mot detta
dokument och nattens Tur 4-leverans. **Domen: riktningen bekräftar rådets analys, men
~hälften av förslagen finns redan byggda och inget i den ändrar grindarna.** Mappningen
dokumenteras här så nästa session ärver den i stället för att göra om analysen.

| Rapportens förslag | Dom |
|---|---|
| 1 Value Layer | **Fanns till ~60 %**: attributionskärnan, weekly-value:s tre ärlighetsnivåer, Värdekvittot natt 1 (2026-08-10: `lib/value/vardekvitto.ts`, `GET /api/value/kvitto`). **Absorberat som Spår A1: Ägarrapporten** — se nedan. |
| 2 Matte som interface | = Jarvis-first-BESLUTET (mockup levererad 2026-08-07, väntar). Ingen ny spec behövs. "Får nästan vad som helst gjort" avvisas — utvidgning sker per verktyg med bevis, spärrarna (max tre specialister, fail-closed toolgränser, kön för pengar) står. |
| 3 Voice → Matte | Grunden finns (useAudioRecording, /api/matte/transcribe, hårdnad röstsäkerhet). Produktionsadaptern förblir ett medvetet senare beslut — voice→pengar är produktens högst riskade väg. |
| 4 Offer-to-Reality · 5 Job Genome | = X2a–f + prisinlärningens gate. Redan spec:at, gated på X1-pilotbevis. Rapporten bekräftar sekvensen, ändrar inget. |
| 6 Pengar på bordet 2.0 | Trikotomins hämta nu/möjligheter/risk byggdes 2026-08-10 på hemskärmen (Att hämta). **Absorberat som Spår A2**: samma gruppering på helsidan — liten insats, ogated. |
| 7 Next Best Action | Kärnexemplen finns (fakturera_projekt-kortet, offertnudgar, cash-radar). Per-objekt-bredd = inkrementellt, efter pilot. |
| 8 Automation receipts / veckorapport | Dygnsdigesten + hälsningsbeviset byggdes 2026-08-10. Ägarrapporten (A1) täcker rapportframingen. |
| 9 Customer professionalism | Portal + automatiska meddelanden finns. Detta är landningssidecopy (handymate-landing), inte kod. |
| 10 Promise Ledger | Står redan i AFTER EVIDENCE med gate. Rapportens "fånga löften ur samtal" = den breda AI-extraktion gaten uttryckligen förbjuder som start. Avvisat i den formen. |
| 11 Supplier Intelligence | NOT NOW med gate (licensierat AP-flöde). Oförändrat. |
| 13 Business Health | = AFTER EVIDENCE (rapportens egen brasklapp säger samma sak). |

**Spår A-deltat (absorberat, ogated — byggbart efter/parallellt med kvällsgrindarna):**
- **A1 Ägarrapporten**: värde-block på befintliga Månadsrapporten (INTE ny yta —
  "Andra Economic Copilot-UI: aldrig" gäller). Fyra block, tre sanningsnivåer som aldrig
  slås ihop: bekräftat (Värdekvittot) · uppskattat märkt (weekly-value-tid) · vilande
  (Pengar på bordet) · kostnadsraden (verifieras mot billing-data, annars utelämnas).
  Natt 1 = yta, inga utskick. Plan: `tasks/todo.md`.
- **A2 Pengar på bordet 2.0**: gruppera helsidan i Hämta nu / Möjligheter / Risk —
  samma kategorier ur `lib/value/pengar-pa-bordet.ts`, ny gruppering.
- **A3**: värdebevis- och professionalismcopy till handymate-landing.

**Ingen grind ändras.** Kvällsgrindarna (gyllene vägen, tvåtenantprovet, STOPP-provet,
B8, migrationerna) förblir #1 — moat-klockan startar vid kund 1.

---

# Läge 2026-08-09 kväll (uppdatering)

Sedan gårdagens lägesbild har följande levererats till prod — inget ändrar
NEXT-ordningen, men tre av gårdagens öppna punkter är stängda:

| Leverans | Läge |
|---|---|
| X1a Detektorns sanning | **Klar** (`e12d9570` + `6ecc3be9`): konservativ CONFIRMED/LIKELY/NEEDS_REVIEW-klassning, falska fastprisbelopp borta, cronfel syns i svaret. Punkt 3 i NEXT ACTION är alltså gjord. |
| Tvåtenantmiljön | **Upplåst** (`b5e9f7d2`): `sql/testbed_tenant_isolation.sql` reser den disponibla miljön — business_config-blockeraren är borta. Kvar: resa ett gratisprojekt och köra provet. |
| Klientsessionen | **Kritisk fix** (`3e88d202`): webbläsaren läste som `anon` — sessionen bodde i cookies men klienten letade i localStorage. Efter v96 nekades alla klientläsningar; settings sa det högt, 27 ytor läste tyst tomt. |
| RLS-utbyggnad | v101 KÖRD och verifierad: tretton tabeller till (booking, call_recording, ai_suggestion, business_users m.fl.) har v96:s mönster. |
| Samtalsvägen (etapp 2a–c) | Överlämningens fyra fel lagade; Lisa/analysmotorn har kodgräns; godkännandefällorna stängda (fail-closed). |
| Kanoniska offertbyggaren | Sju direktskrivare → en (`44da4055`); sign_token/nummer-buggen (SMS utan länk) stängd. Spärrhake-facit. |
| Inkorgen + Mötesassistenten | Etapp 1 + 3 i prod; v102 körd. |
| Fakturaunderlaget (P1-3) | **Klar** (`e75d1976`): autofakturan läser quote_items, inte legacy-JSONB:n; tillval hanteras. |
| Ett projekt per offert (P0-2) | Kod klar (`759a2856`); **v103 väntar på manuell körning** (dubblettlista först). |
| Beslutsposten (Spår 1.1) | Komplett: fem AI-producenter stämplar; price_adjustment medvetet utanför (ren matematik). |

**Öppen blind fläck som INTE står i NEXT-vågen:** Handymates egen betalväg.
Stripe B7-testköpet är fortfarande okört (tasks/launch-sprint.md del B) — utan
det kan ingen riktig kund betala oss, oavsett produktkvalitet. Behandlas som
lanseringsgrind bredvid gyllene vägen.

**Tillägg 2026-08-09 sent:** Hela projektauditen stängd P0→P2 (P1-6
ÄTA-livscykeln, P0-4 atomisk källmarkering via sql/v104, P1-2 härlett
driftläge + P2-1 i listan, P2-2/2-3/2-4). **X1b Revenue Review V1 är BYGGD**
(`8516a076` + `81d9fb36`) på Andreas beslut att köra före verifierings-
grindarna — Codex utan usage eliminerade kollisionsrisken, och kontraktet
var fryst sedan X1a. Scope hölls exakt: en källspecifik väg (ÄTA→utkast),
ingen autosändning, avfärdande med orsak, separata observabilitetstal.
Grindarna GÄLLER FORTFARANDE som pilotbevis: X1b:s definition-of-done
(minst ett verkligt pilotfynd → korrekt utkast utan dubbla rader) kräver
gyllene vägen + tvåtenantprovet innan X2 får starta.

---

# Läge 2026-08-08 kväll

NOW-vågen är **byggd och i produktion**. Därefter har orkestrerings-, demo-,
röst- och kostnadsspåren levererats utan att ändra den kommersiella NEXT-ordningen.

| Epic | Läge |
|---|---|
| N1 Schemasanning | **Klar.** 27 döda kolumnreferenser i 13 filer lagade. Vakten utökad till filterkolumner. |
| N2 Säkerhetsgrind | **Produktionsläget verifierat.** RLS, grants och `SECURITY DEFINER` är kontrollerade mot prod. Det disponibla tvåtenantstestet är fortfarande okört. |
| N3 Leveranssanning | **Klar.** Auto-sändningen hade aldrig fungerat — rutten kräver session, serveranropet 401:ade varje gång, felet kastades bort. |
| N4 Karins kvittens | **Klar.** Två lägen, invariant att de sista tre dagarna aldrig går att tysta, synlig ångra. |
| N5 Godkännande-kontrakt | **Klar.** 43 producenttyper klassade; okänd typ failar stängt. Elva föll tidigare till en gren som gissade fram SMS till kund. |
| N6 CI-grind | **Klar.** Tolv browserlösa kontraktsviter kör på varje push. |
| Offert-P0 (Codex) | **Klar, alla tio.** Publika läckan, referensfoton, beacon-dubbletten, dolda rader, ROT-taket, atomisk signering, lead/deal, versionsfält, unika nummer, momsen. |
| Innehållslås på accepterade offerter | **Klar.** Kommersiellt innehåll fryst vid accept; ändring kräver ny version. |
| Inställningarna | **Etapp 1 + 2 klara.** 27 val → sex områden, elva olänkade sidor fick hemvist, mobilen når allt. |
| Matte Epic 1–2 | **Klara.** Serverägda toolgränser, tenantvaliderade service-role-skrivningar och sekventiell plan med högst tre specialister. |
| AgentInteraction Epic 3 | **Klar.** Ett presentationskontrakt och samma agentmeddelande på chattytor och moments. |
| Demo Epic 4–5 | **Klara.** V99 är manuellt körd; reset är demo-only, atomisk och auditerad. Sexstegsstoryn använder riktiga routes och riktigt Matte-flöde. |
| Röstsäkerhet | **Hårdnad.** Sex tenant-/signaturhål är stängda. En produktionsadapter Voice → Matte är fortfarande ett senare, separat beslut. |
| Kostnadsmätning | **Grund byggd.** Leverantörsanvändning och COGS kan mätas; detta ändrar inte kundvärdesordningen nedan. |

## Verifierat mot produktionsdatabasen 2026-08-07

- v96, v97, v98 körda. `is_business_member` finns och är `SECURITY DEFINER`.
- Samtliga sex tenant-tabeller har exakt två policyer: `service_role` med `true`,
  `authenticated` med `is_business_member(business_id)`. **Ingen kvarvarande `true` för
  `authenticated`.**
- `business_integration_credentials` har enbart service_role-policy, och grants är
  återkallade för `anon` och `authenticated`. Fortnox-tokens är otillgängliga för
  webbläsaren på två oberoende nivåer.
- v98 failade först på fem `#E2E`-testofferter med samma nummer. Omnumrerade, inte
  raderade — tre av dem hade projekt eller faktura hängande.

## Grinden till NEXT — fortfarande öppen

Produktionssnapshoten är gjord, men de två beteendeproven är inte dokumenterat körda.

**Cross-tenant-provet** (`tests/tenant-isolation.integration.spec.ts`, Codex) kräver en
egen disponibel Supabase-instans. Blockerat av att **`business_config` saknar
`CREATE TABLE` i `sql/`** — en tom databas går inte att bootstrappa ur repot. DDL ska
genereras ur prod-schemat och läggas in som baslinje.

**Gyllene vägen** (`tasks/gyllene-vagen.md`) är färdig som manus men något verifierat
utfall är ännu inte infört här. Den ska köras i ett separat företag utan produktions-Fortnox.

**Tillåten korrigering medan grinden är öppen:** det befintliga
`missed-revenue`-svepet är redan aktiv produktionskod och beskriver signerad ÄTA och
ofakturerat material som entydigt fakturerbart. Det är starkare än källorna bevisar.
Att nedgradera dessa fynd till ett explicit, konservativt klassningskontrakt är en
NOW-sanningsfix — inte start av den nya X1-fakturavägen.

Allt ovan är databasens och kodens egen beskrivning av sig själv. Produktionssnapshoten
bevisar det aktuella policytillståndet, men **hela kundkedjans beteende är ännu inte
bevisat**. Vi har flera gånger sett saker som såg rätt ut i koden och var döda i drift.
X1b startar inte förrän båda beteendeproven är körda.

---

# 0. Operating Principles

1. **Koden är nuläget.** Ett dokument som säger att något fungerar är inte bevis. En
   migrationsfil i `sql/` är inte bevis för att kolumnen finns i produktion.
2. **Kundutfall före abstraktion.** Ingen primitiv byggs för en tänkt andra konsument.
3. **Fail closed** för säkerhet och handlingsexekvering. Okänd typ = vägran, aldrig
   tyst kvittering.
4. **Finansiell sanning före autonomi.** Ingen automatisk pengahandling förrän
   exekveringsvägen är autentiserad, idempotent, observerbar och återställbar.
5. **Andra konsumenten före generalisering.** Först när en verklig andra anropare finns
   med samma semantik — inte för att ett mönster ser återanvändbart ut.
6. **Fånga utfall när det är praktiskt.** Identifierad, fakturerad och betald är tre olika
   tal och får aldrig presenteras som ett.
7. **Inget parallellt schemaägande.** En migrationsförfattare och ett reserverat
   migrationsnummer i taget.
8. **Tyst tomt är ett fel, inte ett tillstånd.** Varje bakgrundsväg som sväljer sitt fel
   ska larma eller räknas.

---

# 1. NOW — Trust & Revenue Foundation

Mål för vågen: **det produkten redan påstår ska bli sant.** Ingen ny funktionalitet utom
den som krävs för att sluta ljuga. Inget i NEXT får starta innan N1–N2 är mergade.

---

## N1 — Schemasanningen: kod och databas får inte gå isär tyst

**Goal** — Ingen fråga får referera en kolumn som inte finns, och felklassen ska fångas
maskinellt i stället för av en människa som läser rad för rad.

**Customer outcome** — Kundens tidslinje, kundportalen och GDPR-registerutdraget visar det
de alltid påstått sig visa. Intäktssvepet börjar faktiskt köra.

**Problem being solved** — PostgREST returnerar 400 på **hela** frågan när en enda kolumn
saknas (42703). Anropen destrukturerar `const { data }` utan `error`, så `data` blir null,
`|| []` ger en tom lista, och inget loggas. Funktionen ser ut att fungera och är död.

Vad svepet efter felklassen faktiskt hittade — **27 döda kolumnreferenser i 13 filer**:

| Yta | Vad som varit dött | Allvar |
|---|---|---|
| GDPR-registerutdrag | `call_recording` — **samtliga** samtalsinspelningar saknades i utdraget | Rättslig |
| Intäktssvepet | `project_material.id` (PK är `material_id`) — låg i samma `Promise.all` som `project_change`, så den första lagningen var verkningslös | Kritisk |
| Kundens tidslinje | byggdagbok, ärendehändelser och tidrapportering — tre tomma sektioner | Hög |
| Kundportalen | nästa besök + senaste dagboksanteckning | Hög |
| Prismotorn | `quote_items.name` — har aldrig sett en enda offertrad | Hög |
| Agentens kontext | `pending_approvals.approval_id` — har alltid trott att kön är tom | Hög |
| Proaktiv omsorg + garantiuppföljning | avstängningen läste `automation_settings.settings` som inte finns → **spärren var en konstant, inte en spärr** | Hög |
| Adminmätning, seed av leadregler, dokumentgenerering | tysta nollor och omkörd seed | Medel |

Detta höjer N1 från "städa efter en bugg" till förutsättning för hela vågen: N2:s
RLS-inventering och N5:s handlingskontrakt vilar båda på att kod och prod-schema stämmer.

**Exact scope** — (a) verifiera och merga de 13 filerna som redan ligger i arbetsträdet;
(b) `tests/column-contract.spec.ts` som bygger facit ur `sql/` och jämför mot varje
`.select()` i `app/` och `lib/`.

**Out of scope** — Att laga `review_request.review_rating`/`review_text`. Kolumnerna finns
inte och **ingen kod skriver dem** — skyltfönstrets omdömesavsnitt är byggt mot ett schema
som aldrig funnits. Det är en obyggd funktion, inte ett stavfel, och står som enda post i
vaktens `KANDA_LUCKOR` med ett test som hindrar att listan växer.

**Dependencies** — Inga. Blockerar allt annat, eftersom brancher inte får röra samma filer.

**Schema impact** — Ingen. Alla lagningar är alias eller rätt kolumnnamn mot befintligt schema.

**Primary files** — `app/api/cron/missed-revenue/route.ts` · `app/api/customers/[id]/timeline/route.ts` ·
`app/api/gdpr/export/route.ts` · `app/api/portal/[token]/projects/route.ts` ·
`lib/agent/{context-engine,pricing-engine}.ts` · `lib/{communication-ai,document-generator,proactive-care,warranty-followup,seed-defaults}.ts` ·
`lib/projects/auto-invoice-on-complete.ts` · `app/api/admin/metrics/route.ts` ·
`tests/column-contract.spec.ts`

**Tests required** — Vakten grön. Parsern har egna facit för alias (`id:change_id`), embeds,
`*` och aggregat. Två sanity-test som fäller vakten om den slutar läsa `sql/` — annars kan
den bli grön av fel skäl.

**Observability** — De lagade vägarna loggar sina fel i stället för att svälja dem.

**Definition of done** — `npx tsc --noEmit` rent; vakten grön; svepet skapar kort mot
riktig data; ett GDPR-utdrag innehåller samtalsinspelningar.

**Suggested builder** — Codex (pågår) · **Suggested reviewer** — Claude
**Can run in parallel with** — Inget. **Must not overlap with** — Allt.

---

## N2 — Säkerhetsgrinden: tenant-isolering och en enda cron-auth

**Goal** — Bevisad tenant-isolering på de tabeller NEXT ska räkna pengar ur, och ett enda
fail-closed auth-kontrakt för alla cron-rutter.

**Customer outcome** — Ingen anställd eller annan kund kan läsa eller ändra ekonomiska
poster de inte äger.

**Problem being solved** — Repots migrationer definierar `FOR ALL USING (true)` för
`project`, `project_change`, `project_material`, `time_entry` och `supplier_invoices`.
Webbläsarkomponenter muterar minst `time_entry` direkt, och uppdaterings-/raderingsvägar
identifierar rader enbart på id. `business_config` innehåller Fortnox-tokens, läses
klient-sida och har ingen versionshanterad policy. `monthly-review` accepterar
`business_id` ur request-body. `fortnox-sync` och `project-health` kör vidare när
hemligheten saknas — och de rutter som "gör rätt" jämför mot
`` `Bearer ${process.env.CRON_SECRET}` ``, vilket accepterar den gissningsbara strängen
`Bearer undefined` om konfigurationen fattas. **Migrationer körs manuellt, så repots SQL
är inte bevis för produktionens policyer.**

**Exact scope** — Produktionsinventering av policyer och grants; cross-tenant-tester mot
två autentiserade tenants för select/insert/update/delete på de fem tabellerna; en
fail-closed cron-verifierare i samtliga cron-rutter; stängning av monthly-review-hålet;
kontroll att webbläsarroller inte kan läsa kredentialkolumner.

**Out of scope** — Ny behörighetsmodell. Policy-DSL. Att bredda `getAuthenticatedBusiness`.

**Dependencies** — N1 mergad.

**Schema impact** — En migrationsfil i `sql/` med reserverat nummer, körd manuellt i
Supabase SQL Editor. **Ingen migration körs programmatiskt.**

**Primary files** — `app/api/cron/**` (34 rutter) · `app/api/cron/monthly-review/route.ts` ·
ny `lib/cron/verify-secret.ts` · `sql/v9X_rls_*.sql` · `tests/permission-contract.spec.ts`

**Tests required** — Verifieraren testad mot **saknad hemlighet, `Bearer undefined`, fel
hemlighet och rätt hemlighet**. Cross-tenant-test som failar före hårdningen och passerar
efter. Rollprov för `see_financials` och `create_invoices`.

**Observability** — Antal nekade operationer utan PII; ögonblicksbild av
produktionspolicyerna arkiverad tillsammans med migrationsverifieringen.

**Definition of done** — Cross-tenant-testerna fail closed; ingen cron-rutt kör utan giltig
hemlighet; produktionens policytillstånd är dokumenterat, inte antaget.

**Suggested builder** — Codex · **Suggested reviewer** — Claude (arbetsflödespåverkan) +
oberoende DB-granskning av SQL
**Can run in parallel with** — N4 (om fillåsen håller). **Must not overlap with** —
`lib/karin/**`, fakturakomposition, `app/api/approvals/[id]/route.ts`.

---

## N3 — Fakturans leveranssanning

**Goal** — Ett leveransfel får aldrig ge status `sent` eller texten "skickad".

**Customer outcome** — Hantverkaren jagar aldrig betalning för en faktura kunden aldrig fick.

**Problem being solved** — `auto-invoice-on-complete.ts` skapar fakturan direkt som `sent`,
anropar den autentiserade `/api/invoices/send` **utan giltig användarsession**, ignorerar
svaret, och meddelar ägaren att fakturan är skickad. `_internal_business_id` konsumeras
inte av rutten — repot har själv dokumenterat den vägen som död sedan 2026-06-02.

**Exact scope** — Skilj skapande från leverans med verifierade tillstånd
(`draft` → `created` → `queued_for_delivery` → `delivery_attempted` → `sent` |
`delivery_failed`). Läs leveranssvaret. Avstämning för det icke-atomära paret
fakturaskapande + källmarkering.

**Out of scope** — Nytt fakturasubsystem. Generisk outbox. Att röra de övriga
fakturaskapande vägarna utöver tillståndskontraktet.

**Dependencies** — N1 mergad (auto-invoice-filen ligger i den committen).

**Schema impact** — Sannolikt statusvärden på `invoice`; migration i samma reserverade lane
som N2 eller efter den. Aldrig två författare samtidigt.

**Primary files** — `lib/projects/auto-invoice-on-complete.ts` · `lib/invoices/create-invoice.ts` ·
`app/api/invoices/send/route.ts`

**Tests required** — Tillståndsövergångar som enhetstest; integrationstest för lyckad,
misslyckad och delvis levererad sändning; idempotent omkörning; tenant- och rollprov.

**Observability** — Försök och resultat per kanal, sluttillstånd, antal omförsök,
korrelations-id. Avvikelser mellan faktura och källrad räknas.

**Definition of done** — Ingen kodväg kan sätta `sent` utan bekräftad leverans; en
misslyckad sändning syns för ägaren; omkörning skapar aldrig en andra faktura.

**Suggested builder** — Claude · **Suggested reviewer** — Codex (felvägar, idempotens)
**Can run in parallel with** — N2, N4. **Must not overlap with** — Revenue-filer, Karin.

---

## N4 — Karins kvittenssemantik

**Goal** — En kvittering får aldrig tyst tysta en lagstadgad påminnelse för alltid, och
ska alltid gå att ångra.

**Customer outcome** — Ägaren kan bocka av utan att riskera en förseningsavgift, och ser
vad avbockningen faktiskt betyder.

**Problem being solved** — `app/api/cron/karin-deadlines/route.ts:114` läser listan från
`lib/karin/handled-store.ts` och gör `if (hanterade.has(e.id)) continue` — **varje framtida
påminnelse för den skyldigheten upphör.** Ingen aktör, ingen tidpunkt, inget bevis. UI:t
erbjuder bara "Markera hanterad"; API:t kan ångra men gränssnittet kan inte. En laglig
skyldighet framställs som uppfylld utan att något styrker det.

**Exact scope** — Sanningsenlig semantik i minsta korrekta delmängd:
`acknowledged` (jag har sett den) och `snoozed` (påminn igen senare). Synlig ångra-knapp.
Aktör och tidpunkt sparas. Ingen etikett påstår att en deklaration är inlämnad.

**Out of scope** — `completed_with_evidence` och verklig inlämningsverifiering — det kräver
extern bevisning och är ett eget senare epos. **Ingen generisk kvitteringsplattform.**
Semantiken är Karin-specifik och stannar i `lib/karin/`.

**Dependencies** — N1 mergad. Produktbetydelsen beslutad (görs i epicets början).

**Schema impact** — Karin-lokal lagring på det stabila id:t `regel:<rule_code>:<due_date>`.
Ingen delad tabell.

**Primary files** — `lib/karin/handled-store.ts` · `app/api/cron/karin-deadlines/route.ts` ·
`app/api/karin/**` · `app/dashboard/karin/page.tsx`

**Tests required** — Semantik, utgång och gallring som enhetstest; roll- och tenant-prov på
rutterna; **ett påminnelsetest som bevisar skillnaden mellan kvitterad, snoozad och
uppfylld**; idempotent omkörning.

**Observability** — Varför en påminnelse undertrycktes, av vem, när, och när nästa går ut.

**Definition of done** — Ett klick kan varken tysta alla framtida påminnelser eller påstå
att en inlämning är gjord; ångra fungerar från gränssnittet.

**Suggested builder** — Claude · **Suggested reviewer** — Codex (feltillstånd, reproducerbarhet)
**Can run in parallel with** — N2, N3. **Must not overlap with** — `business_config`-migrationens
lane, Revenue-filer, central godkännande-exekvering.

---

## N5 — Godkännande-kontraktet: okänd typ failar stängt

**Goal** — Varje producent vet om dess kort är informativt, kräver granskning eller kan
exekvera — och kön vägrar okänt beteende.

**Customer outcome** — "Godkänn" gör antingen en dokumenterad sak, öppnar granskning, eller
kvitterar tydligt. Aldrig en tyst nollhandling som ser ut som att något hände.

**Problem being solved** — Okända godkännandetyper faller till `default:` och returnerar
"Godkänt utan specifik åtgärd". `missad_intakt` och den högrisk-klassade
`manual_project_create` saknar båda explicit hantering. Autonominedgradering är dessutom
inte universell: motoråtgärder passerar förbi de godkännanden vars avslag skulle anropa
`revokeAutonomy`.

**Exact scope** — Minsta explicita kontrakt: varje producenttyp klassad som
`INFORMATIONAL`, `ACKNOWLEDGEMENT`, `REVIEW_REQUIRED` eller `EXECUTABLE_ACTION`.
Exekverbara typer kräver registrerad hanterare. **Oklassad exekverbar typ failar stängt.**
Statisk täckningstest producent → klassning. Dokumentera och testa
nedgraderingsbeteendet per tillåten åtgärd.

**Out of scope** — **Universell Policy Engine.** Regelspråk. Generisk handlingslogg.
Behörighets- och risktrösklar förblir hårdkodade allowlists.

**Dependencies** — N1 mergad (kontraktets baslinje måste vara stabil).

**Schema impact** — Ingen ny tabell. Klassningen är kod.

**Primary files** — `app/api/approvals/[id]/route.ts` · `lib/approvals/execution-outcome.ts` ·
`lib/autonomy/earned-autonomy.ts`

**Tests required** — Statisk täckning av alla producenttyper; integrationstest för en
exekvering, en granskning, en kvittering och **en okänd typ som failar stängt**;
CAS-/idempotensregression.

**Observability** — Antal oklassade typer (ska vara noll), exekveringsfel, omförsök,
aktör och resultat.

**Definition of done** — Ingen ny producent kan skeppas utan klassning; ett okänt kort
går inte att godkänna; `missad_intakt` är klassad innan NEXT startar.

**Suggested builder** — Claude · **Suggested reviewer** — Codex (fail-closed, idempotens)
**Can run in parallel with** — Inget i NOW efter att N2 mergat. **Must not overlap with** —
Revenue-detektorn, Karin-filer, migrationslanen.

---

## N6 — Smal automatisk CI-grind

**Goal** — Typkontroll och de rena kontrakttesterna körs automatiskt på varje ändring.

**Customer outcome** — Indirekt: färre regressioner på pengavägarna.

**Problem being solved** — Det finns ingen automatisk grind. `.github/workflows/playwright.yml`
och `agents.yml` är båda `workflow_dispatch` only — **medvetet pausade** 2026-05-08
respektive 2026-05-06 med dokumenterade skäl (Playwright-sviten fungerar inte mot prod och
brände CI-minuter; agenterna kostade Opus-anrop utan värde). Kontrakttester kan alltså
regrediera på main utan att någon märker det, och NOW-vågen är på väg att öka antalet
parallella brancher.

**Exact scope** — En **ny** smal workflow som kör `tsc --noEmit` plus de rena,
browserlösa kontrakttesterna (`column-contract`, `schema-contract`, `permission-contract`,
`agent-team` och övriga facit som kör med `--no-deps`).

**Out of scope** — **Att återaktivera de två pausade workflowsen.** Skälen till pausningen
står kvar. Ingen prod-riktad Playwright-QA, ingen browsermatris, inga agent-körningar.

**Dependencies** — N1 mergad (annars är baslinjen röd).

**Schema impact** — Ingen.

**Primary files** — Ny `.github/workflows/contracts.yml` i **repo-roten**
`handymate-dashboard/` — observera att `.git` ligger en nivå ovanför projektmappen.

**Tests required** — Grinden ska fälla en avsiktligt trasig kolumnreferens.

**Observability** — Obligatorisk statuskontroll synlig på pull request.

**Definition of done** — En push med en död kolumnreferens blir röd automatiskt.

**Suggested builder** — Codex · **Suggested reviewer** — Claude
**Can run in parallel with** — N3, N4, N5. **Must not overlap with** — Produktionshanterare.

---

## Grind mellan NOW och NEXT — pilotens gyllene väg

Inte ett epos. En observations- och verifieringsaktivitet, och den mest informationsrika
åtgärd som inte kräver kod: följ **en** ägare genom offert → projekt → arbete → faktura →
betalning, och inspektera samtidigt verkligt tillstånd för Fortnox-scopes, körda
migrationer, cron-exekvering och Vercels plangränser (`vercel.json` schemalägger 36
körningar över 34 rutter, flera oftare än dagligen).

**NEXT startar inte förrän N1–N5 är mergade och den här vandringen är gjord.**

---

# 2. NEXT — Trustworthy Project Economics

## X1 — Revenue Recovery V1 (en konfidensmedveten vertikal skiva)

**Goal** — Hitta **ett** snävt definierat läckage, visa beviset, låt ägaren granska, och
följ pengarna hela vägen till betalning.

**Customer outcome** — Ägaren fakturerar arbete som annars glömts bort — och slipper
falska larm som föreslår dubbelfakturering.

**Problem being solved** — Svepet finns men har aldrig kört (N1). Viktigare: `tid + material
+ ÄTA = läckage` gäller **inte** för alla projekt. Fastprisprojekt, manuellt skapade
fakturor och Fortnox-importerade dokument saknar käll-länkning, och signerad ÄTA bevisar
inte utfört arbete. En universell aggregator dubbelfakturerar.

**Exact scope** — Tre konfidensklasser med olika beteende:

| Klass | Innebörd | Åtgärd |
|---|---|---|
| `CONFIRMED_UNBILLED` | Tillförlitlig `invoiced=false`, inget `invoice_id`, ingen källkoppling, och avtalsformen tillåter tillägg | Utkast får föreslås |
| `LIKELY_UNBILLED` | Källflaggor finns men manuell fakturering kan inte uteslutas | Granskning krävs |
| `NEEDS_REVIEW` | Avslutat projekt utan kopplad faktura, okänt belopp, eller ofullständig källdata | Endast signal |

Plus: bevis synligt per kort; **en** källspecifik utkastväg genom **befintlig**
fakturabyggare; koppling fynd → faktura → betalning; avfärdande med angiven orsak.

**Out of scope** — **Autosändning.** Universell tid+material+ÄTA-byggare. Tvärgående
"ofakturerat"-vy. Fler än en källklass. Ny fakturarutt.

**Dependencies** — N1, N2, N3, N5 mergade. `missad_intakt` klassad i N5.

**Schema impact** — Fältlokalt i fyndets payload — **ingen generisk Outcome Store.**

**Primary files** — `lib/value/missed-revenue.ts` · `app/api/cron/missed-revenue/route.ts` ·
ny Revenue Review-rutt och -vy · adapter mot befintlig fakturaförhandsvisning

**Tests required** — Fixtures för fastpris, löpande räkning, blandat, ÄTA, saknad
arbetskostnad och lucka i fakturalänkning. Omkörning skapar aldrig en andra faktura.

**Observability** — Identifierad, granskad, avfärdad (med orsak), utkast, skickad, betald —
som **separata** tal.

**Definition of done** — Minst ett verkligt pilotfynd granskas och blir ett korrekt
fakturautkast utan dubbla rader; falsklarm mäts; "återvunnen SEK" rapporteras aldrig som
detektorns belopp.

**Suggested builder** — Claude · **Suggested reviewer** — Codex (datahärkomst, tenant,
idempotens, finansiella gränsfall)

---

## X2 — Aggregate Outcome Quality V1

Offer-to-Reality är kopplat men producerar inte pålitlig inlärning. Omramat som
datakvalitet, uppdelat i självständigt granskbara skivor — **inte ett "engine"-epos**:

| Skiva | Innehåll |
|---|---|
| X2a | Utse **en** kanonisk motor (`lib/projects/compute-economics.ts`) för ny inlärning. Den äldre lönsamhetsmotorn varken raderas eller byggs om — den fryses bara ute från inlärning. |
| X2b | Beräkningsversion, offertkälltyp, källräknare, fullständighetsflaggor och tidsstämplar på den frysta representationen |
| X2c | Avstämning och admin-säker backfill för missade best-effort-frysningar (`lib/efterkalkyl/freeze-outcome.ts` har inget omförsök) |
| X2d | Materialdubbletter: avgör om `supplier_invoices` och `project_material` beskriver samma inköp |
| X2e | Realiserad vs förväntad intäkt som **två** märkta tal; arbetstimmar räknas bara för äkta timenheter — ROT/RUT-behörighet får inte förvandla kvantitet till timmar |
| X2f | Inlärningsgrind: prisråd kräver minsta jämförbara urval och tillräcklig fullständighet |

**Status 2026-08-16:** X2a/b/c/e/f byggda; aktivering väntar på manuell V138.
X2d är inte byggd. V1 blockerar i stället finansiell inlärning när både
`supplier_invoices` och `project_material` förekommer på samma projekt.

**Dependencies** — X1:s pilotbevis och källkvalitetsfynd.
**Suggested builder** — Codex (backend) · Claude (UI/copy **efter** att backend-kontraktet
mergats — aldrig samtidiga ändringar i samma filer)

---

# 3. AFTER EVIDENCE — Compounding Intelligence

Inget här startar utan att grinden är passerad. Grindarna är avsiktligt kvalitativa där
ingen baslinje finns — påhittad numerisk precision är värre än ingen.

| Kandidat | Evidence gate |
|---|---|
| Revenue Recovery, andra källklass | Första klassen korrekt **och använd**: fler sanna än falska fynd, och minst ett fynd har blivit betald faktura |
| Prisinlärning ur utfall | X2 klar; mätbar täckning och fullständighet; kända tvetydiga rader uteslutna |
| Djupare Karin-ekonomi (kundfordringar, marginal) | X2 klar och källorna bevisade; ingen andra Economic Copilot-yta |
| Karin betalningar/kassaflöde | **Licensierad** Fortnox-AP eller bankflöde finns — inte härlett ur kundfakturor |
| Promise Ledger V1 | Piloten visar ett verkligt problem; börjar i så fall med användarskapade löften och två pålitliga källor (portal + kundkopplad SMS), aldrig bred AI-extraktion |
| Avgränsad Project Autopilot | Varje detektor har eget bevis, egen åtgärd och egen falsklarmsmätning — ingen samlad agent |
| Decision Replay-utvidgning | Nästa konsekvensbärande AI-förslag byggs; metadata stämplas då |

---

# 4. NOT NOW

| Punkt | Varför uppskjuten | Vad som skulle motivera aktivering |
|---|---|---|
| Full Outcome Graph | Ingen konsument behöver grafrelationer; X2 löser inlärningen med fältlokal lagring | Två oberoende arbetsflöden behöver samma relationskontrakt |
| Event Journal / durable outbox | Revenue Recovery är ett omräkningsbart svep och behöver ingen garanterad leverans | En affärskritisk sidoeffekt som **inte** kan räknas om och kräver bevisad leverans |
| Generisk outbox | Samma skäl; funktionslokal idempotens räcker | Se ovan |
| Universell Policy Engine | N5 löser problemet med klassning och allowlists | Autonomi per åtgärd över fler domäner än godkännandekön |
| Company Model-tjänst/tabell | `business_config` är delad profillagring och räcker | En andra oberoende domän behöver stabila faktanamn, färskhet, källa och konfliktlösning |
| Generisk Evidence Store | Bevis är stabila referenser till befintliga rader | Löftes- eller tvisteflöden behöver gemensam bevisretention |
| Autonomy Marketplace | Reformulerad 2026-08-18 (Mission Mandates V1): grinden är inte längre generell — den öppnar PER ÅTGÄRDSTYP när den typens mandate-facit (`lib/mandates/mandate-facit.ts`, publicerat i uppdragspanelen) visar ett bevisat säkert utfall | En första typs mandate-facit visar bevisat säkert i drift över tid — datastyrt, en typ i taget, aldrig en samlad marknad på en gång |
| Margin Insurance | Kräver pålitlig marginal, vilket X2 först måste bevisa | X2 klar + försäkringsbar riskmodell |
| Homeowner Twin | Ingen efterfrågan visad | Upprepad kundefterfrågan i pilot |
| Supplier Intelligence | Leverantörsfakturor är manuella | Licensierat AP-flöde |
| Verified Contractor Passport | Ekosystemarbete utan bas | Marknadsefterfrågan |
| Handymate Protocol | Samma | Samma |
| Stor schemaläggningslösare | Projekttider är inte ens frusna meningsfullt | X2 ger pålitlig varaktighet |
| Bred datorseende/bevisklassificering | Ingen konsument | Konkret arbetsflöde |
| **Universell tid+material+ÄTA-fakturabyggare** | Dubbelfakturerar fastpris och manuellt fakturerat | Aldrig i den formen |
| **Autonom intäktsåtervinning/sändning** | Skickar pengakrav till kund utan mänsklig blick | Efter bevisad precision **och** N3:s leveranssanning |
| **Generisk `CalendarEvent` ut ur Karin** | Bara Karins regelhändelser använder den | Andra konsument med samma semantik |
| **"Uppfyllt" härlett ur en kryssruta** | Framställer laglig skyldighet som inlämnad utan bevis | Extern inlämningsbekräftelse finns |
| **Andra Economic Copilot-UI** | Karin är ägarens ekonomiyta; en till blir en konkurrerande sanning | Aldrig |
| Replay-UI / kontrafaktisk simulator | Ingen baslinje att spela upp | Decision Replay har verkliga konsumenter |
| Full centralisering av alla Anthropic-anrop | Stor refaktor utan kundvärde | Bärs av ett epos som ändå rör vägarna |

**Skjuts uttryckligen INTE upp tillsammans med outboxen:** funktionslokal idempotens och
avstämning. De krävs överallt där NOW eller NEXT kan skapa, skicka eller tillskriva pengar.

---

# 5. Claude / Codex Work Allocation

Grundregel: **Codex tar verifierbara, regelstyrda och testbara ytor. Claude tar
domänbetydelse, kundflöde och tvärdomän-implementation.**

| Epic | Builder | Reviewer | Branch / worktree | Tillåten domän | Förbjuden överlappning | Merge-beroende |
|---|---|---|---|---|---|---|
| N1 Schemasanning | Codex | Claude | Nuvarande arbetsträd | De 13 filerna + vakten | Allt annat | — |
| N2 Säkerhetsgrind | Codex | Claude + DB-granskning | `codex/wave0-tenant-cron-gate` | Cron-rutter, auth-helper, RLS-migration, verifieringstester | `lib/karin/**`, Revenue, fakturakomposition, approvals-rutten | N1 |
| N3 Leveranssanning | Claude | Codex | `claude/invoice-delivery-truth` | Auto-invoice, create-invoice, send-rutten | Karin, Revenue, RLS-migrationen | N1 |
| N4 Karins kvittens | Claude | Codex | `claude/karin-reminder-safety` | `lib/karin/**`, `app/api/karin/**`, Karin-cron och -vy | `business_config`-migrationslanen, Revenue, central exekvering | N1 |
| N5 Godkännande-kontrakt | Claude | Codex | `claude/approval-action-truth` | Klassning, hanterare, godkännande-UI | Revenue-detektorn, Karin, migrationslanen | N1, N2 |
| N6 CI-grind | Codex | Claude | `codex/contract-ci` | Ny workflow i repo-roten, testdokumentation | Produktionshanterare, Karin, migrationer, Revenue | N1 |
| X1a Befintlig detektors sanning | Codex | Claude | Nuvarande arbetsträd | `lib/value/missed-revenue.ts`, dess cron, Pengar-på-bordet-semantik och browserlösa facit | Ny fakturaväg, projektekonomikärnan, Karin | NOW klar; får göras före beteendegrinden eftersom vägen redan kör |
| X1b Revenue Review V1 | Claude | Codex | `claude/revenue-review-v1` | Review-API/UI och en källspecifik adapter mot befintlig fakturabyggare | Generisk fakturaomskrivning, projektekonomi, Karin, migrationer utan reservation | Gyllene vägen + X1a:s kontrakt |
| X1-verifiering | Codex | Claude | `codex/revenue-v1-verification` | Tester, fixtures, funktionslokal observabilitet | Samma produktionsfiler medan Claudes branch är öppen | X1b:s payload-kontrakt fryst |
| X2 Outcome Quality | Codex backend → Claude UI | Ömsesidig | Sekventiella worktrees, **aldrig samtidiga** | Codex: ekonomi/frysning/avstämning. Claude: befintlig utfalls-UI efter backend-merge | Samtidiga ändringar i `compute-economics.ts`, `freeze-outcome.ts`, offerthärledning eller samma migration | X1:s pilotbevis |

**Kollisionsregler**

1. **En** migrationsförfattare och **ett** reserverat migrationsnummer i taget.
2. Serialiserade integrationspunkter: `app/api/approvals/[id]/route.ts`,
   `lib/invoices/create-invoice.ts`, `business_config`-schemat, delade auth-helpers.
3. Två brancher får aldrig uppfinna fynd-, handlings- eller utfalls-payloads oberoende.
   **Frys kontraktet innan parallellt test- och UI-arbete.**
4. En arbetsström konsumerar bara **mergade** beroenden — aldrig en annan agents öppna worktree.
5. Vid delat arbetsträd: stagea alltid bara sina egna filer explicit. `Idag-*.html`,
   `debug.log` och rådsdokumenten hör inte till någon commit.

---

# 6. Merge Order

```text
N1  Schemasanning  ──────────────────────────────┐   (blockerar allt)
        │                                        │
        ▼                                        │
N2  Säkerhetsgrind                               │
        │                                        │
        ├──► N3 Leveranssanning ────┐            │
        ├──► N4 Karins kvittens ────┤  parallellt│ med varandra
        └──► N6 CI-grind ───────────┘            │
                    │                            │
                    ▼                            │
              N5  Godkännande-kontrakt ◄─────────┘
                    │
                    ▼
        X1a Befintlig detektors sanningsfix
                    │
                    ▼
        ══ GRIND: pilotens gyllene väg ══
                    │
                    ▼
              X1b Revenue Review V1
                    │
                    ▼
        ══ GRIND: pilotbevis ══
                    │
                    ▼
              X2  Aggregate Outcome Quality
```

**Kan gå parallellt:** N3, N4 och N6 efter N2 (olika domäner, inga delade filer).
**Kan inte:** X1b före den gyllene vägen, X1b före X1a:s klassningskontrakt eller
X2 före X1b (källkvalitetsfynden kommer ur piloten). X1a är uttryckligen tillåten
före grinden eftersom den minskar påståenden i en redan aktiv väg.

---

# 7. Pilot Evidence Scorecard

Mät bara det som styr roadmap-beslut. "AI-insikter genererade" och "händelser fångade" är
inte utfall.

**Revenue Recovery** — antal fynd · bekräftade sanna · falska · identifierad SEK ·
fakturerad SEK · **betald SEK** · tid till granskning · avfärdanden med orsak

**Offer-to-Reality** — projekt med tillräcklig fullständighet · avvikelse offert mot utfall ·
antal korrigeringar · dubbelräkningsincidenter · accepterade prisråd

**Karin** — kvitteringar · snoozningar · påminnelsens upplevda nytta · **falska eller
vilseledande påminnelser** (ska vara noll)

**Systemtillförlitlighet** — cross-tenant-fel (noll) · avvikelser mellan fakturastatus och
faktisk leverans (noll) · dubbelexekverade handlingar (noll) · cron-auth-fel · **oklassade
godkännandetyper (noll)**

Tre tal som aldrig slås ihop: **identifierad ≠ fakturerad ≠ betald.**

---

# 8. Future Activation Rules

1. Generalisera aldrig en primitiv förrän en **andra verklig konsument** med samma semantik
   finns. Ett mönster som ser återanvändbart ut räknas inte.
2. Automatisera aldrig en pengahandling förrän vägen är **autentiserad, idempotent,
   observerbar, granskningsbar** och har definierat återställningsbeteende.
3. Mata aldrig prisinlärning med projektutfall under fastställd fullständighetströskel.
4. Kalla aldrig återvunnen intäkt bekräftad utan avstämning mot faktura och källrad.
5. Fäst aldrig modell- eller promptmetadata på **deterministiska** regler — intäktsläckage
   och lagstadgade skyldigheter har regel-id och version, inte modell och prompt.
6. Behandla aldrig en migrationsfil i `sql/` som bevis för produktionens schema. Verifiera
   före varje beroende utrullning.
7. En cron som svarar HTTP 200 med fel per företag är inte en lyckad körning. Kräv mätvärden.

---

```text
NEXT ACTION (uppdaterad 2026-08-09, punkt 1 stängd 2026-08-13 — se
"Läge 2026-08-13"-sektionen längst upp för fullständig status och vad
som föreslås härnäst):
1. [KLAR 2026-08-13] Gyllene vägen körd och dokumenterad — men INTE i ett
   separat testföretag som ursprungligen tänkt, utan via ett automatiserat
   webbläsar-harness (tests/e2e-golden-path/) mot demokontot i produktion.
   Alla 14 stationer gröna. Åtta produktionsbuggar hittade+fixade under
   körningen. STOPP-provet (nämnt i punkt 4 nedan som B8:s andra grind)
   är INTE samma sak som gyllene vägen och är fortfarande okört — se
   2026-08-13-sektionen.
2. Res den disponibla tvåtenantmiljön (sql/testbed_tenant_isolation.sql i ett
   nytt gratis Supabase-projekt) och kör npm run test:tenant-isolation.
3. [KLAR 2026-08-09] X1a: konservativt klassningskontrakt, falska
   fastprisbelopp borta, cronfel synliga.
4. [KLAR 2026-08-09 kväll] Stripe B7-testköpet BEVISAT: subscription_status
   'active', stripe_subscription_id satt, payment_succeeded +
   checkout_completed i billing_event. Kvar: B8 LIVE-växlingen (test-price-id:n
   i billing_plan byts tillbaka till live + live-nycklar + live-webhook) —
   görs som eget steg när gyllene vägen och STOPP-provet är gröna.
   Genomgången gav dessutom tio UX-fynd som fixades i farten (teamintro,
   org.nr-vakten, steg 3/4-besked, tourplacering, support@).
5. Kör sql/v103 (ett projekt per offert) — dubblettlistan först.

EFTER GRINDEN (gyllene vägen + tvåtenantprovet):
Claude bygger X1b:s smala review-yta och exakt en källspecifik väg till ett
fakturautkast. Ingen autosändning och ingen generell tid+material+ÄTA-byggare.
```
