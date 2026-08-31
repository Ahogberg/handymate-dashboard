# Jobbtyp → företagets underlag även i offert-AI:n

Codex · 2026-08-31 · fortsättning på Epic 2 efter Andreas godkännande.

## Leverans och filgräns

Backend byggd lokalt. Ingen commit, push, deploy, ny migration eller produktionsskrivning
gjord här. Claude äger QuoteBuilder/designen. Codex har inte ändrat editorn i detta pass.
Den tidigare Epic 2-integrationen ligger fortfarande bland lokala ändringar.

### Återstår i Claudes editorarbete

Skicka befintliga `templateId` som valfritt fält i **alla tre** anrop till
`POST /api/quotes/ai-generate` (foto, texthjälp, snabbutkast):

```ts
// JSON-objektet i fotoanropet:
templateId: templateId || undefined,
// De två dynamiskt byggda body-objekten:
if (templateId) body.templateId = templateId
```

Behåll nuvarande `jobType` och `customerId`. Utan explicit mall väljer servern
automatiskt en mall endast när exakt EN mall hör till den aktiva jobbtypen.
Flera mallar ger HTTP 409 + `templateChoices: [{id, name}]`, aldrig ett modellval.
Att välja en mall i editorn måste alltså även skicka dess ID, annars kvarstår
tvetydigheten vid nästa AI-anrop. Detta är integrationsarbete, inte en ny design.

Behåll Epic 2:s jobbtypsstart, affärsprefill och skydd för egna ändringar.
`QuoteJobTypeStart` måste ligga **inne i** QuickIntakes fixed-lager.

## Svar på Andreas frågor om befintliga kundresan

1. **Affär:** `NewDealModal` använder jobbtypens slug. Skapar-API:t sparar den i `deal.job_type`.
2. **Öppna offert:** affärskortet/modaldialogen skickar `deal_id`; QuoteBuilder läser affären,
   behåller kund/titel/beskrivning och sätter både ärvd och aktuell jobbtyp.
3. **Förifyllning:** exakt en kopplad mall kan tillämpas automatiskt, flera kräver val.
   Befintliga rader, edit-läge och ändringar medan underlaget laddas får inte ersättas.
4. **Artiklar:** `loadJobTypeStart` → `handleNewTemplateSelect` → befintlig
   `resolveTemplateItemPrices`. Explicit artikel-ID och aktuellt artikelpris följer med.
5. **Reservationer:** befintlig `useReservationSuggestions` reagerar på raderna.
   Det är **förslag att granska**, inte automatiskt accepterade villkor.
   Endast accepterad snapshot följer med editorns sparpayload.
6. **Spara:** `buildQuotePayload` bär `customer_id`, `deal_id`, `job_type`, `template_id`,
   produktkopplingar och reservationssnapshot. Edit-payloaden nollar inte dessa relationer.
7. **Onboarding:** befintliga artikelsteget låter kunden välja vanliga jobbtyper,
   koppla mall och artiklar samt sätta priser. Texten förklarar nu uttryckligen
   nyttan för Daniel och hur reservationsförslagen följer med. Ingen ny onboardinggrind.

Punkterna är kod-/testverifierade lokalt, inte ett påstående om genomförd skarp kundresa.

## Backendförändringen

- `buildQuoteGenerationContext` tar ett fjärde, valfritt argument `{jobType, templateId}`.
  Alla tre befintliga anropare matar in jobbtypen och lämnar `jobTypeContext` till generatorn.
- Explicit tenant- och jobbtypskontroll. Ingen matchning av jobbtyp på mallnamn/kategori.
  Okänd/inaktiv jobbtyp utan explicit mall ger generell generering med ärlig status.
  Felaktigt explicit mallval stoppas. Bara bevisat saknad `job_type_slug` får degradera
  till `unavailable`; övriga läsfel är fel, inte tomma lyckade resultat.
- Mallens artikel-ID:n hämtas separat, tenantfiltrerade och aktiva. De prioriteras
  framför övriga topp-100; ingen kopplad artikel kan falla ut på grund av alfabetisk ordning.
  Mer än 100 mallrader stoppas i stället för att klippas tyst.
- Modellunderlaget innehåller mallens beskrivningar, enheter, produktreferenser och
  tillvalsmarkörer. **Inga seedpriser eller mallmängder.** Dolda rader utelämnas.
- `applyGeneratedPriceTruth` kontrollerar modellens svar före summering och sparmappning.
  Pris från verkligt kundavtal/vald bankartikel ersätter modellens pris; okänt pris blir
  noll med granskningsmarkering. Ingen fuzzy-prissättning eller mängdomräkning.
- Kundens exakta namn+enhet-rad går först, därefter avtalspris för timarbete, därefter
  bankpris. Företagets generella timpris gäller bara olänkad generell arbetsrad.
  Prislös vald arbetsartikel ersätts inte av ett generellt timpris.
