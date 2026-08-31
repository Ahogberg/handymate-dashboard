# Epic 2 — inkopplat lokalt, aktiveringsbevis återstår

**Uppdatering senare 2026-08-31:** läsande DB-verifiering i AI-underlagspasset
bekräftar att v187-kolumnen samt tenant-FK/CHECK nu finns. Kör inte migrationen
igen enbart på grund av den historiska checklistan nedan. Inga mallar var ännu
jobbtypskopplade. Autentiserat positivt kundreseprov och deploy återstår.
Fortsättningen och Claudes tre editoranrop finns i
[AI-underlagets handoff](QUOTE_JOB_TYPE_AI_HANDOFF_2026-08-31.md).

2026-08-31 · Codex · grund på `3cb96a05`, integration på main `d995e3a8` efter Claudes offertomtag.

Specen är [överlämningen](EPIC2_JOBBTYPSSTART_HANDOFF_2026-08-31.md).
Det här är en leveransstatus, inte en ny roadmap eller konkurrerande spec.

**Kodkedjan är nu inkopplad lokalt. Inte aktiverad/skarpbevisad.** Artikelsteget,
jobbtypsstarten i gemensam QuoteBuilder och Matte-övergången i sista onboardingsteget
är ihopkopplade. v187 och autentiserade DB-/kundreseprov återstår enligt nedan.
Ingen commit, push, deploy eller databasändring gjord i detta pass.

## Byggt

- `sql/v187_quote_template_job_type.sql`: nullable `quote_templates.job_type_slug`,
  sammansatt FK till `job_types(business_id,slug)`, index och skydd mot koppling
  på en mall utan företag. Ingen backfill, prisändring eller ändring av gamla offerter.
- `lib/quotes/job-type-setup.ts`: gemensam liten läsmodell, explicit mallkoppling,
  artikelkoppling via ID, enhetskontroll, räkning av prissatta/saknade rader.
  Mallens belopp och mängder lämnas helt utanför denna presentationsmodell.
- `lib/quotes/job-type-setup-server.ts`: paginerad läsning, tenantkontroll och
  versionskontrollerade skrivningar. Ett missat uppdateringsutfall är 409, inte framgång.
- `/api/job-types/quote-setup`: GET kräver `see_financials`; PUT/PATCH kräver
  owner/admin. Tenant kommer från auth, aldrig från body. GET är `force-dynamic`.
- `components/onboarding/JobTypeQuoteSetup.tsx`: välj upp till tre jobbtyper,
  välj/koppla mall, koppla saknade artikelreferenser med samma enhet och prissätt
  relevanta artiklar via befintliga `QuickPriceInput`. Visar separat läsfel och
  okörd migration. Ingen AI, kundkommunikation eller offertskrivning.
- Monterad i befintliga `StepProductRegister` och Inställningar → Jobbtyper.
  Befintlig CSV-import och artikeleditor återanvänds. Övriga artiklar finns kvar
  under en utfällbar lista. Inställningssidan behåller en enda jobbtypsskapare.
- Onboardingens befintliga JSON-data utökas med `quoteJobTypes` och
  `firstQuoteSelection`. Ingen ny onboardingtabell eller extra obligatoriskt steg.
- `FirstQuoteLaunch`: tillgängligt Matte-kort med verkligt valt företags-/jobb-/mallnamn,
  återförsök och rörelsereducering. Ingen låtsasoffert, inga prisexempel, ingen
  konstgjord väntan. **Monterad som ett val i sista onboardingsteget.**
- `lib/onboarding/first-quote-handoff.ts`: validerade referenser till mottagaren,
  skydd mot att skriva över redigering, egna rader eller affärens kända jobbtyp.

## Integration efter Claudes merge

