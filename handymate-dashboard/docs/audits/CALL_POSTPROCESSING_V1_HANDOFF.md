# Samtalsefterarbete V1 — överlämning 2026-08-30

Status: implementerat lokalt i dashboard + Expo-mobilappen. Inte deployat,
inte committat i detta pass. **v180 är skriven men inte körd. Ingen skarp
gallring, inspelning eller testsändning har aktiverats.**

## Vad leveransen innehåller

1. **Ingen gissning av affär.** Samtalsanalysen får inte längre välja kundens
   senaste affär och flytta den till vunnen/förlorad. Den föreslår granskning.
   Kvalificerade nya förfrågningar använder fortsatt befintlig Golden Path.
   Befintliga kunduppgifter skrivs inte över med modellens extraktion.
2. **En beständig samtalsrad.** `call_recording.recording_id` är navet, inte
   ett nytt samtalsregister. Leverantörens call-id ger deterministiskt id vid
   nyregistrering. Befintliga call-id-kopplingar återanvänds.
3. **Atomisk publicering av förslag.** `manage_call_processing` låser raden,
   sparar extraktionen och publicerar hela kortbatchen i en transaktion.
   Stabila kort-id:n gör återförsök idempotenta. Ett redan godkänt/utfört kort
   uppdateras aldrig av en ny analys. En misslyckad pipeline ger synligt
   delresultat, inte falskt klart.
4. **Gemensamt läsutfall.** `lib/voice/call-outcome.ts` skiljer Registrerat,
   Behöver ditt beslut, Kunde inte utföras och Övrigt. Verkställighetsresultat
   med artefakt-id krävs för utfört. Godkänd status/modelltext räcker inte.
   Offertutkast är inte en skickad offert; uppföljningsuppgift är inte SMS.
5. **Webb + mobil.** `/dashboard/recordings/[id]` och befintlig inspelningsvy
   visar samma utfall. Expo har `/calls/[id]`, säker push-djuplänk och
   inspelningsfiltrerad godkännandekö. Inga nya godkänn/avvisa-flöden byggs.
   Mobilen återanvänder API:ets härledning; ingen andra agentmotor.
6. **Projektkoppling väljs uttryckligen.** Webbvyn listar enbart kundens projekt
   i rätt företag. API och databas validerar relationen. Kundens befintliga
   tidslinje får projektmetadata från samtalsraden. Detta är inte en ny
   `project_log`-skrivare eller automatisk AI-matchning. Expo-vyn har ännu
   ingen projektväljare; kopplingen görs i webben/PWA:n.
7. **En diskret push efter lagrade kort.** Telefonkortets låsskärmstext saknar
   namn, telefonnummer och sammanfattning. Den går till verifierad mottagare;
   ingen fallback till hela företaget. Befintligt push-/frånvarosystem återanvänds.
8. **Gallringskod, avstängd.** Befintlig maintenance-cron anropar en begränsad
   sweep bara när global flagga OCH företagets kompletta policy är satta.
   Lokala ljudpekare kan rensas efter transkribering. Råtranskript, alias,
   analyscache och råtext i härledda förslagskort rensas efter 30 dagar enligt
   det föreslagna produktvalet. Bekräftade affärshandlingar behåller egna
   lagringsregler. Innehållsfri audit skrivs. Platsbesök omfattas inte.

## Säkra kanter och begränsningar

- `v180` ger service-role-only RPC:er, ägarlåsta bearbetningsfält och kontroll
  även i databasen av projektets företag/kund. Ett raderat råunderlag kan inte
  återfyllas av en gammal editor eller försenad callback.
- Transkriptredigering tillåts före bearbetning, inte efter startad analys.
  Annars skulle en cache/förslagsbatch kunna avse annan text än användaren ser.
  Omprövning av redan publicerade förslag är separat arbete, inte blind retry.
- Äldre samtal med gamla kort flaggas för manuell granskning. Ett enda gammalt
  kort räknas inte som bevis på komplett batch; ingen massåterkörning sker.
