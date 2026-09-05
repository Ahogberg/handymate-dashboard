# Leverans 2: offertpaketering och dagsavslut

Fortsättning på kundförberedelseplanen i PR #7. Denna branch utgår från main
och ändrar inte leverans 1, som Andreas lämnar till Claude.

## Omfattning

- [x] Paketjämförelse i create/edit-offert: Grund, Rekommenderat och Utökat
  byggs enbart av befintliga offert-/tillvalsrader. Hantverkaren väljer vad
  som hör till Rekommenderat. Samma kalkylmotor inklusive rabatter och moms.
  Täckningsbidrag visas bara när alla ingående kostnader är kända.
- [x] Val av nivå tillämpar tillvalens förval i det befintliga offertutkastet.
  Ingen ny spar-/sändväg. Kunden får fortfarande det befintliga offert-
  dokumentet med valbara tillval; tre exklusiva kundpaket kräver ett separat
  kundsigneringskontrakt och ingår inte i denna version.
- [x] Dagsavslut på projektets översikt: beskriv eller diktera dagens arbete,
  granska signerade förslag och bekräfta ett i taget via befintligt rapportläge.
  Separata kvitton för egen tid, intern anteckning, material och ÄTA-förslag.
- [x] Skydd för okänd bekräftelsetyp, fel projekt, dubbla klick, retry och
  partiell framgång. Datum/projekt låses under pågående rapport.
- [x] Tester, typkontroll, bygg och mobilgranskning.

## Gränser

Inga nya API-rutter, tabeller eller SQL-migrationer. Ingen annan persons tid,
returtransaktion, kunduppdatering eller faktura genom rapportläget: det
befintliga serverkontraktet tillåter inte dessa. Ingen tyst breddning.
Rösttranskribering är redigerbart textunderlag och skickas aldrig automatiskt.
Produktionsprov kräver autentiserat konto och konfigurerad modell/transkribering.

## Överlämning till granskare

- 89 riktade tester för paket, marginal och befintligt rapportkontrakt godkända.
- 6 Chromiumtester godkända: 375/1280 px, tillvalsförval, fel + retry med samma
  token, separata kvitton, diktering utan automatisk sändning samt avstådda
  förslag som inte följer med nästa rapport. API-svaren är simulerade i UI-testen.
- Typkontroll och produktionsbygg godkända. Befintliga byggvarningar om
  Sentry/metadata och externa miljöberoenden kvarstår; bygget är inte skarpprov.
- Mobil- och skrivbordsskärmbilder granskade; inget horisontellt överflöde.
- Inga databasändringar. Befintlig serverauth, signaturkontroll och idempotens
  används utan ändringar.

Före sammanslagning: prova inloggat med ett testprojekt och riktig modell.
Bekräfta tid, intern anteckning, material och ÄTA-förslag var för sig och läs
posterna från projektets befintliga vyer. Prova mikrofonbehörighet på fysisk
mobil. Spara/öppna offert efter paketval och kontrollera kundens vanliga tillvalsvy.
Dessa skarpa prov är inte utförda i denna miljö.