- `QuoteJobTypeStart` i den riktiga QuoteBuilder: kallstart visar företagets aktiva
  jobbtyper; en affärs kända jobbtyp följer med utan ny fråga. Exakt en explicit
  kopplad mall kan öppnas automatiskt från affären; flera mallar kräver ett val.
  Kallstart väljer först jobbtyp och sedan underlag. Utan koppling kan man fortfarande
  beskriva jobbet, välja en vanlig mall eller börja tomt.
  `QuickIntake` har ett litet slot för väljaren inuti sitt befintliga fixed-lager;
  en syskonkomponent bakom helskärmsytan skulle inte synas. Intagets övriga flöde är orört.
- `loadJobTypeStart` hämtar om setup och rå mall via befintliga autentiserade API:er.
  Jobbtyp, mallkoppling, version och artikelreferenser måste fortfarande stämma.
  Setup-DTO:n bidrar aktuella produktpriser, aldrig mängder eller offertrader.
- En och samma `handleNewTemplateSelect` och `resolveTemplateItemPrices` används.
  Reserveringar föreslås av befintliga `useReservationSuggestions` på dessa rader.
- **Prisfix inom integrationen:** explicit `linked_product_id` slår både mallens
  gamla pris och det generella timpriset, också för arbetsrader och tidigare nollrader.
  Saknad/inaktiv artikel, fel enhet eller osatt pris ger prisgranskning, aldrig en
  alternativ namnträff. Test först rött: 950 förväntat, 700 faktiskt; nu grönt.
  Befintliga regler för olänkade mallrader (inklusive den äldre 650-fallbacken)
  är inte omdesignade här. Kundavtal och mängder ska fortsatt granskas i editorn.
- Försenade svar avvisas om användaren ändrat rader, beskrivning, villkor, kund,
  priskontext eller startläge. Befintligt edit-läge får ingen jobbtypsstart.
  En avslutad/avbruten automatisk start spelas inte om vid ommontering.
- `Step6LiveTour` behåller första-uppdraget och Utforska själv, och erbjuder första
  offerten när ett underlag valts. `FirstQuoteLaunch` visar verkliga namn; servern
  validerar aktuellt val, befintlig PUT sparar onboardingval, POST finaliserar, sedan
  navigerar kunden till samma `/dashboard/quotes/new`. Inget nionde steg.
- Diskret rörelse på övergångskortet och ankomst i editorn; ingen konstgjord väntan,
  fejkad AI-generering, talking head eller automatisk sändning. Reduced motion stöds.
- `QuickPriceInput` har namngivet prisfält, synligt sparfel och signal om pågående
  prissparning till onboardingens navigationsspärr. Läsfel raderar inte tidigare
  sparat onboardingurval; mottagaren omvaliderar ändå innan tillämpning.

## Gränssnitt mot Claudes offertomtag

1. Den enda målvägen är `/dashboard/quotes/new`, vars wrapper monterar
   `app/dashboard/quotes/_shared/QuoteBuilder.tsx`. Den gamla editorn får ingen
   separat implementation.
2. Implementerad start-URL:
   `/dashboard/quotes/new?first_quote=1&job_type=<slug>&template_id=<id>`.
   `readFirstQuoteIntent` tolkar enbart referenserna. `loadJobTypeStart` validerar
   aktuellt tenantfiltrerat underlag; `canApplyJobTypeStart` skyddar ändringar under laddningen.
3. Vänta tills affär/kund/utkast är färdigladdat. Vid `mode=edit`, egna rader,
   återställt utkast eller motstridig ärvd jobbtyp: bevara befintligt innehåll.
   En gammal/arkiverad/flyttad mallreferens får inte fyllas i ändå.
4. **Mottagarens riktiga mallprisresolver ska köras.** Setup-DTO:n är inte råa
   offertrader och får aldrig användas för prisberäkning. `linked_product_id` som
   användaren valt ska respekteras; `article_number` synkas till artikelns SKU.
   Kopplingsrutten ändrar inte gamla mallbelopp. Att kopiera mallens gamla 650/4500
   direkt är fortfarande förbjudet. Enhetskonflikt måste lämnas för granskning.
