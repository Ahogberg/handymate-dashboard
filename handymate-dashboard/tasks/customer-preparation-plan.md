# Kundförberedelse — byggplan 2026-09-05

## Mål och ordning fram till funktionslås 10 september

1. Guidat kundunderlag före offert: välj mall på kundkortet, skapa avgränsad
   länk, kunden svarar och bifogar bilder, hantverkaren granskar underlaget.
2. Kunduppgifter inför start: tillträde, materialval och praktiska förberedelser
   använder samma flöde, med önskat svarsdatum och separata statusar för kundens
   svar respektive hantverkarens granskning.
3. Offertpaketering: återanvänd offertalternativ och verkliga artikelpriser;
   kartlägg kalkylkopplingen före implementation. Inte del av denna PR.
4. Dagsavslut: återanvänd rapportläge och befintliga actions. Kartlägg native-
   appens kontrakt före implementation. Inte del av denna PR.

## Leverans 1–2

- [x] Datamodell med tenantbunden ägaråtkomst och tidsbegränsad separat kundlänk.
- [x] Två mallar: laddboxunderlag och förberedelse inför jobbstart.
- [x] Kundformulär med validering, bilder och ärligt sparat-kvitto.
- [x] Kundkort: skapa länk, läs svar/bilder, markera granskat eller återkalla.
- [x] Tester för obehörig åtkomst, felaktiga svar, dubbelsubmit och filgränser.
- [x] Typkontroll, bygg och mobil rendering.

## Avgränsningar

Länken delas av hantverkaren; skapad betyder inte skickad. Inga automatiska
SMS eller påminnelser i denna version. Kundens svar ändrar inte offert,
avtal, bokning eller projektstatus. Materialets tillgänglighet och teknisk
lämplighet måste bedömas av hantverkaren. Foton analyseras inte automatiskt.
Ingen AI-tolkning av mått, elsäkerhet eller pris. Underlaget är knutet till
kund och en uttrycklig arbetsbeskrivning/adress, aldrig gissad projektmatchning.

## Driftsättning

SQL-filen ska köras och verklig DB-/lagringsrundresa verifieras innan funktionen
markeras driftklar. Ingen Supabase-anslutning finns i denna arbetsmiljö.
Ägar-API begränsas till aktiv owner/admin. Kundlänken ger bara tillgång till
en förfrågan, löper ut efter 30 dagar och kan återkallas. RLS tillåter endast
service_role på nya tabellen och den privata bildbehållaren.

## Acceptans

Ägare A kan inte läsa/skapa/granska åt B. Ingen lyckad kundbekräftelse utan
sparat svar. Dubbel POST ändrar aldrig ett redan mottaget svar. Felaktiga
bilder avvisas före lagring. Läsfel visas som läsfel. Granskat betyder att
hantverkaren har granskat underlaget, inte att jobbet är tekniskt godkänt.

## Verifieringsresultat

- 17 exekverbara kontrakts-/routetester gröna med DB-/lagringsdubblar:
  `node --test tests/customer-preparation/*.test.mjs` (Node 24).
- 29 befintliga kontoraderingstester gröna.
- 8 befintliga schema-/ruttinventeringstester gröna; nya grindarna dokumenterade.
- Två Playwright-tester gröna mot verklig Next-sida vid 375 och 1280 px,
  med avlyssnade API-anrop: bevarade svar vid fel, lyckat kvitto och ingen
  horisontell överrullning. Mobilbilden visuellt granskad.
  `npx playwright test --config=playwright.preparation.config.ts`
- `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `npm run build`: exit 0 på slutliga koden. Befintliga metadata-/miljövarningar
  förekommer; ett grönt bygge bevisar inte produktionskonfigurationen.
- DB-migration, riktig storage-/RLS-rundresa, autentiserat kundkort och
  produktionsflöde återstår. Ingen produktion har ändrats.

## Driftsättningsprov efter migration

1. Kör `sql/v2_customer_preparation.sql` och kontrollera tabell, privat bucket
   samt restriktiv storage-policy. Befintliga kund-/företags-PK:n ska bekräftas
   innan körning (text enligt repo-källor, inte live-verifierat här).
2. Skapa från ägarkonto A, öppna länken i utloggad webbläsare, svara med bild.
3. Läs och granska på kundkortet; kontrollera att bilden kan öppnas.
4. Kontrollera owner B, employee A, utgången och återkallad länk.
5. Upprepa med jobbstartsmallen; svar ska inte ändra bokning eller pris.
6. Verifiera radering på isolerat testkonto och kontrollera att bilderna tas bort.

Kundlänkar ska inte skickas innan dessa prov är gröna. Tabellens mall-ID:n
är versionskontrakt: ändra inte befintliga fråge-ID:n retroaktivt.