- Publiceringen är atomisk. **Hela samtal → Golden Path → push är inte en
  enda transaktion.** En tidigare delvis skapad lead utan affär ger fel som
  måste utredas; systemet gissar inte fram en ersättningsaffär.
- Analys kan kompletteras från samtalsvyn och vid ny leverantörscallback.
  Detta är inte en ny bakgrundskö med garanterad automatisk återleverans.
- Pushfältet `notified_at` avser ett reserverat **sändförsök**, inte ett
  leveranskvitto. Dubbletter undertrycks, men en krasch efter reservation kan
  innebära utebliven push. Utfallet finns fortfarande i samtalsvyn. Riktig
  leverans/retry för push kräver separat kvitteringsmekanik om det blir ett krav.
- Den gamla generiska DELETE-rutten kontrollerar nu ägarskap före barnradering
  och vägrar hårdradera telefonraden. Att ta bort en rad raderar inte ljudet
  hos leverantören och skulle tillåta callback-återskapande. Begäran om tidigare
  fullständig radering måste hanteras av support med verifierad leverantörsrutin.
- Manuella analys-/transkript-/projektåtgärder kräver owner/admin och tillåts
  inte genom impersonering. Handymate-interna callbacks behåller intern auth.
- Inspelning gäller samtal genom Handymates telefonnummer/vidarekoppling, inte
  valfria samtal i telefonens vanliga uppringningsapp.
- Telefonnummer är ett uppslag, inte autentisering av den som talar. Ingen
  kund får ett godkännandemandat bara för att caller-ID matchar kundregistret.

## Aktiveringsordning — Claude/Andreas

1. Granska diffen i de två reporna och integrera med Claudes senaste ändringar.
   Orelaterade marketingfiler ska inte tas med av misstag.
2. **Kör `sql/v180_call_processing_and_retention.sql` manuellt i Supabase SQL
   Editor före nästa deploy av samtalsefterarbetet.** Migrationen raderar inget
   och aktiverar ingen policy. Kontrollera funktioner, grants och trigger efteråt.
3. Deploya dashboardkoden. Bygg/distribuera även Expo-appen för den nya native
   pushdjuplänken. Webben/PWA:n kräver inte Expo-release.
4. Verifiera inspelningsinformation, rättslig grund, ansvarsfördelning och
   lagringspolicy. 30 dagar är ett produktförslag, **inte en GDPR-gräns eller
   ett juridiskt godkännande**. Spelad information är inte bevis på samtycke.
5. Verifiera verklig radering/maximal lagring hos 46elks och AI-underbiträden,
   inklusive relevanta loggar/backupkopior. Leverantörens “minst 72 timmar”
   säger inget om när alla kopior slutligt försvinner. Ingen odokumenterad
   DELETE-endpoint har hittats på eller implementerats.
6. Först efter dessa beslut: sätt `CALL_RECORDING_POLICY_APPROVED=true`,
   `CALL_RECORDING_PROVIDER_RETENTION_VERIFIED=true` och
   `CALL_RECORDING_NOTICE_URL` till den godkända, testade HTTPS-ljudfilen.
   Företagets `call_recording_enabled` måste också vara true.
   Utan dessa villkor vidarekopplas samtalet **utan inspelning**.
7. Testa IVR: ljudet kan inte hoppas över; endast explicit `result=ok` på
   leverantörens playback-callback får slå på `recordcall`. Vid misslyckad
   uppspelning kopplas samtalet vidare utan inspelning. Bekräfta detta med
   riktiga telefoner — en mock bevisar inte operatörens beteende.
8. Gallring aktiveras separat: `CALL_RETENTION_ENABLED=true` plus följande
   `business_preferences`-värde för ett uttryckligen valt testföretag.
   `value` är TEXT i skarp databas: lagra JSON-strängen, inte en antagen JSONB.

```json
{
  "enabled": true,
  "transcript_days": 30,
  "legal_review_ref": "referens-till-godkänt-policybeslut",
  "provider_deletion_ref": "referens-till-verifierad-leverantörsrutin"
}
```