5. Sätt befintligt `jobType` och använd Claudes trådning till AI-generate, inte
   en ny parallell kanal. Applicera mall en gång; StrictMode/omladdning får inte
   duplicera eller ersätta manuella rader.
6. Återanvänd befintlig reservationsmatchning och offertens snapshot-regler.
   Ingen ny jobbtypstrigger eller reservationsmotor i detta epic.
7. Vid onboardingavslut: hämta om urvalet, bygg validerad URL med `firstQuoteHref`,
   invänta lyckad sparning och befintlig finalize, navigera sist. Vid fel: stanna och
   visa återförsök. Befintliga mål-/company-scan-/första-uppdrag-handoffs ska inte
   tappas när användaren väljer offert i stället för översikten.
8. `FirstQuoteLaunch` är nu monterad mot `completeFirstQuoteOnboarding` och den
   inkopplade mottagaren. Skarpa bevis nedan krävs fortfarande före aktivering.

## Verifiering och sanningsgräns

- Riktiga databasens metadata läst via Supabase: `products.id` och mall-ID är TEXT,
  jobbtyps-ID UUID, jobbtyper har unik `(business_id,slug)`. Mallens `business_id`
  kan vara NULL; det är därför migrationen också har ett CHECK-villkor.
- Senaste lyckade DB-läsningen visade att `job_type_slug` saknades. **Codex har inte
  kört v187.** Omkontroll under integrationspasset kunde inte genomföras:
  Supabase MCP svarade `Transport closed`. Ingen ny DB-verifiering påstås.
- `tsc --noEmit`: grönt.
- Produktionsbygge: grönt (exit 0). Befintliga Browserslist/SIGTERM-worker- och
  metadata-varningar förekom. Sitemap loggar saknad Supabase-URL i den lokala
  byggmiljön och använder sin fallback. Exit 0 bevisar inte att integrationer är aktiva.
- Riktad regressionskörning omfattar ny modell/tjänst, onboarding, priser,
  reservationer och tabellkontrakt. Se slutligt körresultat nedan.
- Lokal byggd API-rutt, utan inloggning: GET/PUT/PATCH → 401, även manipulerad body.
- Verkliga React-komponenter kontrollerade i webbläsare med **syntetiska lokala
  API-svar**, 320/390 px och 1280 px: saknat pris, lyckad prissättning, artikelkoppling,
  läsfel, okörd migration och synligt finalize-fel med återförsök. Ingen autentiserad
  kundresa eller skarp skrivning påstås vara bevisad av det provet.
- Temporärt reproducerbart UI-prov i `.codex-work/epic2-qa/` (ej produktionskod).
- Även **sammansatt QuickIntake + QuoteJobTypeStart** kontrollerat på 320/390/1280 px:
  väljaren är synlig inuti helskärmslagret, mallalternativ kan väljas, ingen horisontell
  overflow i väljaren. Detta är riktig UI-kod med syntetiska API-svar, inte skarpt konto.

Kolumnvakten kördes separat och har två röda kontroller i oförändrad main-kod:

1. `project_log.work_performed` saknas i SQL-facit. **Fältet finns i produktion**, bekräftat
   med läsande `information_schema`-fråga under passet. Detta är inte belägg för att
   ändra portalfrågan; schemafacit behöver uppdateras i rätt lane.
2. Offertfiltrens sanity-test kräver fler än tio träffar, nuvarande träd har nio.
   Kvarstår även efter integrationen i QuoteBuilder. Kolumnvakten är oförändrad.

Hela befintliga testsviten är därför inte rapporterad grön. De nya fake-DB-testerna
bevisar tenantfilter och skrivordning, **inte RLS i en riktig databas**.

## Nästa bevis före aktivering

- [ ] Granska v187 och kör manuellt; kontrollera kolumn, FK och CHECK efteråt.
- [ ] Autentiserad GET samt kopplingar mot riktiga testkonton: korrekt företag
  fungerar; andra företag, inaktiva artiklar/jobbtyper, otillräcklig roll och
  gammalt `updatedAt` nekas utan ändring. Enhetsmismatch nekas.
