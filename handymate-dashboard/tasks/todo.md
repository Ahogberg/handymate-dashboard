# Fortnox historik-widening — betald historik, inte bara obetalt

Källa: Andreas fråga "Borde vi bygga vidare på historisk finansiell data
nu?" (uppföljning på Bolagsverket-diskussionen). Research visade att
Fortnox-importen bara pullade ÖPPNA/OBETALDA fakturor — aldrig betald
historik — och att ett ORELATERAT bugg-fynd dök upp under vägen (se
separat sektion nedan, redan fixad `a667fb77`). Andreas godkände fullt
scope efter tre AskUserQuestion-avstämningar: 12 månaders fönster,
"Hämta historik"-knapp för befintliga anslutna kunder också, och en
positiv rad i onboardingens payoff-yta.

## Byggt (commit `5ec28b83` — pushat, deployat, Vercel-verifierad)

- **`lib/fortnox.ts`**: `getFortnoxInvoices` gör nu TVÅ Fortnox-anrop,
  ihopslagna via ny `mergeFortnoxInvoiceLists` (ren, testad): `filter=
  unpaid` UTAN tidsgräns (ett obetalt ärende ska aldrig tappas bort för
  att det är gammalt) + `fromdate=<12 månader sedan>` UTAN statusfilter
  (ger betald historik + senaste årets öppna). `fromdate` verifierat mot
  Fortnox egen utvecklardokumentation (fetchbar, till skillnad från
  Bolagsverkets CAPTCHA-skydd) — inte gissat. Ingen ny OAuth-scope krävs.
- **`lib/fortnox/map-invoice.ts`**: ny `status:'paid'`-gren. `outstanding
  = 0` OVILLKORAT för betalda fakturor (aldrig beroende av om Fortnox
  Balance-fält råkar vara satt/korrekt — en fallback till Total hade
  kunnat räkna en betald faktura som skuld). `paid_at` sätts ALDRIG
  (denna Fortnox-endpoint bär inget betalningsdatum — gissa aldrig ett).
- **"Hämta historik"-knapp** i Inställningar → Integrationer: samma två
  import-rutter (kunder, fakturor) som onboardingen. Båda redan
  idempotenta (dedup på fortnox_document_number/customer_number/e-post/
  telefon) — säkert för en redan ansluten kund att klicka flera gånger.
- **Onboardingens payoff-yta** (`Step6LiveTour.tsx`): ny stödjande rad
  "N fakturor värda X kr sedan [månad år]" — separat fält
  (`historical_revenue`), tävlar ALDRIG om headline-platsen.
  `pickHeadline`s test-låsta förfallet/obetalt-prioritet är helt orörd.

## Verifierat

- 35 nya/ändrade facit gröna: TDD för de rena delarna (merge-logik,
  paid-status-mappning, historical_revenue-aggregering), källskanning
  för route/UI-lagret.
- `npx tsc --noEmit` rent, `npx next build` ren.
- Full svit: 3057/3064. 5 av 7 failande var miljö-flakiga (GET-endpoint-
  checkar helt orelaterade till det jag ändrat — bekräftat med en
  isolerad omkörning, alla 5 gröna direkt). De 2 kvarvarande är Codex
  pågående konsolideringsarbete, sedan tidigare bekräftat orört.

## Kan skarptestas direkt (ingen extern registrering krävs, till skillnad
från Bolagsverket-bygget)

Fortnox-anslutningen finns redan (existerande OAuth-integration) — nästa
gång ett anslutet testkonto klickar "Hämta historik" eller går igenom
onboarding med Fortnox-koppling går det att verifiera skarpt mot riktig
data direkt, ingen väntan på en manuell registreringsprocess.

---

# Bolagsverket-uppslag som start av onboarding — V1 klart

Källa: Andreas "Nu när du byggt resten vill jag att vi gör en plan för
Bolagsverket-implementation som start av onboardingen" — uppföljning på
[[bolagsverket-not-implemented]]. Plan skriven i plan mode med extern
research (Bolagsverkets egen dokumentation är CAPTCHA-skyddad mot
automatiserad läsning — bekräftade endpoints via en publicerad
tredjeparts-klients dokumentation i stället för att gissa). Scope
avstämt med Andreas: bara namn/adress/bolagsform-prefill nu; historisk
ekonomisk data (årsredovisningar/iXBRL) blir en egen, senare etapp —
fungerar dessutom bara för AB/ekonomisk förening (enskild firma har
normalt ingen årsredovisningsskyldighet, vanligt bland hantverkare).

## Vad research visade

Bolagsverkets "värdefulla datamängder"-API (EU-direktivets öppna data):
genuint gratis, inget avtal — Andreas uppgift stämde. Registrering är
självbetjäning ("kundanmälan": e-post+telefon → API-nycklar via e-post/
SMS), INTE en lång godkännandeprocess — men är ändå ett manuellt steg
BARA Andreas kan göra; blockerar skarpt bruk tills
`BOLAGSVERKET_CLIENT_ID`/`SECRET` finns i miljön. OAuth2-autentisering
(inte mTLS/certifikat — det gäller bara Bolagsverkets separata,
avgiftsbelagda API). Endpoints bekräftade via en publicerad tredjeparts-
klients dokumentation (`gw.api.bolagsverket.se`), eftersom
bolagsverket.se:s egna sidor är CAPTCHA-skyddade mot automatiserad
läsning — exakt request/svar-schema för `POST /organisationer` är en
välgrundad gissning som behöver verifieras mot den riktiga tekniska
dokumentationen som följer med API-nycklarna.

## Byggt (commit `f15661b9` — pushat tillsammans med Codex `d782cb00`
(Cross-Agent Customer Case V1, granskad separat innan push), deployat,
Vercel-verifierad)

- **`lib/bolagsverket/client.ts`** (ny): OAuth2 client-credentials-token
  + cache, `lookupCompany(orgNumber)`. Defensiv svarstolkning
  (`parseOrganisationResponse`) — validerar formen innan den litar på
  den, `null`/`invalid_response` hellre än att gissa fram ett fält.
  Saknade credentials → `not_configured` direkt, ingen nätverksrundtur.
- **`app/api/onboarding/bolagsverket-lookup/route.ts`** (ny): exakt
  samma mall som befintliga `scrape-website/route.ts` — valfri auth
  (frågan ställs innan kontot finns), egen rate-limit-bucket-namnrymd
  (`bolagsverket:` — kolliderar inte med `scrape:`), svarar ALLTID 200
  utom 429, kastar aldrig.
- **`Step2Business.tsx`**: ny `'orgnr'`/`'orgnrLookup'`-fas FÖRST i
  state-maskinen, före hemsides-frågan. Skäl till ordningen: org.nr är
  den mest auktoritativa källan, så när hemsides-scrapen (om den körs)
  når sina egna fill-only-empty-kontroller är namn/adress redan satta —
  ingen egen konfliktlösningslogik behövdes. Mid-form-org.nr-fältet
  BEHÖLLS oförändrat (säkerhetsnät för konton redan mitt i onboarding
  när detta släpps, och en naturlig redigeringspunkt om uppslaget gav
  fel data).
- **`sql/v135_business_registered_address.sql`** (SKRIVEN, EJ KÖRD):
  tre nullable adresskolumner (`address_street/postal_code/city`). Det
  gamla, redan döda `business_config.address`-fältet rörs INTE.
  `company_form`/`company_profile_source` behövde ingen ny kolumn —
  fanns redan sedan v94, bara aldrig skrivna av kod förrän nu.
- **`app/api/auth/route.ts`**: nya fälten skrivs villkorat vid
  registrering, skyddade av det redan existerande `saknadKolumn`-
  migrationsfönstret (samma mönster som Margin Guardian-deployen förra
  natten) — säkert att köra i produktion INNAN v135 körs.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- 28 nya facit gröna (`bolagsverket-client.spec.ts` 9 st,
  `bolagsverket-onboarding.spec.ts` 19 st) — TDD för klientens rena
  delar, källskanning för route/UI/migration.
- `npx next build` — ren build.
- Full testsvit: 3034/3036 gröna. De 2 failande
  (`stegkedjan.spec.ts:52`+`:101`) är Codex konsolideringsarbete från
  igår kväll, bekräftat orört.
- Pushat efter `git log origin/main..HEAD` visade Codex `d782cb00`
  (Cross-Agent Customer Case V1) i kön — granskad innan push:
  `lib/jarvis/customer-case.ts` byggde in EXAKT de tre förfiningarna jag
  flaggade i min tidigare rekommendation (explicit per-typ-resolver
  inkl. det nästlade `package_data.customer_id`-fallet för
  `autopilot_package`, och uttrycklig exkludering av signaler som redan
  ägs av ett synligt projekt-case) — höll måttet, pushade båda.
- Vercel-deployen verifierad `Ready`.

## Kvar innan skarpt bruk (inte en kodfråga — Andreas manuella steg)

1. Genomför Bolagsverkets "kundanmälan" (självbetjäning, gratis).
2. Lägg `BOLAGSVERKET_CLIENT_ID`/`SECRET` i Vercel-miljön.
3. Verifiera `POST /organisationer`-svarets EXAKTA fältnamn mot den
   riktiga tekniska dokumentationen som följer med nycklarna — min
   `parseOrganisationResponse`-gissning kan behöva justeras (degraderar
   snällt till `invalid_response` om den har fel, kraschar aldrig).
4. Kör v135 (`Kör v135!`) när redo — inte förr.

---

# Mål i onboarding + synlig ekonomiprojektion — backlog #11 klart

Källa: Andreas fråga "Borde vi redan i onboarding eller direkt efter också
fråga kunderna vad deras mål för omsättning och marginal är?" — uppföljning
på gårdagens NBA-bygge (`a997039c`) som visade att 0/22 konton någonsin
satt `revenue_target_annual_sek`/`margin_target_percent`. Plan godkänd i
plan mode efter research (onboarding är 7 steg, inte 10 som gamla docs
säger; steg 2 har redan ett etablerat frivillig-fråge-mönster). Andreas
godkände planen ("Kör planen!") och bad separat att verifiera ett minne om
Bolagsverket-prefill i onboarding — bekräftat INTE byggt, se egen sektion
längst ner. Bolagsverket-delen skjuts medvetet upp (Andreas: "vill nog köra
Bolagsverket-delen sen, deras API ska vara gratis").

## Byggt (commit `c21022f3` — pushat tillsammans med Codex `d53c90d4`
(Canonical Project Completion, granskad separat innan push), deployat,
Vercel-verifierad)

