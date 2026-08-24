# Handymate Launch Desk V1

Launch Desk är Handymates interna arbetsyta för personlig lanseringskontakt.
Den finns under `/admin/launch`, är endast tillgänglig för superadmins och är
avsiktligt separerad från kundernas lead- och kampanjfunktioner.

## Vad den gör

- importerar högst 500 källmärkta företagsrader per CSV;
- beräknar en deterministisk fit-poäng för arbetsprioritering;
- rekommenderar bara en kanal när bolagsform och kontaktkälla klarar den
  konservativa kanalgrinden;
- förbereder ett källbundet AI-utkast efter ett manuellt klick;
- visar en daglig arbetskö med daterade nästa steg;
- bokför verkliga kontaktutfall atomiskt;
- spärrar organisationsnummer och kontaktuppgifter mot framtida importer;
- visar tratten som separata steg: kontaktad, svar, möte, demo, erbjudande,
  vunnen kund.

## Vad den inte gör

- skickar inte SMS, e-post, brev eller LinkedIn-meddelanden;
- skrapar inte kataloger eller sociala nätverk;
- gör inte dold research;
- påstår inte att fit-poäng innebär köpvilja;
- återanvänder inte `leads`, `leads_outbound` eller kundernas CRM-data;
- avgör inte slutgiltigt vad lagen tillåter i ett enskilt fall.

## Dataskyddskontrakt

All lagring har ändamålet `handymate_b2b_launch`. Varje rad kräver källa och
kontrolldatum. Kontaktgrunden mappas till inkommande förfrågan, befintlig
relation eller berättigat intresse. Vid berättigat intresse måste den faktiska
kontakten fortfarande vara relevant, proportionerlig och enkelt kunna
avböjas.

All kall kontakt till enskild, okänd eller oklassad bolagsform blockeras i V1.
De kan bara öppnas genom en dokumenterad varm, inkommande eller
kundrefererad kontaktgrund. SMS finns inte som kanal. Ett “kontakta mig inte”
skapar en central minimispärr och släcker alla framtida kanaler. Importen
kontrollerar spärren före varje insert.

Personuppgifter hålls utanför AI-snapshoten så långt det går: modellen får
kontaktens namn, yrkesroll och kontaktgrund men inte e-postadress eller
telefonnummer. Varje konto får en datagranskning 180 dagar efter källans
kontrolldatum. Då ska raden uppdateras, spärras eller tas bort enligt den
faktiska relationen och dokumenterade behovet.

## Aktivering

1. Granska `sql/v166_launch_desk.sql`.
2. Kör migrationen manuellt i Supabase SQL Editor.
3. Verifiera att `authenticated`, `anon` och `PUBLIC` saknar grants på samtliga
   `gtm_*`-tabeller och funktioner.
4. Öppna Admin → Launch Desk.
5. Ladda ned CSV-mallen och importera en liten verifierad pilotlista först.

## Daglig rutin

1. Öppna kontot med högst prioritet.
2. Kontrollera källa, bolagsform, kontaktgrund och fit-skäl.
3. Förbered underlaget och kontrollera varje formulering mot källan.
4. Kontakta manuellt i vald kanal.
5. Logga utfallet och nästa daterade steg direkt.
6. Spärra om personen avböjer, är fel mottagare eller om grunden är oklar.

## Verifiering

`tests/launch-desk.spec.ts` facit-låser superadmin-auth, service-role-only
lagring, källkrav, kanalgrind, importtak, central spärr, atomiskt utfall,
separerad tratt och att ingen sändleverantör finns i modulen.
