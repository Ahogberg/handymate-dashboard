# Releasegrind och kundresa — 2026-09-11

**Beslut: HOLD för lansering.** Kodens lokala grind är grön. Den kompletta kundresan i driftsatt app är inte verifierad.

Testad appkod i GitHub: `addca9b03ff059303b0b781c19f19592b5760447`; uppdaterad UI-testresa: `b2552eb058ed4d73da272ccdeb463c8326551002`, draft-PR #38. Appkoden är identisk mellan dessa två commits. Ingen merge, produktionsmigration eller aktivering utförd. UI-designen fortsätter separat hos Claude Design.

## Korrigering av publiceringen

47 filer hade publicerats utan prefixet `handymate-dashboard/`. CI och Vercel bygger den nästlade appen, så tidigare gröna byggen bevisade inte att dessa ändringar ingick. Samtliga 47 filer matchades med blob-SHA mot lokalt versionshanterat innehåll, flyttades till rätt sökväg och rotkopiorna togs bort. Befintliga dokument i repo-roten bevarades. Efter publiceringen jämfördes GitHubs rekursiva träd mot det lokala indexet utan innehållsavvikelser; Unicode-filnamnet verifierades separat med avstängd Git-citering.

En regressionsgrind stoppar appkataloger eller package.json i repo-roten. Branschpaket/kundkanal ligger nu i samma kontraktslista lokalt och i CI. Ett föråldrat regex-texttest ersattes med beteendetester av datumvalideringen, inklusive ogiltiga kalenderdatum och tider.

UI-testresan uppdaterades dessutom från gamla smala jobbnamn till Laddbox, Elcentral och elsäkerhet samt Service och felsökning. Testets återanvändning pekar på samma nya jobbtyp och fixturen skickar branschen vidare, som den verkliga onboardingen.

## Utförda lokala kontroller

| Kontroll | Resultat | Bevisets gräns |
| --- | --- | --- |
| TypeScript, 8 GB heap | Godkänd | Statisk kontroll |
| `npm run test:contracts` | 2 063 godkända, 1 överhoppat | Browserlösa kontrakt, blandning av runtime, DOM-fixtures och källkontroller |
| Kundunderlag efter kontraktssviten | 17 godkända | Isolerade HTTP/storage-beroenden |
| Aktivitetsläsning | Godkänd | Kolumnkontrakt med isolerade beroenden |
| `npm run test:six-outcomes` | 327 godkända | Verkliga helpers/routes samt isolerad PostgreSQL; leverantörer simulerade |
| `node tests/sprint/mail-boundaries.cjs` | 30 godkända i fullständig separat körning | OAuth/identitet och verklig SQL i PGlite, inte live Google |
| Godkännandekortens server-/DOM-testprogram | 29 program godkända | Faktiska handlers och skrivare med isolerade externa effekter |

Överhoppat kontrakt: det redan markerade fallet i `send-invoice-core.spec.ts` där varken email eller SMS begärs. Det räknas inte som godkänt.

`test:approval-integration` kunde inte fullföljas: Chromium-starten misslyckades med `EINVAL` vid `/tmp/fonts`. De 29 programmen ovan kördes därefter separat med noll fel. `browser-harness.cjs`, `pdf-preview-browser-harness.cjs` och den filskrivande `job-report-review-harness.cjs` ingår inte i detta godkända urval.

## Kundresans bevisläge

| Steg | Kontrollerat i denna grind | Kvar före livegodkännande |
| --- | --- | --- |
| Företagsstart och organisationsnummer | Onboardingens kontrakt ingår | Nytt företagskonto och riktig registerhämtning |
| Bransch → jobbtyper → standardartiklar | Alla sju branschpaket, egna/äldre val, aktuella egna priser, arbetstid och inga malltak | Genomför steget i driftsatt UI |
| Primär kundkanal | Kanalval sparar data; mejladress kräver explicit aktivering; fel kan återförsökas | Verklig provisioning och inkommande testförfrågan |
| Avbrott och återkomst | GET/PUT/POST-fel, återförsök, stabil slutstatus och bevarade val | Logga ut/in och ladda om i faktisk session |
| Förfrågan → kundunderlag → agent | Isolerade intake-, portal-, Gmail- och överlämningsfall | Externt inflöde och rätt företags data i UI |
| Jobbtyp → första offert | Standardrader, egna artikelpriser, reservationer, sparning och återöppning | Samma offert genom hela driftsatta resan |
| Granska → godkänna → skicka | Exakt granskat innehåll, mottagare, stale review, leveransutfall, återförsök och deduplicering | Kontrollerat testutskick och mottagarkvitto |
| Acceptera → projekt → fakturaunderlag | Acceptans/idempotens, projekt- och fakturakontrakt | Kundens riktiga acceptans, dokumentvisning och integrationskvitton |
| Mobil och desktop | CI-sviter följs separat nedan | Sammanhängande inloggat test på den korrigerade versionen |

## Kvarvarande releaseblockerare

1. **Browser/livebevis.** CDP kunde skapa flik men både listning och navigering misslyckades med timeout. Ett dokumenterat återställningsförsök gjordes; ingen inloggning eller verklig kundresa blev verifierad. Testa rätt preview med ett dedikerat konto utan att återställa Svensson Byggs befintliga data.
2. **Mejlschema före mejlkod.** En read-only kontroll av produktionsprojektet `pktaqedooyzgvzwipslu` gav noll träffar för `email_conversations.mail_provider`, `mail_account`, `provider_message_id`. SQL-filen `sql/mail_integration_boundaries.sql` är alltså fortfarande förberedd, inte införd. Följ ordningen i `MAIL_INTEGRATIONS_PREPARATION.md`: isolerad testmiljö, pausad import, SQL/app samordnat, verifiering, därefter återupptagning. Den korrigerade kodens Gmail-identitet får inte betraktas som produktionsklar på nuvarande schema.
3. **Verkliga integrationsbevis.** Gmail/Outlook-val i onboarding betyder inte anslutet konto. Providergranskning, Microsoft-adapter och den övriga dokumenterade OAuth/tokenhärdningen återstår. Telefon/SMS, Fortnox, betalning och ROT behöver respektive tidigare angivna livekvitton; lokala tester ersätter dem inte.

Nästa test körs mot den korrigerade kodversionen: företagsstart → välj bransch/jobben → egna arbets-/materialpriser → kundkanal → avbrott/återinloggning → testförfrågan → granskad offert → kontrollerad leverans → kundacceptans → projekt. Dokumentera sparade referenser och leveranskvitton; markera inget skickat eller integrerat utan bevis.

## CI på korrigerad kod

Verifierat på `b2552eb058ed4d73da272ccdeb463c8326551002` efter korrigeringen:

- Kontraktsgrind — godkänd (run 34602518792).
- Jobbtyper och offertstandarder — godkänd (run 34602518724), verklig Chromium med isolerat nätverk/PostgreSQL, 375 och 1280 px.
- Onboardingens tipskort — godkänd (run 34602518749).
- Första nyttan på mobil och desktop — godkänd (run 34602518872).
- Sammanhang mellan kundunderlag, offert och dagsavslut — godkänd (run 34602518762).
- Vercel `handymate-dashboard` och `handymate-vision-test` — båda byggen godkända.

Detta dokument och checkpointen publiceras därefter som en ren dokumentationsändring. App- och testkoden ändras inte efter dessa kontroller. **Grön kod-/bygggrind ändrar inte releasebeslutet HOLD:** kundresan med autentisering, driftsatt schema och externa leveranskvitton återstår.