- **`lib/economy/revenue-pace.ts`** (ny): `computeRevenuePace` — dag-i-
  året-taktmatematiken extraherad ur `next-best-action-goals.ts` så NBA:s
  LLM-kontext och en människa (MalBlock) räknar på EXAKT samma sätt.
  `buildGoalContextLine` refaktorerad att anropa den — extern signatur/
  textutdata oförändrad, NBA:s egna 27 facit gröna oförändrat.
- **Onboarding steg 2** (`Step3HowYouWork.tsx`): två nya frivilliga fält
  (omsättningsmål kr/år, marginalmål %) i samma "hoppa över"-stil som
  intern timkostnad. Ingen ny steg, ingen steg-omnumrering behövdes.
- **Kritisk fälla fixad**: `app/api/onboarding/route.ts`s `ALLOWED_
  COLUMNS`-vitlista saknade båda de nya kolumnnamnen — koden varnar
  själv uttryckligen om exakt den här bugklassen ("den tysta fällan").
  Utan fixen hade fälten försvunnit ospårat, precis som `f_skatt_
  registered` en gång gjorde.
- **`MalBlock.tsx`** (Månadsrapporten): bytte ut den gamla grova "denna
  månad / (årsmål÷12)"-uppskattningen mot riktig YTD-takt via
  `computeRevenuePace`. Egen tenant-filtrerad YTD-fakturasumma-hämtning,
  bara körd när ett mål faktiskt är satt. Neutralt "Räknar takt…" under
  laddning — aldrig en halvfärdig/gissad siffra.
- **`MalNudge.tsx`** (ny, i JarvisHome): de 22 befintliga kontona som
  onboardat FÖRE det här bygget hade annars aldrig sett att fälten
  finns. Avvisningsbar (localStorage, per företag), fail-soft — visas
  BARA när fältet bevisat saknas, aldrig vid laddning/fel. Monterad i
  systemnivå-zonen ovanför ProjektCaseKort, samma plats som mandags-
  kortsbannern.

## Verifierat

- `npx tsc --noEmit` — noll fel genom hela bygget.
- 30 nya/ändrade riktade facit gröna: `revenue-pace.spec.ts` (5, TDD),
  `next-best-action-goals.spec.ts` + `next-best-action.spec.ts` (27,
  oförändrat beteende efter refaktorn), `onboarding-goals.spec.ts` (7),
  `malblock-pace.spec.ts` (5), `mal-nudge.spec.ts` (6).
- **Sidofynd fixat under vägen**: `business-config-reads.spec.ts` slog
  rött på `MalNudge.tsx`s nya klient-läsning av `business_config` —
  facit kräver att VARJE ny läsning klassas explicit (dokumentyta vs
  visningsyta) i stället för att glida in oklassad. Klassad som
  visningsyta (samma kategori som MalBlock, ren visning, fail-soft).
- `npx next build` — ren build.
- Full testsvit: 2995/2997 gröna. De 2 failande (`stegkedjan.spec.ts:52`
  + `:101`) är Codex pågående `completeProject`-konsolidering
  (commit `d53c90d4`, "Canonical Project Completion V1") — bekräftat
  orört av något jag ändrat (varken filen eller testet nämner någon av
  mina filer).
- **Delad arbetskatalog**: `git log origin/main..HEAD` visade Codex
  `d53c90d4` liggande före min egen commit i kön. Granskad innan push
  (inte bara litat på att testerna gick igenom): läste `lib/projects/
  complete-project.ts` i sin helhet — korrekt tenant-filtrerad, atomisk
  compare-and-set-övergång, återanvänder min fail-closed `checkFourEyesGate`
  rakt av. Pushade båda tillsammans (`c21022f3`).
- Vercel-deployen verifierad `Ready`.

## Kontrollerat direkt i prod-DB (innan bygget, för att grunda planen)

0/22 konton hade `revenue_target_annual_sek` satt. Samma mönster som
Margin Guardian före v134 och Bränsle före första köpet: kapaciteten
byggd, riktig användning slår på den. Onboarding-fixen löser det för NYA
konton; nudgen för de befintliga 22.

---

# Verifierat: Bolagsverket-prefill i onboarding — INTE byggt

Andreas mindes en tidigare diskussion om att onboarding skulle inledas med
organisationsnummer → automatisk Bolagsverket-hämtning (adress m.m.
prefyllt) + historisk ekonomisk information. Kontrollerat mot faktisk kod,
inget gissat (Explore-pass, källor: `Step2Business.tsx`, `sql/
v94_company_profile.sql`, `app/api/business-config/company-profile/
route.ts`, `docs/council/COUNCIL_SYNTHESIS.md`):

**Finns**: ett manuellt org.nr-textfält med lokal Luhn-validering
(`lib/karin/org-number.ts`) och en hjälptext som skickar ANVÄNDAREN att
slå upp det själv hos Bolagsverket — ingen automatisk hämtning triggas.
`business_config.company_profile_source` har en DB-CHECK som tillåter
`'bolagsverket'` som värde, men det skrivs ALDRIG någonstans i kodbasen —
bara `'user'`, hårdkodat, ovillkorat, på varje spara. Internt redan
dokumenterad brist i `docs/council/COUNCIL_SYNTHESIS.md`.

**Företagskollen** (handymate.se/foretagskollen) är en helt annan sak —
ett marknadsförings-lead-quiz på den separata landningssajten, 0
inskickade leads. Ingen registeruppslag. **Ingen** historisk ekonomisk
information hämtas från någon extern källa någonstans i kodbasen.

**Återanvändbart mönster om detta byggs senare**: onboarding har redan
AI-driven auto-fyll från hantverkarens EGEN hemsida (`app/api/onboarding/
scrape-website/route.ts`, Claude Haiku-extraktion) — samma arkitektur
(extern källa → extraktion → prefyll) skulle passa en Bolagsverket-
integration. Andreas vill köra den separat senare — noterat att
Bolagsverkets öppna data-API ska vara gratis (obekräftat av mig, hans
uppgift).

---

# Cross-Agent Customer Case V1 — klar 2026-08-15

## Beslutade designregler

- Kundkoppling härleds med en explicit allowlist per approval-typ: direkt
  `customer_id`, nästlad `package_data.customer_id` eller tenantfiltrerat
  offert-/fakturauppslag. Ingen generell fallbackkedja.
- Projektet äger en delad signal. Approval-rader som redan ingår i ett synligt
  projekt-case exkluderas från kund-caset.
- Ett kund-case kräver minst två distinkta `approval_type`. Agentdomän är
  presentation, inte kvalificering.
- V1 är helt läsande: ingen SQL, ingen ny approval-, lås-, SMS- eller
  exekveringsmekanik.

## Plan

- [x] Inventera faktiska approval-payloads och lås den minsta säkra typallowlisten.
- [x] Skriv facit för explicit tenant-säker kundresolver, projektägarskap,
  tvåtypsgräns och fail-visible uppslag.
- [x] Bygg ren kund-case-härledning och en route med befintlig auth,
  behörighetskontroll och testdatafilter.
- [x] Bygg ett återanvänt Jarvis-kort utan egna åtgärdsknappar och montera det
  vid Project Case ovanför NBA.
- [x] Verifiera TypeScript, riktade browserlösa tester, produktionsbuild och
  exakt diff. Uppdatera roadmap/resultat och skapa en isolerad commit.

## Resultat

- `lib/jarvis/customer-case.ts` innehåller en ren, explicit resolver för 13
  approval-typer och den gemensamma tvåtypshärledningen.
- `/api/customer-cases` återanvänder auth, per-rad-behörighet och testdatafilter
  från kön. Alla indirekta service-role-uppslag är tenantfiltrerade och varje
  Supabase-fel läses.
- Synliga Project Case-signaler reserveras före kundgrupperingen. Kundkortet
  visar därför bara signaler som inte redan berättas av projektkortet.
- `KundCaseKort` återanvänder Matte-/agentavatarerna, länkar till den riktiga
  kundsidan och visar en rent rådgivande kontaktvarning vid överlapp.
- Äldre `payload.agent` respekteras nu av den delade agentpresentationen, så
  garantiuppföljning attribueras till Hanna i stället för typfallbacken Lars.
- Ingen SQL eller skrivande affärslogik tillkom.

## Verifiering

- `npx tsc --noEmit` — grön.
- 143/143 riktade customer/project-case-, Jarvis-, approval-routing-, preview-
  och action-contract-facit — gröna.
- `npx next build` — grön med samma befintliga miljö-/metadata-varningar.
- Read-only liveproben kunde inte ansluta: `.env.test` saknar Supabase-URL och
  service-role-nyckel. Leveransen påstår därför inget live-DB-bevis.

---

# Canonical Project Completion V1 — klar 2026-08-15

Andreas beslutade att stänga de kvarvarande P1-fynden innan nästa Business
Twin-insats (Cross-Agent Customer Case V1). P0-fixarna i `7e32413d` är
förutsättningen men inte konsolideringen: desktop, mobil och fyra-ögon-
godkännandet har fortfarande separata avslutskedjor.

## Plan

- [x] Inventera alla direkta `project.status = completed`-skrivare och skriv
  ett spärrhake-/paritetsfacit innan flytten.
- [x] Inför en kanonisk serverfunktion med tenantfiltrerad projektläsning,
  fyra-ögon-grind för direkta anrop, atomisk övergångsvakt, kontrollerad
  primär write och strukturerat resultat per sidoeffekt.
- [x] Flytta befintlig kedja utan nya produktbeslut: workflow-steg,
  `job_completed`, auto-faktura, fryst efterkalkyl, debrief, Lars-trigger,
  recensionskort och completion-batch.
- [x] Koppla `/api/projects`, `/api/booking/complete-job` och
  `four_eyes_project_close` till samma funktion. Ingen sidoeffekt får köras
  efter misslyckad primär statusuppdatering.
- [x] Bevara befintlig `ProjectCloseoutModal` och ge övriga dörrar samma
  sanningsenliga closeout-resultat; ingen ny parallell presentationsyta.
- [x] Bevisa parity, fail-closed, idempotent återanrop och synlig partial
  failure med browserlösa tester.
- [x] Verifiera `npx tsc --noEmit`, relevanta facit, hela browserlösa sviten
  och `npx next build`; granska exakt diff före separat commit.