- Med flera avtalade timpriser kan modellen föreslå `customerRateRef`
  (`normal/ob1/ob2/emergency`); själva beloppet hämtas i kod. Oklart/ogiltigt val ger
  prisgranskning. Valet är ett förslag, inte kundbekräftad debiteringstid.
- Samma-enhetskontroll även för produktreferenser. kg och ton är inte utbytbara.
  Ogiltigt uttryckligt handtag faller inte tillbaka till en annan produkt.
  Ägarens uttryckliga artikelkoppling kan stödja en mallrad med egen beskrivning.
- Mängder är fortsatt modellförslag (`quantitySource: proposal`), inte fastställda mått.
  Ogiltiga/icke-finita mängder och totalsummor stoppas. Tillval räknas inte i grundsumman.
- `quoteBasis` i genereringssvaret redovisar serverns underlag/status. Befintligt
  reasoning-fält får en saklig ingress om underlag och mängdgranskning.
- `resolveCustomerPriceList` har opt-in `strict` och injicerad befintlig Supabase-klient.
  Genereringen använder det: trasig kund/lista, dubbla segment/default-listor eller läsfel
  får inte leda till tyst standardpris. Prisrader läses separat med tenantfilter.
  En full 1000-radssida stoppas eftersom PostgREST annars kan ha kapat underlaget.
  Övriga anropare behåller tidigare fail-soft-kontrakt.
- Matte-verktyget stödjer `template_id`. Vid flera mallar returneras valen till Matte
  med `requires_user_choice`, utan offertskrivning. Spararen är fortfarande
  `createCanonicalQuote`; jobbtyp/mall från verifierat underlag följer med där.

## Databas: vad som faktiskt kontrollerats

Läsande Supabase MCP 2026-08-31:

- `quote_templates.job_type_slug` finns, liksom tenant-FK:n till `job_types` och
  CHECK som kräver business på kopplad mall. **v187 behöver inte köras igen.**
- Berörda fält i `products`, `job_types`, kundprislistor, kunder och offerter finns.
- SQL-läsprober med de faktiska kolumnlistorna kördes mot de två tidigare godkända
  testföretagen. De finns, men saknar aktiva jobbtyper, mallar, artiklar och kunder.
- Antal jobbtypskopplade mallar globalt var **0** vid kontrollen. Inget har backfillats/gissats.
- Ett separat read-only PostgREST-prov kunde inte starta: denna lokala miljö saknar
  konfigurerad service-rollsnyckel. Ingen ny nyckel hämtades eller delades.
  SQL-schema/prober är inte ett bevis på körd autentiserad HTTP-kundresa.

## Tester och aktivering

Nya tester kör tjänstens verkliga frågekedjor mot ett in-memory facit samt den riktiga
`generateQuoteFromInput` med isolerad Anthropic/Supabase/kostnads-I/O. Inga riktiga
AI-anrop, utskick eller DB-skrivningar görs av dessa tester. De testar även
generator → serverpris → totalsumma → sparrader → reservationsförslag, samt
sparpayloadens kund/affär/jobbtyp/mall och edit-skydd.

De två gamla källtesterna i `quote-new-context.spec.ts` är uppdaterade: Epic 2 tillåter
nu även uttryckligt jobbtypsval utan affär; antal setState-anrop var inte längre rätt facit.

Körloggar: `.codex-work/quote-context-final-tests.log`, `quote-context-tsc-final.log`,
`quote-context-build-final.log` och `quote-context-verify.log`.
Slutresultat:

- **330 riktade browserlösa tester gröna** (22 sviter, `--no-deps`, chromium).
- **`npx tsc --noEmit` exit 0.**
- Kolumnvakten: samma två äldre fel kvar — `project_log.work_performed` i
  portalrutten saknas i SQL-facitet, samt ett föråldrat antal filteranrop (>10, nu 8).
  Inga nya kolumnavvikelser från detta pass. Det är inte en helt grön totalsvit.
- **`next build` exit 1.** Kompilering och inbyggd typkontroll passerade, men
  prerenderingen misslyckades. Loggen innehåller både saknad Supabase-konfiguration
  (`supabaseUrl is required`) och saknade genererade moduler under `.next/server`.
  Orsaken till de saknade byggmodulerna är inte fastställd; ingen annans process
  stoppades och ingen delad byggkatalog raderades. Kör om i en isolerad, korrekt
  konfigurerad byggmiljö. Bygget får inte redovisas som grönt.
- Läsande DB-prober och diffkontroll genomförda. Ingen autentiserad positiv
  kundresa mot riktig databas har körts i detta pass.

Före leverans till kund: integrera editoranropen ovan och gör ett godkänt skarpprov
med syntetisk kund, aktiv jobbtyp, mall, artikelpris och produktreservation.
Prova både affär → offert och onboarding → första offert, därefter Matte-utkast.
Prova flera mallar, osatt pris, kundavtal och enhetsfel. **Skicka inget till verklig kund.**

Utanför passet: ändrad godkännandemekanik, nya reservationsregler, redigering av
accepterade offerter, automatisk sändning, fakturering samt omskrivning av den äldre
manuella mallvägens generella timprisfallback.
