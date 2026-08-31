# Nu-fördjupning — import, budskap och bevis

_2026-08-31. Avgränsat genomförande efter
[konkurrentresearchen](../gtm/COMPETITOR_RESEARCH_2026-08-31.md).
Arbetsresultat och köranteckningar, inte en ny auktoritativ lanseringschecklista._

## Slutsats

Den konkreta produktfixen är CSV-importen: båda befintliga importytorna
använder nu samma serverväg, samma CSV-läsare och samma resultatkvittens.
Returfel från databasen räknas inte som framgång och delvis import döljs inte.
Säljbudskapet utgår nu från jämförbara arbetsflöden, inte från att konkurrenter
saknar AI. Christoffers operating plan har ett konkret första-dagen-upplägg.

**Status: lokala ändringar, inte committade, pushade eller driftsatta i detta
pass. Ingen migration. Inga avsiktliga produktionsskrivningar eller externa
kundmeddelanden i verifieringen.** Den publika rökkontrollen provar dagens
driftsatta app, inte den nya importkoden.

## Fynd som åtgärdats

### 1. Misslyckad uppdatering kvitterades som lyckad

`app/api/customers/import/route.ts` läste inte Supabases `error` efter
uppdatering. Kundsidans CSV-vy hade en egen skrivloop med samma brist.
Lookupfel kunde dessutom behandlas som ”kunden finns inte”.

Nu krävs ett felfritt skrivresultat med returnerat kund-ID innan en skrivning
räknas. Uppdateringen filtreras på både autentiserat företag och kund-ID.
Misslyckad/tvetydig lookup ger ett radfel, inte en ny kund. Body-styrt
`business_id` eller `customer_id` kan inte bestämma skrivningens tenant/ID.

Servern särredovisar `created`, `updated`, `unchanged`, `skipped` och `failed`.
`success` behålls för kompatibilitet och är summan av de tre första.
`importedIds` innehåller unika bekräftade kunder, medan antalen avser rader.
`total = success + skipped + failed`. Som tidigare behandlas rader var för
sig: detta är inte en all-or-nothing-transaktion.

### 2. Två gränssnitt gav olika och för optimistiska kvitton

- Kundsidans egen INSERT/UPDATE-loop är borttagen. `skip_existing` skickas
  till samma API och omprövas där, inte enbart mot en gammal förhandsvisning.
- Onboarding visar delresultat och fel, inte automatiskt en grön framgångsvy.
- Gemensam `CustomerImportReceipt` skiljer sparade rader från synk/aktivering.
- HTTP-/transportfel eller ett ogiltigt svarsformat ger okänt resultat;
  kunden uppmanas kontrollera kundlistan innan nytt försök. Ingen automatisk retry.
- Lokalt dubbeltryck på import blockeras medan anropet pågår.
- Kampanjknappen heter ”Förbered uppföljning” och använder antalet unika
  kunder. Den öppnar den befintliga kampanjytan, inte ett utskick.

Dashboardimporten använder nu även API:ts redan befintliga kundnumrering och
Fortnox-batchanrop. Fortnox-kärnan är inte ändrad. Kvittot bevisar enbart
Handymates kunddata, aldrig att Fortnox-synken lyckades. En oförändrad eller
helt misslyckad import startar inget sådant batchanrop.

### 3. Citattecken och saknade kolumner kunde flytta kunduppgifter

Onboardingens gamla `split(delimiter)` delade även kommatecken inne i ett
citerat namn/adress. Vid rubriker utan telefonkolumn kunde kolumn två,
exempelvis e-post, ändå användas som telefonnummer.

Den gemensamma CSV-läsaren hanterar komma, semikolon, tab, BOM, citerade
separatorer, dubblerade citattecken, CRLF och radbrytningar inne i fält.
Oavslutade/felplacerade citattecken och olika kolumnantal avvisas före POST.
När rubriker finns förblir saknade fält tomma. Oanvändbara rader från
onboarding når serverns felkvittens i stället för att tyst försvinna.
XLSX har inte lagts till; texterna säger nu korrekt CSV-export från Excel.

### 4. Säljmaterialet bar gamla konkurrenspåståenden

Uppdaterat i befintliga källor:

- [Säljarsenalen](../../tasks/sales-arsenal.md): nya pitch- och invändningssvar;
  gamla ”bara workshop/chatt”, kopieringstider och generella integrationslöften bort.
- [Kundspråket](../marketing/product-language.md): Matte = chefsagent,
  Uppdrag = publik term; inspelning, Lisa-samtalsefterarbete och Matte-röst
  hålls isär. Aktivering måste bekräftas, inte antas.