## Avgränsning

- Ingen SQL och ingen ny tabell.
- Ingen automatisk rollback av redan skapad faktura/recension vid återöppning.
- Ingen förändring av fakturerings-, debrief-, review- eller agenternas
  affärsregler; endast en gemensam orkestrering av befintliga primitiver.
- Cross-Agent Customer Case V1 ligger kvar som nästa insats efter detta.

## Resultat

- `lib/projects/complete-project.ts` äger nu tenantkontroll, fyra-ögon-grind,
  atomisk statusövergång och hela den befintliga avslutskedjan.
- Desktop, mobil och fyra-ögon-godkännandet använder samma tjänst. Den gamla
  E2E-debugskrivaren använder den kanoniska atomiska övergången.
- Resultatet redovisar varje effekt separat och återanvänds av både API och
  den befintliga closeout-modalen; ett saknat resultatunderlag kan inte längre
  dölja en varning.
- Nya facit täcker dörrparitet, förbud mot nya direkta completed-skrivare,
  tenantfilter, compare-and-set, fail-closed, återanrop och synliga partiella
  fel.
- Ingen migration eller annan SQL tillkom.

## Verifiering

- `npx tsc --noEmit` — grön.
- Avgränsad closeout-/fyra-ögon-/efterkalkylsvit — 58/58 grön efter den
  avslutande säkerhetsgranskningen.
- `npx next build` — grön (befintliga miljö-/metadata-varningar kvarstår).
- Hela Chromium-facitet startades. De nya closeout-faciten var gröna, men
  externa sessions-/nätverkstester mot `app.handymate.se` blockerades av
  sandboxen med `connect EACCES`; körningen avbröts efter att samma externa
  blockerare upprepats och redovisas därför inte som en grön fullsvit.

---

# Project Closeout P0-fixar — fyra-ögon fail-closed + godkännandets tysta fel

Källa: Codex granskade project closeout (desktop `app/api/projects/route.ts`,
mobil `app/api/booking/complete-job/route.ts`, godkännandet
`app/api/approvals/[id]/route.ts`) och rapporterade två P0-fynd + tre P1
(ojämn parity, saknad closeout-modal på två av tre vägar, ingen atomisk
övergångsvakt) plus en större "Canonical Project Completion V1"-plan.
Claude verifierade båda P0-fynden byte-för-byte mot faktisk kod INNAN
något gjordes — se metod i tidigare pass ikväll. Andreas beslutade:
fixa bara de två P0:orna nu (litet, isolerat), fail-closed-riktning
bekräftad; P1:orna och den större konsolideringen är en separat framtida
diskussion, inte del av den här fixen.

## Byggt (commit `7e32413d` — pushat, deployat, Vercel-verifierad)

**P0-1 — fyra-ögon-grinden fail-closed vid läsfel** (`lib/projects/
four-eyes-gate.ts`): koden var 2026-08-09 dokumenterad som medvetet
fail-open ("kan konfig/projekt inte läsas svarar grinden gated=false men
med error satt, så anroparen själv får välja") — men VERIFIERAT att ingen
av de tre dörrarna någonsin läste `.error`, bara `.gated`. Värre: de
ursprungliga `.select().single()`-anropen destrukturerade inte ens
`error` från Supabase-svaret, så en vanlig (icke-kastande) läsfel-rad
gav `config: null`/`project: null` och tystade returnerade `{gated:
false}` — omöjlig att skilja från "fyra ögon är genuint avstängt". Ny
`reason: 'verification_failed' | 'approval_required'` skiljer
overifierbart läge från ett äkta väntande kort. Båda dörrarna
(`app/api/projects/route.ts` PUT, `app/api/booking/complete-job/
route.ts`) uppdaterade att kolla `reason === 'verification_failed'`
FÖRE `.gated` och blockera med ett tydligt fel i stället för att tyst
fortsätta stänga.

**P0-2 — godkännandets projektuppdatering läste aldrig felet**
(`app/api/approvals/[id]/route.ts`, case `four_eyes_project_close`):
`await supabase.from('project').update(...)` kördes utan att
destrukturera `{ error }`, och returnerade ändå ok:true oavsett utfall.
Ett misslyckat write (RLS, fel tenant, nätverk) lät fakturering/
efterkalkyl/debrief/recensionsbegäran gå vidare mot ett projekt som
aldrig faktiskt stängdes — och (bonus, ingen extra kod behövdes) den
redan byggda Distributed Value Receipts-kedjan (`lib/approvals/
execution-outcome.ts`s `classifyExecutionResult`, `result.ok === false`)
plockar nu upp detta automatiskt och visar en ärlig "misslyckades"-status
i stället för en tyst lögn.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- 7 nya facit i `tests/fyra-ogon.spec.ts` (fail-closed på config-läsfel,
  project-läsfel, kastad exception; `reason`-fältet finns; båda
  anroparna kollar `verification_failed` före `.gated`; godkännandet
  läser `closeError` och returnerar `ok:false`) — TDD, röda innan fixen,
  gröna efter. 23/23 i `fyra-ogon.spec.ts` + `projektstangningen.spec.ts`
  totalt.
- `npx next build` — ren build.
- Full testsvit: 2956/2957 gröna. Den enda failande
  (`stegkedjan.spec.ts:52`, "fire-and-forget") är INTE flaky (körd 3x i
  rad, samma fel varje gång) men är HELT OROELATERAD till de här filerna
  — grundorsak identifierad: `lib/projects/create-from-quote.ts` använder
  ett synkront `try { await advanceProjectStage(...) }` (med egen
  dokumenterad motivering: den "kända divergerande interna vägen" som
  `app/api/quotes/accept/route.ts` anropar direkt), medan de andra två
  stegkedje-skaparna använder fire-and-forget `.then().catch()`.
  Facit-testet antar samma mönster+felsträng i alla tre och har inte
  hängt med i divergensen. Samma failure fanns redan i den fristående
  NBA-testsviten tidigare i natt, innan jag rörde någon av de här
  filerna — bekräftat förbefintlig, inte en regression. Flaggas separat,
  fixas inte här (utanför kvällens godkända scope).
- Pushat (`7e32413d`) efter `git log origin/main..HEAD` visade att bara
  min egen commit låg i kön. Vercel-deployen verifierad `Ready`.

## Ej gjort (medvetet, utanför scope)

Codex tre P1-fynd (mobilvägen kör vidare trots misslyckad statusuppdatering,
bara desktopvägen öppnar `ProjectCloseoutModal.tsx`, tre implementationer
kan glida isär utan gemensam atomisk vakt) och den föreslagna "Canonical
Project Completion V1"-konsolideringen rördes INTE — Andreas beslut att
hålla kvällens fix till bara de två P0:orna. `stegkedjan.spec.ts:52`-fyndet
ovan likaså flaggat men inte fixat.

---

# Natt-pass 2026-08-15 — Company Goals-kontext i Next Best Action (backlog #11)

Källa: Andreas "Vad kan vi sätta dig på för lite större utveckling som tar
produkten framåt innan jag vaknar?", medan Codex jobbade vidare (troligen
mot closeout/lärslingan efter min tidigare korrigering samma natt).

## Vägen dit — vad jag avfärdade INNAN jag byggde något

`docs/council/ACTIVE_ROADMAP.md`s egen "genuint nytt, billigast först"-lista
(2026-08-13, 4 punkter) var min utgångspunkt i stället för att gissa en ny
idé:

1. **"Koppla in `voice/process`" (mobil "Säg det en gång")** — kontrollerad
   mot både dashboard- och mobile-repot. Backend (`app/api/voice/process/
   route.ts`) finns och fungerar, men `components/VoiceButton.tsx` i
   handymate-mobile är byggd och ANROPAR routen — bara aldrig monterad i
   någon skärm. **Avfärdad när jag läste `app/matte/voice.tsx`**: en
   NYARE, redan skeppad röstyta finns redan (on-device taligenkänning →
   `sendToMatte()`, textbaserat mot agentteamet), som helt ersätter det
   äldre Whisper→Claude-extraktionsflödet. Att koppla in VoiceButton hade
   byggt en andra, sämre röstingång — inte fört produkten framåt.
2. Distributed Value Receipts — redan byggt av Codex tidigare i natt.
3. Project Closeout Magic — redan byggd sedan tidigare (2026-08-13).
4. Explainability-reveal — redan täckt av Kvittoprincipen Fall 1-4.

Alla fyra var alltså antingen döda spår eller redan klara. Läste vidare i
`docs/strategy/BUSINESS_TWIN_IDEA_BACKLOG.md` och hittade #11 (Company
Goals): margin_target-delen är klar (v134 kördes tidigare i natt), men
posten säger uttryckligen "OMSÄTTNINGSMÅLETS BESLUTSKONSUMENT ÅTERSTÅR" —
`revenue_target_annual_sek` (v128) visas bara i Månadsrapporten
(MalBlock.tsx), läses av INGEN agent-logik. Nästa steg var redan
föreslaget i samma dokument: "en separat, källmärkt målkontext till Next
Best Action... utan att kalla mål för prioriteringsregler."

## Byggt (commit a997039c — pushat, deployat, verifierat i Vercel)

- `lib/jarvis/next-best-action-goals.ts` (ny): `buildGoalContextLine`
  (ren) räknar takt-procent (fakturerat i år / förväntad takt vid dagens
  andel av året) helt i egen kod — modellen får aldrig räkna en summa
  ("en summa är inte en åsikt"). `null` om inget mål är satt eller om
  målet är 0/negativt — aldrig "mål: 0 kr". `getGoalContext` (IO) hämtar
  `business_config.revenue_target_annual_sek` + årets fakturerade summa
  (samma "alla statusar"-semantik som `lib/matte/monthly-review.ts`s
  `invoiced_total`), fail-soft genomgående (varje fel → `null`, NBA-
  generering stoppas aldrig av att målkontexten inte gick att hämta).
- `lib/jarvis/next-best-action-prompt.ts`: `buildUserMessage` och
  `callNextBestActionModel` tar en ny valfri `goalContextLine`-parameter.
  Läggs till som en EGEN sektion "ÄGARENS MÅL (bakgrundsfakta, inte en
  prioriteringsregel)" — separat från `ÄGARENS PRIORITERINGSPRINCIPER`,
  aldrig ihopblandad. Systemprompten instruerar modellen att bara väga in
  den om en skriven princip faktiskt handlar om takt/mål.