Nyckeln är `call_retention_policy`. Exemplet ovan är formatdokumentation,
inte en godkänd policy och ska inte kopieras som ett godkännande.
Ingen konflikt med `business_config.data_retention_days` är dold: det äldre
generella fältet används inte som implicit aktivering av denna nya telefonpolicy.

## Verifiering i detta pass

- Live-schema läst med `information_schema` via Supabase. Ingen produktionsmigration
  körd, inga kunduppgifter ändrade, inga utgående provmeddelanden.
- `scripts/verify-call-processing-sql.mjs`: 29 gröna kontroller i isolerad
  PGlite/PostgreSQL med syntetiska data. Migrationen kompilerar; tenantspärr,
  rollspärr, lås, rollback, retry, granskade kort, gallring och tombstones testas.
  **Detta är inte ett skarpbevis av att migrationen finns i Supabase.**
- Browserlösa dashboardfacit: 289 gröna tester i relevanta nya och befintliga
  kontrakt, inklusive riktiga route-handlers med explicita I/O-dubblar.
- Expo: TypeScript rent, 17 Jest-sviter / 112 tester gröna.
- Dashboard: TypeScript exit 0, produktionsbuild exit 0. Builden loggar även
  miljö-/metadata-/cachevarningar; de ska inte förväxlas med skarp verifiering.
  Inte hela den sessions-/produktionsberoende sviten kördes.
- Faktiska webbvyns komponent visuellt granskad vid 390 px med syntetiskt
  fixture: ingen horisontell overflow, tydligt åtskilda status-/retryknappar.
  Ingen autentiserad helapp-/telefon-/pushleverans har påståtts skarpbevisad.

### Omkörning lokalt

```powershell
npx tsc --noEmit
npx next build
npx playwright test tests/call-outcome.spec.ts tests/call-routes.spec.ts tests/voice-boundaries.spec.ts tests/column-contract.spec.ts tests/absence-push-gate.spec.ts tests/decision-record.spec.ts tests/customer-facts.spec.ts tests/facit-ai-kostnad-sanning.spec.ts tests/bransle-matare.spec.ts tests/motesassistenten.spec.ts tests/push-target-user.spec.ts tests/promise-deadlines.spec.ts tests/samtalsvagen.spec.ts --no-deps --project=chromium --reporter=list
node scripts/verify-call-processing-sql.mjs
```

SQL-testet använder temporär `@electric-sql/pglite` under `tmp/call-sql-test`
(installationskommando i skripthuvudet). Projektets dependencies ändrades inte.

### Skarp acceptans efter godkända grindar

Använd två uttryckligen avsedda testföretag och ett riktigt inkommande samtal.
Verifiera besvarat samtal med information → inspelning → transkript → batch →
push → exakt samtalsvy → godkänt offertutkast/uppgift → korrekt kvitto.
Kontrollera även missat samtal → befintlig SMS-väg, playback-fel utan inspelning,
fel tenant, fel roll, dubbel callback, fel under publicering, retry utan
dubbletter samt utgånget råunderlag. Bekräfta native djuplänk på riktig enhet.
Aktivera inte gallring brett innan ett kontrollerat test visar radering hos
samtliga relevanta lagringsparter, inte bara null i Handymates URL-kolumn.

## Källor för aktiveringsbeslutet

- [IMY: Hur länge får vi spara uppgifter?](https://www.imy.se/vanliga-fragor-och-svar/hur-lange-far-vi-spara-uppgifter/)
- [IMY: Samtycke](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/samtycke/)
- [46elks: play](https://46elks.se/docs/voice-play)
- [46elks: frågor och svar](https://46elks.com/faq)
- [46elks: hämta inspelning](https://46elks.com/docs/get-recording-id)

Källorna kontrollerades 2026-08-30. De ersätter inte granskning av ert faktiska
ändamål, informationsmanus eller personuppgiftsbiträdesavtal.