- [ ] Skarp gemensam QuoteBuilder: mall + verkligt artikelpris + reservation,
  AI får jobbtyp, kundrelation bevaras. Redigering/återställt utkast orört.
- [ ] Färskt konto → artikelsteg → lyckad finalize → första riktiga offert;
  hoppa över och återuppta, långsamt nät, finalize-fel och gammal startlänk.
- [ ] Läs igenom totalsvitens felsammanfattning efter att offertomtaget landat.

### Kort skarpprovsrecept (efter migration och granskad deploy)

1. På ett uttryckligt testkonto: välj en aktiv jobbtyp, koppla en mall och koppla
   dess arbetsrad till en egen artikel. Sätt t.ex. 950 kr/tim och låt företagets
   generella timpris vara ett annat. Använd bara testdata, skicka inget till en riktig kund.
2. Starta en ny offert från affär med samma jobbtyp: kunden/titeln/jobbet ska följa
   med, artikelpriset vara 950 och produktens befintliga reservationsregel föreslås.
3. Prova också flera mallar (kräver val), osatt artikelpris (granskning), ändrat
   `updatedAt`, inaktiv artikel och annan tenants mall-ID (ingen felaktig förifyllnad).
4. På ett färskt konto: artikelsteg → sista stegets första-offerten-val → Matte-kort →
   riktig offertvy. Prova även Utforska själv och Ge teamet ditt första uppdrag;
   de ska fortfarande nå sina ursprungliga mål utan oavsiktligt utskick.
5. Långsamt nät: ändra ett villkor eller starta ett eget utkast medan underlaget
   laddas. Det egna arbetet ska bevaras. Återöppna en redan sparad offert och
   kontrollera att jobbtypsstarten inte ändrar rader, priser eller snapshot.

## Slutligt lokalt körresultat

Grundpasset: 171 riktade tester gröna (32 i `job-type-setup.spec.ts`).
Integrationspasset: **210 riktade tester gröna**, inklusive 11 riktiga React-render/
interaktionstester i lokal DOM. Inga browser/session-baserade prodskrivningar.
Separat kolumnsvit: 11 gröna, samma två äldre röda ovan. Inte hela totalsviten grön.

Körloggar i `.codex-work/epic2-integration-final-tests.log`,
`.codex-work/epic2-ui-tests.log`, `.codex-work/epic2-column-final.log`,
`.codex-work/epic2-integration-tsc-final.log` och `.codex-work/epic2-integration-build-final.log`.
Slutlig verifiering: `tsc --noEmit` **exit 0** och `next build` **exit 0**, med
`NODE_OPTIONS=--max-old-space-size=8192`. Befintliga metadata-/Browserslist-varningar
och SIGTERM-/dynamic-render-diagnostik förekommer även i det lyckade bygget.
De lokala QA-servrarna är stoppade och browserns tillfälliga viewport återställd.

### Föreslagna lokala kontrollkommandon

```powershell
npx.cmd tsc --noEmit
npx.cmd playwright test tests/job-type-start.spec.ts tests/job-type-start-ui.spec.ts tests/job-type-setup.spec.ts tests/resolve-template-item-prices.spec.ts tests/onboarding-product-register.spec.ts tests/onboarding-first-mission.spec.ts tests/quick-preferences.spec.ts tests/reservations.spec.ts tests/offertbyggaren.spec.ts tests/schema-contract.spec.ts tests/pricing-state.spec.ts tests/match-generated-items.spec.ts --no-deps --project=chromium --workers=2 --reporter=line
npx.cmd next build
```

Vid minnesbrist: sätt `NODE_OPTIONS=--max-old-space-size=8192` för byggprocessen.
Ingen commit/push/deploy eller migrationskörning ingår i leveransen. Granska bara
Epic 2-filerna — den delade arbetskatalogen innehåller även orelaterat marketingarbete.