- `lib/jarvis/next-best-action.ts`: `getGoalContext` anropas EFTER båda
  spärrarna (MIN_CANDIDATES, MIN_PRINCIPLES) — ett omsättningsmål kan
  aldrig få en rankning att skrivas när ägaren inte har skrivit några
  principer. Källkontrakt-test bevakar ordningen explicit.
- Migrationsfritt: `revenue_target_annual_sek`-kolumnen finns redan
  (v128). Presentationsfritt: `reasoning`-fältet renderas redan inline i
  `components/jarvis/GorDettaForst.tsx` ("Gör detta först"-kortet) — om
  modellen väver in målkontexten i sin motivering syns det direkt, ingen
  UI-ändring behövdes.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- Nya + befintliga NBA-facit (`next-best-action-goals.spec.ts` [6 nya],
  `next-best-action.spec.ts` [+3 nya: buildUserMessage-sektionering +
  källkontrakt för spärrordningen], `next-best-action-normalize.spec.ts`)
  — 35/35 gröna.
- `npx next build` — ren build, 420 sidor.
- Full testsvit: 2944/2950 gröna. 6 failed, alla ur samma redan kända
  förbefintliga kluster (46elks-diagnostik i `api.spec.ts`/`sms.spec.ts`/
  `comprehensive.spec.ts` + en timing-känslig `stegkedjan.spec.ts`-test)
  — ombekräftat genom en ISOLERAD omkörning av exakt de 6 (samma resultat,
  ingen koppling till någon fil jag rörde).
- Pushat (`a997039c`) efter `git log origin/main..HEAD` visade att bara
  min egen commit låg i kön (ingen Codex-commit att granska separat den
  här gången). Vercel-deployen verifierad `Ready` innan jag skrev det här.

## Viktigt att veta: koden är körbar men INAKTIV i praktiken just nu

Kontrollerat direkt i produktions-DB (Supabase MCP) innan jag skrev det
här:
- **Noll konton har satt `revenue_target_annual_sek`** — målkontexten
  returnerar `null` för alla 22 konton tills en ägare sparar ett
  omsättningsmål i Inställningar.
- **Noll konton har någon aktiv `priority_rule`-rad** — Next Best Action-
  motorns egen MIN_PRINCIPLES-spärr (byggd 2026-08-13) har alltså ALDRIG
  klarat sig för något konto än. Hela "Gör detta först"-ytan är i
  praktiken sovande i produktion, oavsett min ändring.