- [Operating plan](../../HANDYMATE_OPERATING_PLAN.md#8-demon--20-minuter):
  en relevant startkedja, importkvittot, kanalprov och uppföljning inom två
  arbetsdagar. Kommersiella priser och villkor har inte ändrats eller omverifierats.
- Appens enkla ingångssida beskriver AI-teamet och krävd inloggning; feltexten
  ”Demo-läge • Ingen inloggning krävs” är borttagen. Detta är inte en
  ompublicering av den separata marknadsföringssajten.

## Verifiering i detta pass

| Kontroll | Resultat och avgränsning |
|---|---|
| Regression före API-fix | 13 röda, 5 gröna; bland annat bevisad felaktig success-kvittens vid returnerat updatefel |
| Nya import-/kvitto-/CSV-tester | 44 passerar; verklig rutt mot explicita DB/auth/Fortnox-dubblar, ren CSV-logik, React-rendering och källkontrakt |
| Riktat regressionspaket | **190/190 passerade**, 11 testfiler, Chromium-projekt utan browser/session/deps |
| Next-produktionsbygge | Slutbygget exit 0; buildlogg innehåller även Browserslist-/worker- och dynamisk-renderingsvarningar, inte en varningsfri logg |
| TypeScript | Separat `npx tsc --noEmit` efter slutbygget: exit 0 |
| Publikt rökprov mot app.handymate.se | **5/5 passerade**: health 200 med färsk timestamp; ogiltig offert-, portal- och jobbpasstoken 404; cron utan hemlighet 401 |

Rökkontrollens första försök stoppades av lokal nätåtkomst (`fetch failed`).
Efter godkänd nätåtkomst passerade samtliga fem. Det första utfallet är inte
belägg för ett produktionsfel.

Kolumnkontraktet är statiskt och har dokumenterade luckor för tabeller vars
basschema saknas i `sql/`, bland annat `customer`. Det är **inte** bevis för
driftsatt schema eller RLS. De nya query-fälten är befintliga fält, men en
riktig import/återläsning behöver fortfarande göras efter deploy.

Detta är inte hela testsuiten, ingen browser-E2E av importytorna och inget
telefonsamtals-/push-/betalningsbevis. Tidigare skarpkörningar i
[Launch Promise Gauntlet 27 augusti](LAUNCH_PROMISE_GAUNTLET_2026-08-27.md)
är historiska och har inte räknats som omkörda här.

### Reproducerbara lokala kontroller

```powershell
npx playwright test tests/customer-import.spec.ts tests/customer-import-receipt.spec.ts tests/customer-csv.spec.ts tests/facit-channel-health.spec.ts tests/column-contract.spec.ts tests/file-attachments.spec.ts tests/storage-signing.spec.ts tests/matte-time-logging.spec.ts tests/voice-boundaries.spec.ts tests/invoice-evidence-manifest.spec.ts tests/facit-customer-fortnox-create.spec.ts --project=chromium --no-deps --workers=2 --reporter=line
npx next build
npx tsc --noEmit
node scripts/launch-public-smoke.mjs
```

Kör build och tsc **sekventiellt**. Ett överlappande försök i detta pass gav
TS6053 för genererade `.next/types` som bygget samtidigt ersatte. Det är en
verifieringskollision, inte belägg för ett fel i en produktfunktion.

## Kvar till ett ärligt skarpbevis

Underlag till den befintliga lanseringschecklistans ägare, inte nya go/no-go-regler:

1. Efter granskning och deploy: liten CSV på godkänt testföretag, kontrollera
   både kvitto och återläst kunddata; befintlig kund, ny kund, hoppa över och
   ogiltig rad. Prova båda UI-ytorna och mobil/desktop visuellt.
2. Prova en vald inkommande kanal hela vägen till rätt kund + lead/affär och
   synligt nästa steg. Kanalhälsans enhetstester ersätter inte det provet.
3. Kör den befintliga godkända fil-/tid-/tvåtenantresan mot aktuell release.
   Inspelning, riktiga telefoner och push kräver sina separata aktiveringsvillkor.
4. Bevisa fakturerings-/betalningskedjan med överenskomna testmottagare och
   korrekt sandbox/ekonomiskt underlag. Inget skarpt ekonomiskt objekt
   manipuleras för att skapa ett till synes lyckat test.

CSV-gränser kvar: API:t matchar befintliga kunder på **exakt telefonvärde**,
inte generell identitetsupplösning. Historiska `070…` kontra `+4670…`, import
utan telefon, olika flikars samtidiga anrop och omkörning efter timeout är
inte garanterat dubblettfria. Kundsidans telefonförhandsgranskning är separat
från onboardingens automappning. Stora filer är inte lasttestade; API:ts
befintliga tak 5 000 rader är inte ett uppmätt prestandalöfte. Använd små,
kontrollerade filer i första kunduppstarten.

## Ägargränser

Ingen ny onboarding-rail, agentmotor, Lars-funktion, serviceavtalsmodell eller
konkurrerande lanseringschecklista. Ingen ändring i `lib/fortnox/**`, agenternas
verkställighet, röstaktivering eller migrationsfiler. Befintliga ändringar i
artiklar, filmer, promptloggar och andra arbetsfiler har lämnats kvar orörda.

Den äldre `/api/customers/bulk` finns kvar; inga UI-anrop till den hittades
i `app/` eller `components/`. Konsolideringen här gäller de två granskade
CSV-ytorna, inte ett påstående om att alla historiska importsätt har tagits bort.