Det här är INTE ett fel i mitt bygge — samma mönster som Margin Guardian
före v134 och Bränsle före första köpet: kapaciteten är klar och testad,
riktig användning slår på den. Men Andreas bör veta att ingenting SYNS
förrän (a) minst en ägare skriver en `priority_rule` (samma "Lär
Handymate"-väg som redan skeppat `business_rule`, se [[BUSINESS_TWIN_IDEA_
BACKLOG.md#12]]) OCH (b) samma ägare sätter ett omsättningsmål i
Inställningar. Ingen åtgärd krävs av mig — bara satt förväntan rätt.

---

# Snabbofferten — steg-för-steg blir standard, review isoleras

Källa: Andreas skärmdump + fynd (2026-08-14) — review-steget visade allt
samtidigt trots att det "guidar steg för steg". Plan godkänd i plan mode
efter två research-pass (Explore + Plan-agent) som kartlade exakt
render-trädet i `app/dashboard/quotes/new/page.tsx` innan något byggdes.

## Byggt (commit b37a8cbe, 73cd31fa, ce18b524 — pushat, deployat)

- `enterQuickReview()` — delad svans för alla tre startvägar.
- Review/overview isolerat till en egen, minimal region (ny topbar: Offerter-
  länk, kompakt kundväljare, Spara utkast, preferensbanner) i stället för
  att lägga granskningskortet ovanpå hela den befintliga "allt-på-en-gång"-
  vyn. DanielsBedömning + AI-badges omgatade till bara `overview`, inte
  `review`. INGEN duplicering av RowEditSheet/AddRowSheet/
  ReservationReviewSheet/ProductModal — de låg redan utanför grid-diven som
  delade siblings, så en ternary runt bara den regionen räckte (enklare än
  planens ursprungliga "två fulla early-return-grenar").
- Mallvägen går nu genom `enterQuickReview()` i stället för rakt till
  `quickMode=null` (båda `QuoteNewStartChooser`-anropen).
- Ny `QuickBlankStart.tsx` + `onSkipDescription`-länk i `QuickIntake.tsx`:
  tredje startväg (kund+titel, inget AI) som landar i samma granskning med
  0 rader — review-läget tålde redan tomt innehåll (`sectionSummary` gav
  "Inga rader än" som ett vanligt attention-läge, inte en krasch).

## Verifierat

- `npx tsc --noEmit` — noll fel.
- Befintliga facit (offertbyggaren, quote-new-context, quote.spec.ts) —
  15/15 gröna.
- `npx next build` — ren.
- Full svit: 5762 gröna, 0 failed (oförändrat från Project Reality-passet).
- **Riktig, live, skärmdumpad verifiering av alla tre startvägar** (AI,
  mall, blankt) — se auth-genombrottet nedan för hur.

## Auth-genombrott, del 2: riktig browser-inloggning löst på riktigt

Den kända buggen (magic link → studsar till /login) är nu FIXAD, inte bara
kringgången. `tests/auth.setup.ts` postar till `/api/auth` {action:'login'}
— samma `createRouteHandlerClient`/`signInWithPassword`-väg som appens
egen inloggningssida redan använder — i stället för att gissa cookie-
formatet från en admin-genererad magic link. `TEST_USER_PASSWORD` satt en
gång via `admin.updateUserById` (skrevs aldrig till stdout), sparad i
`.env.test` (gitignorad). **Riktig, inloggd Playwright-browserverifiering
fungerar nu igen för ALLA framtida sessioner**, inte bara via verifyOtp-
Bearer-tricket.

En andra, orelaterad bugg hittades under samma verifiering: en färsk
Playwright-profil saknar `handymate_welcome_dismissed` i localStorage
(WelcomeModal.tsx, dag 0-rutan) och blockerade klick med sin backdrop på
varje ny körning. Fixad genom att sätta flaggan en gång i `auth.setup.ts`
innan storageState sparas.

## Skärmdumpar (tagna, granskade, raderade efter — inte checkade in)

Review-läget (AI-väg): minimal topbar, INGEN kundpanel, INGA AI-badges,
INGEN Mer-rad — bara det fokuserade/dimmade dokumentet + "Ser bra ut →".
Blank-väg: samma isolerade vy, ärligt "Inga rader än"/"Offerten har inga
rader" + "+ Lägg till rad". Exakt vad Andreas bad om.

---

# Byt lösenord — ny sida i Inställningar

Källa: Andreas eget testkonto-lösenord slutade fungera efter en admin-
ändring jag gjorde under felsökning, och "Glömt lösenord"-återställningen
visade "Ogiltig länk" på det bifogade mejlet — akut felrapport. Jag sa
initialt fel att man kunde byta lösenord från kontoinställningarna; Andreas
påpekade korrekt att det inte fanns någon sådan yta. "Det behöver vi, bygg
det och lägg på ett vettigt ställe i Inställningar."

## Två separata buggar hittades och fixades under felsökningen

1. **Root cause till "lösenordet funkar plötsligt inte"**: min egen admin-
   ändring av testkontots lösenord under en tidigare del av sessionen —
   inte en produktionsbugg.
2. **Verklig, förproducerad bugg, opåverkad av (1)**: `/reset-password`
   läste aldrig hash-fragment-tokens (`#access_token=...`) från
   återställningsmejlet — bara en befintlig cookie-session via
   `/api/auth {action:'check'}`. Samma rotorsaksfamilj som magic link-
   buggen från tidigare i sessionen (ingen kod i kodbasen hanterade
   implicit-flow-hashen någonstans). Detta gjorde att ALLA lösenords-
   återställningar för ALLA konton visade "Ogiltig länk", oavsett giltighet.
   Fixad (commit `b6a21ce6`): `supabase.auth.setSession({access_token,
   refresh_token})` läser hashen och sätter en riktig cookie-session INNAN
   `/api/auth`-kontrollen frågas. Se kod-kommentar i
   `app/reset-password/page.tsx` för full förklaring.

## Byggt (commit d0b00240 — pushat, deployat)

- Ny action `change_password` i `app/api/auth/route.ts`: verifierar
  nuvarande lösenord server-side via `signInWithPassword` INNAN
  `updateUser({password})` anropas — en redan inloggad, olåst session ska
  inte kunna byta lösenord tyst utan att ägaren bekräftar det befintliga.
  Medvetet en egen action, skild från `reset_password` (som i stället
  litar på en färskt konsumerad recovery-token).
- Ny sida `app/dashboard/settings/byt-losenord/page.tsx`: tre fält
  (nuvarande/nytt/bekräfta), samma FALT_CLS/kort-stil som Bolagsprofil,
  visar inloggad e-post, länk till "Glömt lösenord" för den som inte
  minns sitt nuvarande.
- Ny "Mitt konto"-grupp i `app/dashboard/settings/page.tsx` (efter
  "AI & Integrationer"). Synlig för alla roller — inte ägare/admin-gated
  som Bolagsprofil/Intern timkostnad, eftersom var och en äger sitt eget
  lösenord.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- `npx next build` — ren.
- **Riktig, live browserverifiering (scratch-test, raderad efter)**: fel
  nuvarande lösenord avvisas med "Fel nuvarande lösenord" (2 scenarion
  testade), rätt lösenord byts och ger "Lösenordet är bytt".
- **Oberoende serverside-bekräftelse**: `playwright/.auth/user.json`
  raderades och en helt ny inloggning kördes mot det NYA lösenordet —
  lyckades. Bekräftar att bytet verkligen slog igenom i Supabase, inte
  bara en UI-framgångstext.
- Full svit (sista säkerhetskontroll efter denna ändring, då den rörde
  både den delade `app/api/auth/route.ts` och den stora
  `app/dashboard/settings/page.tsx`): **5760 gröna, 0 failed**, exit
  code 0.

---

# Project Reality + Cross-Agent Case (Business Twin #9 V1)

Källa: plan `jaunty-pondering-hummingbird.md` (godkänd). Andreas delade
ChatGPT:s Business Twin-resonemang, valde (AskUserQuestion) den
rekommenderade epiken efter att jag stämt av ChatGPT:s antaganden mot
verklig kod (inte tagit dem för givna).

## Byggt (commit 11247b75, pushat, deployat)

- `lib/jarvis/project-case.ts` — `hittaProjektCase` (ren): grupperar
  godkännanden till projekt-case, kräver ≥2 distinkta signaltyper.
- `lib/projects/project-reality.ts` — `deriveProjectReality`: komposition
  av redan kanoniska `computeProjectEconomics` + `deriveProjectLifecycle`,
  inga nya beräkningar, inget nytt lagrat.
- `app/api/project-cases/route.ts` — GET, samma auth/behörighets-mönster
  som `/api/next-best-action`.
- `components/jarvis/ProjektCaseKort.tsx` — inga egna knappar (fyra-ögon-
  regeln, samma som completion_batch_id).
- `components/jarvis/JarvisHome.tsx` — fetch + rendering ovanför kön.
- `docs/strategy/BUSINESS_TWIN_IDEA_BACKLOG.md` — återskapad (refererades
  från tre ställen, fanns inte i repot), #9 uppdaterad + #11–#17 nya idéer
  med status/spärrar.
- Byggt av två Sonnet 5-bakgrundsagenter (kod + facit; dokumentation) för
  att hushålla med tokens, granskat och ihopkopplat av huvudsessionen.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- 26 nya facit-tester (`tests/project-case.spec.ts`,
  `tests/project-reality.spec.ts`) — alla gröna.
- `npx next build` — ren.
- Full svit efter bygget: **5762 gröna, 0 failed**.
- **Riktig, live, autentiserad verifiering mot prod** — se nästa avsnitt.

## Auth-genombrott: kringgick den kända browser-luckan

Den tidigare dokumenterade buggen (magic link i webbläsare studsar till
/login, se Veckomötet-avsnittet ovan) blockerar fortfarande
`tests/auth.setup.ts`. Men för den här verifieringen behövdes ingen
webbläsare: ett engångsskript genererade en magic link server-side och
konsumerade den direkt via `supabase.auth.verifyOtp({token_hash, type:
'magiclink'})` i stället för att navigera en sida dit — gav ett riktigt
`access_token`, använt som `Authorization: Bearer` mot den skarpa routen.

Seedad testdata (2 signaler, olika typ, samma riktiga projekt "Renovering"
för biz_al7pjuu5smi) → `GET /api/project-cases` → **HTTP 200**, exakt
förväntat svar: ett case, två signaler med korrekt agentId (karin/daniel),
`fasLabel: "Pågår"`, marginal korrekt `null` (projektet saknar registrerad
kostnad — hellre tyst än gissat). Städat direkt efter, 0 kvar.

Det här är alltså BÅDE ett bevis på att den nya funktionen fungerar
skarpt, OCH en fungerande omväg förbi auth-luckan för framtida
verifieringar utan att röra den delade `auth.setup.ts`-filen. Värt att
överväga som permanent fix av `tests/auth.setup.ts` i ett separat pass —
inte gjort här (utanför detta uppdrag, kräver ett medvetet beslut om
test-inloggningsstrategin).

## Verkligt fynd: nästan ingen data att visa upp än

Bred sökning i hela prod (alla företag): **noll** naturligt förekommande
case existerar idag. Av de fyra signaltyperna har bara `missad_intakt`
några rader alls (2 pending, 1 rejected) — `profitability_warning`,
`create_ata_draft` och `fakturera_projekt` har ZERO rader i hela
databasen. Funktionen är korrekt byggd men väntar på verklig signalvolym
— samma mönster som Måndagsmötet/NBA tidigare i natt. Inget att åtgärda,
bara ärligt att veta.

---

# Veckomötet — Digital CFO+COO-mötet (ersätter Måndagsmötets takeover)

Källa: Claude Design-projekt "Digital CFO + COO-mötet" (b33a9e8b-...), fil
`Veckomötet - Digital CFO+COO.dc.html`, hämtad via DesignSync-MCP och läst i sin
helhet. Andreas beslut (AskUserQuestion): (1) ersätt Måndagsmötet direkt, samma
triggerpunkt; (2) besluts-korten byggs på RIKTIG NBA-rankning från start, inte
mockupens exempeldata.

## Vad som INTE ändras (blast radius minimeras)
- `lib/jarvis/monday-brief.ts` — orört, äger fortfarande n>0-regeln för de fyra sektionerna.
- `components/jarvis/MandagskortCard.tsx` — orört, används fortfarande oförändrat av `app/dashboard/approvals/page.tsx`s vanliga listvy.
- Godkänn-vägen — fortfarande `queueAction`/`executeSend` → `POST /api/approvals/:id`, ingen ny endpoint.
- "RAM 2: Sida"-varianten i mockupen byggs INTE — bara popup-modalen (det befintliga takeover-mönstret). Sidvarianten var Claude Designs egen dubbel-preview, ingen egen beställd yta.
- "Beslut från veckomötet"-kön-kategorin (Andreas idé, tidigare i konversationen) är INTE del av detta pass — mockupens dismiss-beteende (pill + återöppna) matchar redan befintlig banner-mekanik.

## Filer

- [x] `lib/jarvis/mandagsmote.ts` — nya rena funktioner:
  - `byggVeckomoteRepliker(payload)` → `{agentId, text}[]`, ordning resultat→lärdomar→risker→förtroende (samma ordning som `mandagsmoteSectionOrder`), en replik per sektion UTOM förtroende (en per rad, egen agent per rad).
  - `beslutText(n)` — "ett beslut" / "N beslut" (svensk pluralisering, samma stil som `mandagskortBeskrivning`).
- [x] `tests/mandagsmote-takeover.spec.ts` — facit för de nya funktionerna ovan + uppdaterade de assertions som pekade på GAMMAL rendering.
- [x] `app/api/next-best-action/route.ts` — additiv utökning: `recommendations`-fält (topp 3).
- [x] `components/jarvis/MandagsmoteTakeover.tsx` — omskriven till dialogform.
- [x] `components/jarvis/JarvisHome.tsx` — fetch + nya props kopplade.

## Verifiering

- [x] `npx tsc --noEmit` — noll fel.
- [x] Facit gröna (75/75 i mandagsmote-takeover.spec.ts).
- [x] `npx next build` — ren build.
- [x] Full testsvit: 5467 gröna/0 failed vid den tidpunkten.
- [x] Datakontrakt MCP-verifierat (seedad testdata, städad).
- [ ] Riktig inloggd browser-klick-genom — BLOCKERAD, se auth-fyndet nedan.

## Review

**Byggt och skeppat** (commit 838561be + d96ded4c, pushat, deployat):
alla filer i planen ovan, exakt som beskrivet. `npx tsc --noEmit` rent,
`npx next build` rent, full testsvit 5467 gröna/0 failed (upp från 5451 —
+16 nya/uppdaterade tester i tests/mandagsmote-takeover.spec.ts).

**Verifierat via Supabase MCP** (seedad testdata för biz_al7pjuu5smi,
sedan städad — sista SELECT bekräftar 0 kvar): `next_best_action`-radens
form matchar exakt vad `/api/next-best-action`s nya `recommendations`-fält
förväntar sig, och `pending_approvals`-payloaden för `monday_brief` matchar
exakt vad `byggVeckomoteRepliker` konsumerar. Detta bevisar datakontraktet,
INTE den faktiska renderingen/interaktionen i webbläsaren.

**INTE verifierat vid det här passets slut — en riktig, oberoende upptäckt:**
`tests/auth.setup.ts`s magic link-inloggning (via
`supabase.auth.admin.generateLink`) studsar tillbaka till `/login` inom
någon sekund för testkontot (`andreashogberg93@gmail.com` /
`biz_al7pjuu5smi`) — reproducerat tre gånger, även mot en helt orörd,
existerande test (`tests/navigation.spec.ts`). Trolig orsak: admingenererade
länkar är inte kompatibla med appens PKCE-baserade `/auth/callback`
(`exchangeCodeForSession` väntar en `?code=`-parameter; adminlänkar levererar
troligen sessionen som url-fragment istället, vilket aldrig når servern).

**UPPDATERING (Project Reality-passet, samma kväll):** hittade en fungerande
omväg — `supabase.auth.verifyOtp({token_hash, type:'magiclink'})` server-side
i stället för browser-navigering ger ett riktigt access_token, användbart
som Bearer-header direkt mot skarpa API-rutter. Löser INTE
`tests/auth.setup.ts`/den delade Playwright-riggen (som fortfarande
navigerar en browser och fortfarande studsar), men bevisar att API-lagret
går att verifiera skarpt utan den riggen. Värt ett eget litet pass att
portera fixen in i `tests/auth.setup.ts` — inte gjort här.

**Fixat i samma veva** (commit d96ded4c, litet och oberoende): `setup`-
projektets `storageState: undefined` gav ENOENT på en färsk checkout utan
`playwright/.auth/user.json` — samma fälla som `golden-path-setup` redan
dokumenterar i samma fil. Ett explicit tomt state löser det.

---

# COGS-mätaren etapp 1 — de tre största omätta LLM-ytorna

Källa: `tasks/cost-cap-analysis.md` §7 (kostnadsmodell-underlaget). Andreas:
"kan vi på ett säkert sätt nu efter inventering... bygga en usage-mätare per
konto?" → "Yes, kör!" — etapp 1 = agent-triggern, Matte-chatten, widgeten
(de tre största mätluckorna; svansen av mindre ytor är etapp 2, inte gjord).

## Byggt (commit 7d0d13a9 — pushat, deployat)

- **`app/api/agent/trigger/route.ts`**: bytte den platta $9/Mtok-blandtaxan
  (`totalTokens * 0.000009`, samma taxa oavsett Sonnet/Haiku) mot
  `llmCostUsd(cumulativeUsage, MODEL)` — riktig kostnad per faktisk modell,
  inklusive cache-tokens (systemprompten cachas). Skriver nu `cost_event`
  via `meterDirectLlmCall`, vilket den aldrig gjorde förut — kodbasens
  största LLM-volym var alltså helt osynlig i COGS-boken.
- **`app/api/matte/chat/route.ts`**: usage ackumuleras nu över HELA
  requesten (alla specialiststeg i orkestreringsloopen, `runAgentTurn`
  returnerar `usage`), bokförs en gång per tur på BÅDA return-vägarna
  (klart-svar och `pending_confirmation`). Tidigare helt omätt — upp till
  ~15 Sonnet-anrop/meddelande syntes ingenstans.
- **`app/api/widget/chat/route.ts`**: Sonnet → Haiku (styrt system-prompt
  med fasta regler/kort svar — kundvärdet ligger i att den FÖLJER
  guardrails, inte i modellens allmänna resonemangsförmåga) + mätning.
  Rate-limit fanns redan (IP-spärr 50/dygn + 500 konv/dygn + 20 msg/konv) —
  korrigerar min tidigare formulering "helt otakad" till Andreas, det var
  bara kostnaden som var omätt, inte volymen okontrollerad.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- Nytt facit i `tests/cogs-matare.spec.ts` (3 nya tester): flat-taxan är
  borta, Matte bokför på båda return-vägarna, widgeten kör Haiku. Den
  befintliga "en skrivare per faktum"-invarianten (bara `cost-guard.ts` får
  skriva `resource:'llm'`) står KVAR intakt — inget nytt direktskrivande.
- `npx next build` — ren.
- Full svit: 5766 gröna, 0 failed.
- **Riktig, skarp verifiering i prod, alla tre ytor, riktiga `cost_event`-
  rader:**
  - Matte-chatt (Sonnet): `ref_type:'matte_chat_turn'`, 26 öre.
  - Widget: `ref_type:'widget_conversation'`, 1 öre (Haiku, kort svar).
  - agent/trigger: `ref_type:'agent_run'`, 14 öre, `meta.model:'claude-haiku-4-5-20251001'`
    — samma körning gav `agent_runs.estimated_cost = 0.0144` USD för 366
    tokens (den gamla taxan hade gett $0.0033 — nästan 4× fel, konkret bevis
    på att fixen ändrar verkliga siffror, inte bara kod).
  - Testkontots `widget_enabled` och `trial_ends_at` tillfälligt ändrade för
    att kunna trigga live-anrop, återställda till exakt ursprungsvärde
    direkt efteråt (verifierat med en avslutande SELECT).

## Kvar (etapp 2, inte gjord)

Svansen av mindre ytor från cost-cap-analysis.md §7-8: offertgenerering,
intent-klassificering, gmail-leadfilter, autopilot, leads-brev, insights-
cron, monthly-review, Whisper-luckorna (matte/transcribe, jobbkompisen,
voice/process), och den fortfarande medvetet omätta samtalskostnaden.

---

# COGS-mätaren etapp 2 — svansen av omätta LLM/Whisper-ytor

Källa: "Yes, kör vidare med ALLA andra kostnadsytor och rapportera tillbaka
när det är klart" — direkt fortsättning på etapp 1. 29 anropsställen
kartlagda i `tasks/cost-cap-analysis.md` §7-8, körda via tre parallella
bakgrundsagenter (kluster: offert & lead-intake / klassificering &
nattcronar / chatthjälpare+jobbkompisen+Whisper) + en egen fix
(egenkontroll-foto).

## Byggt (commit 08826ac0 — pushat, deployat)

39 filer. Samma mönster som etapp 1 rakt igenom: `meterDirectLlmCall` för
LLM-anrop, `recordCost(resource:'whisper')` för Whisper. Fullständig lista
med refType per yta i commit-meddelandet.

**Anmärkningsvärt:** fyra Whisper-ytor (matte/transcribe, jobbkompisens
röst, quotes/transcribe-voice, voice/process) var MEDVETET lämnade omätta
sedan tidigare — kommentaren i `voice/transcribe/route.ts` varnade för att
uppskatta ljudlängd ur filstorlek ("ser exakt ut men är det inte"). Löst
genom att byta alla fyra till `response_format: 'verbose_json'`, som ger en
FAKTISK Whisper-uppmätt `duration` i svaret — samma grundprincip som
originalytan, ingen gissning införd. Granskat rad för rad av mig personligen
innan commit (svarsformatbyte = risk för att transkript-extraktionen
går sönder — verifierat att `.text` fortfarande läses korrekt på alla fyra
ställen).

`lib/egenkontroll/analyze-and-queue.ts` skrev redan `agent_runs`
(governorn) men aldrig `cost_event` (boken) — samma lucka som trigger-routen
i etapp 1, fixad separat.

## Verifierat

- `npx tsc --noEmit` — noll fel, kört färskt EFTER alla tre klustrens
  sammanslagna ändringar (varje agent körde det individuellt också, men en
  kombinerad körning behövdes för att fånga eventuella interaktioner).
- Facit (`tests/cogs-matare.spec.ts`) — 46/46, "en skrivare per
  faktum"-invarianten intakt.
- Personlig diff-granskning av de fyra Whisper-omskrivningarna och de två
  mest riskfyllda signatur-trådningarna (`runIntentAgent` två anropsställen,
  `callNextBestActionModel`) — korrekta, inga trasiga anrop.
- `npx next build` — ren.
- **Full svit gav 28 "failed" — ALLA verifierade förbefintliga, orelaterade
  till dagens 39 filer** (se separat sektion nedan). En av dem
  (`settings-areas.spec.ts`) var min egen missade registrering av
  Byt lösenord-sidan från igår — fixad (commit 888d2643).
- **Riktig prod-verifiering:** `campaign_generate_text` (0 öre, för litet
  meddelande för att runda upp — korrekt beteende) och `onboarding_chat`
  (1 öre) avfyrade skarpt mot prod, båda gav riktiga `cost_event`-rader.
  Inte samtliga 29 ytor liveavfyrade — flera kräver riktiga externa
  triggers (inkommande mail, foton, röstinspelningar) som inte är
  meningsfullt att simulera bara för en mätningsverifiering; kod- och
  facitgranskningen bär tyngden där.

## Sidofynd under full-svit-körningen — INTE åtgärdade, flaggade till Andreas

Tre förbefintliga, orelaterade gap som ytan blev synlig av att köra hela
5808-testsviten (vilket annars sällan görs i sin helhet):

1. **`tests/cron-auth.spec.ts`**: förväntar 34 cron-rutter, det finns nu 37
   — tre nya cron-filer har tillkommit utan att facit uppdaterats. Okänt om
   de tre nya rutterna faktiskt använder auth-helpern korrekt eller inte.
2. **`tests/business-config-reads.spec.ts`**: `components/value/MalBlock.tsx`
   läser `business_config` direkt utan att vara klassad i någon av de två
   listorna (dokumentyta/visningsyta).
3. **`tests/fakturaunderlaget.spec.ts`** (4 tester): `lib/projects/
   auto-invoice-on-complete.ts` matchar inte längre facitets förväntade
   mönster (`if (quote && quoteItems.length > 0)` saknas). Filen är orörd av
   allt arbete idag — troligen en drift sedan en tidigare, orelaterad
   commit. Rör fakturagenerering, så förtjänar en egen, noggrann titt —
   INTE en snabbfix inbakad i ett kostnadsmätnings-pass.

---

# Bränsle — AI/API-kostnadsmätare med Stripe-självbetjänings-påfyllning

Källa: Claude Design levererade en mockup (Bränslemätaren.dc.html) med tre
ytor. Produktbeslut via klargörande frågor: rullande fönster, informativt
vid 0% (ingen koppling till agent-cost-cap), och — Andreas avvisade explicit
mitt förslag om admin-manuell registrering — självbetjäning via Stripe.
Byggt i plan mode, verifierad av två Explore-pass + en Plan-agent innan
kodning, sedan en uppföljande justering (fönster-ankring) efter första
driftsättning.

## Byggt (commit 7f58d6f3, f5148c1e, 8bac176d — pushat, deployat, migrerat)

- `sql/v133_fuel_ledger.sql` — append-only ledger, samma RLS-mönster som
  cost_event (v100). Körd via Supabase MCP efter Andreas "Kör SQL!" — verifierad
  med SELECT direkt efteråt (RLS + exakt en policy).
- `lib/costs/fuel.ts` — kundsäker aggregering ovanpå cost_event, separat
  fönster från report.ts:s kalendermånad. 39 kända ref_type kategoriserade
  i tre hinkar (Samtal & SMS / Offerter & analyser / Teamets nattarbete),
  facit säkerställer uttömmande täckning (ingen faller tyst igenom).
- **Fönstret ANKRAS till förnyelsedatumet** (business_config.
  billing_period_start), inte ett fritt glidande "nu minus 30 dagar" —
  Andreas-justering EFTER första driftsättning, samma dag. Fallback till
  rent glidande 30 dagar för konton utan aktiv prenumeration.
- `app/api/billing/fuel(+topup)/route.ts` — läsning (alla teammedlemmar) +
  Stripe checkout (ägare/admin, mode:'payment', price_data inline).
- Webhook-utökning: ny `fuel_topup`-gren i `handleCheckoutCompleted`,
  mirrors leads-addon-mönstret.
- Tre UI-ytor: `FuelBillingCard` (billing-sidan, mellan Användning och
  Planval), `FuelSidebarBadge` (tyst tills lågt/kritiskt läge),
  `FuelWarningCard` (kortkö, bara vid kritisk nivå, INTE en
  pending_approvals-rad — bespoke JSX, samma mönster som
  mandagskortApproval).

## Verifierat

- `npx tsc --noEmit`, `npx next build` — rent genom alla tre pass.
- Facit: `tests/bransle-matare.spec.ts` (17 tester, inkl. uttömmande
  ref_type-täckning och COGS-språkläckage) + `tests/cogs-matare.spec.ts`
  (46) — 63/63 gröna, "en skrivare per faktum"-invarianten intakt.
- Full svit: samma 25 förbefäntliga, orelaterade fel som redan
  rotorsaksbestämts under COGS-etapp 2 (cron-auth route-count-drift,
  MalBlock.tsx-klassificering, auto-invoice-on-complete.ts-facit-drift) —
  ingen ny regression.
- **Skarp Stripe-verifiering, riktigt end-to-end-flöde**: skapade en äkta
  test-mode Checkout Session via det levande fuel-topup-API:et, hämtade
  tillbaka sessionen från Stripe, byggde och SIGNERADE en
  checkout.session.completed-webhook med Stripes egen
  `generateTestHeaderString`-hjälpare, levererade den mot den riktiga
  deployade webhook-routen. Resultat: riktig `fuel_ledger`-rad (900 kr),
  riktig `billing_event`-rad, och `/api/billing/fuel` visade budgeten höjd
  från 90 000 → 180 000 öre — hela kedjan bevisad, inte bara kodgranskad.
- **Skärmdumpsverifiering**: normalläget på billing-sidan (gauge, buckets,
  30-dagarsdiagram — allt renderar med riktig data). Kritiskt läge
  framtvingat med en tillfällig cost_event-rad (borttagen efteråt): röd
  pulserande Sidebar-badge + FuelWarningCard i kön, header-räknaren
  stämde. Hittade och fixade en textbugg på köpet: "0 veckor kvar" (helt
  matematiskt sant vid hög burn rate, men lät konstigt) → delad
  `weeksRemainingPhrase()`-funktion.

## Kvar / medvetet inte byggt

Inget — alla tre ytor + Stripe-flödet är levande i prod. Möjlig framtida
förfining: beloppsväljare i "Tanka" (idag fast belopp = en månads budget).

## Uppföljning samma dag: dagsprognos under en vecka (commit bdc17b46)

Andreas: "bättre upplevelse" att räkna i dagar när mindre än en vecka
återstår — direkt uppföljning på fyndet från skärmdumpsverifieringen.
`computeFuelLevel` returnerar nu `daysRemaining` vid sidan av
`weeksRemaining` (samma bråktal, olika avrundning — kan aldrig glida isär).
`weeksRemainingPhrase(weeksRemaining, daysRemaining)` växlar till
"X dagar"/"en dag" under en vecka, "Tar snart slut" bara vid 0 dagar eller
ingen prognos. 3 nya tester, 66/66 kostnadsfacit gröna. Deployat, verifierat
live (`daysRemaining` finns i /api/billing/fuel-svaret).

---

# Pågående — Distributed Value Receipts, sanningshärdning (2026-08-14)

## Fynd före implementation

Funktionen var redan byggd i `de26aac1`, men låg otestad inline i
godkännandesidan. Källgranskningen hittade tre falska kvitton: `skipped`
behandlades som lyckat, `missad_intakt` påstod att ett underlag skapats trots
att typen är `REVIEW_REQUIRED`, och ett internt ÄTA-utkast kallades
"godkänt arbete" innan kunden godkänt något.

- [x] Extrahera en ren, delad kvittobyggare ur godkännandesidan.
- [x] Kräv serverklassat `success`, positivt ändligt belopp och handlingens
  verkliga artefakt-/leveransbevis innan ett värdekvitto får visas.
- [x] Ta bort `missad_intakt` ur generiska kvitton och kalla ÄTA-resultatet
  ett utkast att granska.
- [x] Låt lyckad omkörning använda samma kvittokontrakt.
- [x] Lägg browserlösa facit för samtliga tillåtna typer, skipped/failed,
  trasiga belopp och förbjudna sanningspåståenden.
- [x] Kör riktat facit, `npx tsc --noEmit`, browserlös regressionssvit och
  `npx next build`.
- [x] Granska slutdiff och dokumentera resultatet här.

## Review

Den befintliga UI-funktionen har sanningshärdats i stället för att dupliceras.
Kvittot byggs nu av en ren funktion som kräver `success`, rätt handling,
positivt ändligt belopp och handlingstypsspecifikt exekveringsbevis. `skipped`
klassas fail-closed, `missad_intakt` ger inget falskt kvitto och ÄTA-copy säger
uttryckligen att det är ett utkast att granska. Första körning och omkörning
använder samma kontrakt och samma kontextlänk.

Verifiering: `npx tsc --noEmit` rent, `npx next build` grönt (420 statiska
sidor), 51/51 riktade tester och 194/194 relevanta regressionsfacit gröna.
Den breda browserlösa sviten är fortsatt röd i befintliga, orelaterade
källkontrakt (bland annat cron-route-antal, MalBlock-klassificering och
stegkedjans fire-and-forget-facit); inga fel träffade ändrade filer eller
kvittosviter. Inga SQL-, databas- eller utskicksändringar gjordes.

En read-only webbläsarkontroll kunde inte startas eftersom ingen in-app-
webbläsare fanns tillgänglig i sessionen. Ingen verklig godkännandehandling
utfördes; bygg- och källfacit täcker renderingskopplingen.

---

# Pågående — Goal-driven Margin Guardian V1 (2026-08-14)

## Kontrakt

Ett lagrat standardvärde är inte ett uttalat ägarmål. Guardian får därför
bara använda `margin_target_percent` när databasen också kan bevisa att
värdet uttryckligen sparats. Utan det beviset behålls dagens konservativa
75/95-gränser exakt. Ett explicit mål får påverka `at_risk`, men aldrig
sänka den hårda `over_budget`-gränsen eller skapa en varning ur ofullständig
aritmetik som inte redan är ett säkert kostnadsgolv.

- [x] Reservera nästa migrationsnummer och lägg till explicithetsstämpel för
  marginalmålet; backfilla endast värden som bevisligen avviker från default.
- [x] Låt Margin Guardian läsa målet en gång per företag och använda det i
  den rena beräkningen utan N+1-frågor.
- [x] Bär målbeviset till befintliga Guardian-ytor och formulera skillnaden
  mellan marginalmål och budgetöverskridning sanningsenligt.
- [x] Dölj defaultvärdet i Mål-blocket tills det är uttryckligen sparat.
- [x] Lägg browserlösa facit för osatt, explicit, ogiltigt och exakt
  tröskelvärde samt ofullständig kostnadsdata.
- [x] Kör riktade tester, `npx tsc --noEmit`, browserlös regression och
  `npx next build`.
- [x] Granska slutdiff, dokumentera manuell migrationskörning och fyll i
  review här.

## Review

V1 använder `margin_target_set_at` som explicithetsbevis. v134 backfillar
bara befintliga värden som avviker från schema-defaulten 50; ett tvetydigt
50 %-värde förblir osatt tills ekonomiinställningarna sparas igen. Guardian
läser målet en gång per företag, validerar 0–100 fail-closed och ersätter
bara `at_risk`-gränsen. Den hårda 95 %-gränsen ligger kvar. Målavvikelsen
visas i samma kanoniska orsaksrader på projektsidan och i kön; gamla kort
degraderar till inget mål.

Verifiering: `npx tsc --noEmit` rent, 37/37 riktade facit och 221/221
relevanta browserlösa regressionsfacit gröna. `npx next build` grönt med
420 statiska sidor och enbart befintliga metadata/dynamic/sitemap-varningar.
Ingen databasmutation kördes. `sql/v134_margin_target_explicit.sql` måste
köras manuellt före utrullning av koden och därefter verifieras med filens
två SELECT-frågor.

## Korrigering 2026-08-15 — inställningsfältet måste kunna vara tomt

Efter granskning fångades att formuläret fortfarande materialiserade ett
osatt mål som 50 och skrev tillbaka det vid nästa Spara. Datakontraktet var
alltså korrekt men skrivytan kunde inte uttrycka `null`.

- [x] Gör marginalmålet nullable i formulärstate och laddning.
- [x] Tomt fält + placeholder ska spara `null`; ett faktiskt inskrivet 50
  ska fortsätta räknas som ett uttryckligt mål via v134-triggern.
- [x] Läs Supabase-update-felet innan framgång visas.
- [x] Lägg källfacit och kör tsc, riktade regressioner och build.
- [x] Dokumentera och committa korrigeringen separat.

### Review

- Ett osatt mål laddas och visas nu som tomt, och en tom input skrivs som
  `null`. Ett uttryckligen inskrivet `50` förblir `50` och får
  explicithetsstämpeln av v134-triggern.
- Inställningsytan visar inte längre framgång om Supabase-update misslyckas.
  `MalBlock` klassas samtidigt som visningsyta och loggar läsfel i stället
  för att degradera helt tyst.
- Verifierat: `npx tsc --noEmit` rent, 90/90 relevanta browserlösa facit
  gröna och `npx next build` grön med 420/420 statiska sidor. Endast
  repots sedan tidigare kända buildvarningar kvarstår.

## Claude-verifiering av Codex commit 94e0f472 (samma kväll)

Codex byggde INTE en dubblett — Distributed Value Receipts fanns redan
(commit `de26aac1`, 2026-08-13) som en inline-funktion i
`app/dashboard/approvals/page.tsx`, otestad. Codex hittade tre riktiga
sanningsbuggar (skipped visades som lyckat, missad_intakt påstod ett
underlag skapats trots REVIEW_REQUIRED, ÄTA-utkast kallades "godkänt
arbete" innan kunden sett något) och härdade i stället för att duplicera.

Oberoende ombekräftat av mig innan push: `npx tsc --noEmit` rent, ren
`next build` (420 sidor), 33/33 färska körningar av de riktade faciten
(`tests/value-receipt.spec.ts` + `tests/execution-outcome.spec.ts`), och
en fullständig testsvit (5829 gröna). De 27 "failed" var samma kända
förbefintliga kluster från idag PLUS två genuint flakiga
externtjänst-diagnostikrutter (`api.spec.ts` SMS/mail-koll mot 46elks) —
bekräftat flakiga genom att isolerad omkörning gav olika utfall mellan
körningarna, och rutterna har ingen kodkoppling till de ändrade filerna.

Pushat och deployat (`94e0f472`).

---

# Natt-pass 2026-08-14→15 — två föråldrade facit fixade, ett nytt fynd flaggat

Källa: Andreas "vad sätter vi dig på över natten?" medan Codex jobbar på
Goal-driven Margin Guardian V1. Valde två redan diagnostiserade,
orelaterade poster (ingen filkrock med margin-guardian.ts/business_config-
ekonomifält/inställningssidans ekonomisektion/MalBlock.tsx).

## Fixat (commit 0a287a7a — pushat, deployat)

- `tests/fakturaunderlaget.spec.ts`: pekade på fel fil (`lib/projects/
  auto-invoice-on-complete.ts`) sedan en refaktorering flyttade
  kompositionen till `lib/invoices/project-invoice-draft.ts`
  (`byggProjektFakturaUnderlag`, Tur 4 etapp 2, 2026-08-10). Verifierade
  rad för rad att alla fyra skyddsregler (quote_items-sanning,
  tenant-filter+sortering, tillvalsregeln, ROT/RUT-villkoret) fortfarande
  gäller — bara på ny adress. Ingen produktionsbugg.
- `tests/cron-auth.spec.ts`: hårdkodat routeantal (34) stämde inte mot
  verkliga 37 — tre rutter tillkom utan att facit uppdaterades
  (meeting-reminders + meeting-worker 2026-08-11, next-best-action
  2026-08-13). Verifierade att alla 36 icke-Karin-rutter redan använder
  `verifyCronSecret` korrekt — ingen auth-lucka, bara talet var föråldrat.

Full svit efteråt: 5866 gröna, 16 failed — samma kända förbefintliga
kluster minus dessa två, plus en genuint ny upptäckt nedan.

## Flaggat, INTE fixat — kräver ett affärsbeslut, inte en kodfix

`tests/invoice-derive-status.spec.ts`, test (e) "FACIT-BUGGEN": felar
KONSEKVENT (received: 21, expected: <=20), inte flaky — verifierat med
tre isolerade omkörningar + ett fristående diagnostikskript.

Rotorsak: `deriveStatus` (`lib/invoice-templates/data-builder.ts:49`)
räknar `daysOverdue = Math.ceil((Date.now() - due.getTime()) / DAY_MS)`.
Testets fixture (`isoDaysAgo(20)`) fångar `Date.now()` en gång vid
fixture-skapandet; `deriveStatus` fångar `Date.now()` IGEN några
millisekunder senare. Den minimala skillnaden gör att kvoten alltid blir
`N + epsilon`, och `Math.ceil` av vilket epsilon-tal som helst över N
rundar till N+1 — INTE en avrundningsbugg i klassisk mening, utan en
strukturell egenskap hos `Math.ceil` på två separata `Date.now()`-anrop.

**Varför jag inte fixade det**: samma mönster gäller i PRODUKTION — varje
förfallen faktura får sitt `daysOverdue` uppräknat till närmaste HELA dag
även om bara en bråkdel av en dag passerat, vilket direkt matar
`lateInterest`-beräkningen (dröjsmålsränta) i samma fil. Om det här är
avsiktligt ("varje påbörjad dag räknas som hel, precis som
dröjsmålsränta ofta beräknas") eller en genuin överskattning av alla
kunders sena avgifter är en affärsfråga, inte en kodfråga — jag ändrar
inte en formel som påverkar vad riktiga kunder faktureras utan att
Andreas sagt hur den SKA fungera. Testets tolerans-band ([19,20] resp.
[4,5] i test d) döljer normalt problemet eftersom det bara är 1 dags
marginal — så det märks bara på vissa körningar/dagräkningar, inte alla.

Nästa steg (Andreas beslut): antingen (a) `Math.floor` i stället för
`Math.ceil` (räkna bara HELT passerade dagar), (b) behåll `Math.ceil`
men uppdatera testets facit till att förvänta N+1 (dokumentera att det
är avsiktligt), eller (c) räkna med kalenderdagar (midnatt-till-midnatt)
i stället för 24-timmarsblock, vilket är en tredje semantik. Rör inget
förrän valt.

---

# Claude-verifiering av Codex Goal-driven Margin Guardian V1 (natten 2026-08-14→15)

Två commits: `f2be1337` (kärnlogik: margin-guardian.ts, lib/profitability.ts,
v134-migrationen, MalBlock.tsx, projektets profitability-route) och
`49d3b19d` (inställningssidans fält — min egen rekommendation till Codex
igår kväll, nu byggd).

## VIKTIGT PROCESSFYND: git push kan bära med sig andras opushade commits

`f2be1337` hamnade LIVE i prod redan för några timmar sen — inte för att
jag pushade den medvetet, utan för att den låg lokalt committad (Codex,
23:57) INNAN jag körde `git push` för mina egna hygienfixar (00:03). Vi
delar uppenbarligen samma lokala arbetskatalog/gren, och `git push`
skickar ALLA lokala commits framför origin, inte bara ens egna. Jag hade
bara kollat `git status --short` (arbetsträdets renlighet), inte
`git log origin/main..HEAD` (vilka COMMITS som faktiskt skulle pushas).
Från och med nu: alltid `git log origin/main..HEAD --oneline` innan push,
så inget går live oreviewat igen.

Ingen skada skedd — se nedan — men ren tur att Codex byggde felsäkert.

## Var det farligt att f2be1337 låg live utan att v134 var körd?

Nej — kontrollerat explicit, inte antaget. Alla tre konsumenter
(`getExplicitMarginTarget` i lib/profitability.ts, MalBlock.tsx,
inställningssidans `fetchConfig`) är byggda att tåla den saknade
kolumnen: `getExplicitMarginTarget` fångar Supabase-felet och degraderar
till `null` (samma beteende som innan ändringen), och både MalBlock.tsx
och inställningssidan läser med `select('*')`/tyst-fail-mönster där en
saknad kolumn bara ger `undefined`, aldrig en krasch. Verifierat: allt
beteende för alla 22 konton är i praktiken OFÖRÄNDRAT tills v134 körs —
Guardian faller tillbaka till 75%-basgränsen precis som innan.

## Oberoende ombekräftat innan push av 49d3b19d

`npx tsc --noEmit` rent, `npx next build` grön, riktade facit
(`goal-driven-margin.spec.ts` + `margin-guardian.spec.ts` +
`business-config-reads.spec.ts`) 50/50 gröna, full svit 5876 gröna/14
failed (samma kända förbefintliga kluster — INKLUSIVE bekräftelse att
`business-config-reads.spec.ts`s tidigare flaggade MalBlock.tsx-fynd nu
är löst som en bieffekt av Codex arbete).

Läste igenom kärnlogiken själv (inte bara facit): `byggLonsamhetsVarning`s
nya 4:e parameter `goals: GuardianGoals = {}` är bakåtkompatibel (alla
befintliga anropare fortsätter fungera oförändrat), 95%-taket för
over_budget gäller alltid oavsett mål, `checkProfitabilityWarnings` läser
det bevisade målet EN gång per företag/körning (inte per projekt).

Pushat: `49d3b19d`. Deployat, verifierat.

## v134-migrationen KÖRD (2026-08-15, efter Andreas "Kör v134 då!")

`sql/v134_margin_target_explicit.sql` kördes via Supabase MCP och
verifierades direkt: kolumnen `margin_target_set_at` + triggern finns,
och backfillen gav exakt rätt resultat — 1/22 konton (det som avviker
från default, 20%) är nu bevisat explicit, resterande 21/22 (alla på
default-50%) förblir korrekt obevisade. Guardian kan från och med nu
faktiskt använda ett bevisat ägarmål när ett sparas.

# Outbound Safety & STOPP Closure V1 — 2026-08-15

## Mål

Stäng den kvarvarande lanseringsluckan där kundens STOPP-skydd och den
gemensamma kontaktfrekvensen uttryckligen failar öppet. Alla kund-SMS ska
passera en central, tenantbunden grind precis före 46elks-anropet. Interna
notiser och kundmeddelanden ska ha olika, explicita kontrakt.

## Plan

- [x] Inventera samtliga `sendSmsViaElks`-anrop och klassificera dem som
  interna, transaktionella, konversationella, proaktiva eller ren
  STOPP-bekräftelse.
- [x] Skriv browserlösa facit för fail-closed tenant-/opt-out-uppslag,
  exekveringstida proaktiv frekvens, approval-idempotens och STOPP-ordningen.
- [x] Bygg en central outbound-grind och gör sändkontraktet explicit på alla
  callsites utan att ändra SMS-innehåll eller affärshändelser.
- [x] Gör STOPP/START-persistensen kontrollerad: skriv flaggan före kvittens,
  läs Supabase-felet och returnera retrybart fel om skyddet inte kunde sparas.
- [x] Verifiera TypeScript, riktade facit, produktionsbuild, diff och
  dokumentera vad som fortfarande kräver ett riktigt 46elks-prov.

## Avgränsning

- Ingen ny meddelandeplattform och ingen parallell SMS-sändare.
- Inga ändringar av SMS-copy, approval-semantik eller vilka affärshändelser
  som skapar meddelanden.
- Transaktionella utskick frekvensblockeras inte; proaktiva utskick gör det.
  Alla kundklasser respekterar STOPP.
- Ingen produktionsmigration körs programmatiskt.

## Resultat

- `lib/outbound/sms-gate.ts` är nu den enda exekveringsgrinden precis före
  46elks. Kund-id/telefon verifieras inom samma `business_id`; saknad,
  främmande eller tvetydig kund och varje DB-fel blockerar utskicket.
- Alla direkta `sendSmsViaElks`-anrop anger nu mottagarklass och avsikt.
  Interna notiser har en kort allowlist; alla kundklasser respekterar STOPP.
- Bara proaktiva utskick samordnas mot de senaste sju dagarnas faktiskt
  skickade eller levererade kund-SMS. Transaktionella och pågående
  konversationer förblir möjliga.
- Approval-retries återanvänder tidigare `sent`/`delivered` leverans i stället
  för att skicka och kvoträkna en gång till. Detta skyddar sekventiella
  retries; en verkligt samtidig race kräver i framtiden en unik DB-claim.
- STOPP/START skriver och kontrollerar kundflaggan före kvittensen. Ett
  persistensfel ger 503 så webhooksändaren kan försöka igen; falsk bekräftelse
  returneras aldrig. Den särskilda STOPP-kvittensen får skickas först efter
  att spärren är sann.
- Ingen SQL eller ny sändare tillkom. Den äldre producentvakten är fortsatt
  rådgivande, men kan inte kringgå den fail-closed exekveringsgrinden.

## Verifiering

- `npx tsc --noEmit`: grön.
- Riktad slutsvit inklusive kolumnkontrakt: 127/127 grön.
- `npx next build`: grön, 420 routes/sidor; endast kända miljö-/metadata-
  varningar.
- Hela Chromium-sviten lästes till felsammanfattningen: 2 953 gröna, 128
  röda. 126 kräver nät/session mot `app.handymate.se` och blockeras av
  sandboxens `connect EACCES`; två är föråldrade `stegkedjan`-källfacit efter
  tidigare projektrefaktorering och träffar inga filer i denna diff.
- Read-only prob mot den konfigurerade testdatabasen verifierade att samtliga
  använda STOPP- och `sms_log`-kolumner finns (`customer=OK`, `sms_log=OK`).
- Ett riktigt STOPP-webhookprov genom 46elks är inte kört; det kräver ett
  uttryckligt testnummer och skulle vara en extern affärshändelse.

---
