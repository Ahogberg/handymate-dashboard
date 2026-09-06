# Jobbtyper och standardrader — granskningsunderlag

Bygger på PR #13 (`codex/first-value-journey`). Separat tillägg; retargeta till main när #13 landat. Ingen ny SQL-migration.

## Resultat

- Åtta befintliga branscher har 10–12 konkreta jobbförslag. Äldre namn och slugs ändras inte. Egen jobbtyp kan skapas direkt i branschvalet och senare i inställningarna.
- Onboardingval skapar riktiga, företagsavgränsade `job_types`. Återförsök skapar inte dubbletter och arkiverade jobb återaktiveras inte. Steget går vidare först efter kvitterad sparning. Ett återupptaget artikelsteg kan reparera kopplingen från sparade onboardingval.
- Samma standardredigerare i onboarding och Inställningar → Jobbtyper: välj jobb, lägg till artikel, skapa egen artikel, ange standardmängd och eget artikelpris. Ingen gräns på tre valda jobb. 3–5 nyckelartiklar är en rekommendation, aldrig en grind.
- Befintliga offertmallar används under ytan. Första tomma standarden har ett deterministiskt id per jobb. Befintliga mallar och varianter kan fortfarande väljas uttryckligen. Den befintliga mallkvoten gäller även nya standarder.
- Mängd hör till jobbets standard. Pris uppdaterar företagets gemensamma artikel (tydligt märkt i gränssnittet), inklusive ören i den nya redigeraren.
- Från artikelsteget kan användaren öppna första offerten via samma verifiering, finalize och offertstart som tidigare. Ingenting skickas till kunden.
- Från offertens befintliga Spara som mall-dialog kan ägare/admin uttryckligen välja artikelrader att spara som standard. Befintliga standardrader ersätts bara efter denna synliga varning och ett aktivt sparval. Kundtext, offertpris, rabatt, betalplan och villkor kopieras inte. Tillval är avmarkerade och blir vanliga rader endast om användaren väljer dem.

## Dataintegritet

- POST på befintliga `/api/job-types/quote-setup` kräver autentisering och ägare/admin. Företaget härleds från sessionen. Jobbtyp, mall och aktiv artikel kontrolleras per företag.
- Servern tar artikel-id och mängd, aldrig kundstyrda priser/avdragsfält i standardrader. Artikeluppgifter hämtas från registret.
- Standardredigerarens ändringar i befintliga mallar använder `updated_at` som versionsvillkor i själva UPDATE-satsen. Versionen ändras även när två skrivningar sker inom samma millisekund. En gammal flik får 409 och måste läsa in igen.
- Mängd-/borttagningsändringar bevarar andra rader och samtliga övriga mallfält.
- Nya standardrader märks i mallens befintliga JSON. Vid läsning hydreras just dessa rader via samma `applyProductToItem` som manuellt artikelval: aktuellt artikelpris, inköpspris, komponenter, arbetsandel och ROT/RUT-fält. Läsfel stoppar i stället för att skapa tom kalkyl.
- Befintliga offerter skrivs aldrig om. Artikelreferensen följer ordinarie mallstart och reservationsförslag. Affärens jobbtyp ärvs av befintlig offert-/projektkod; ingen ny affärs- eller projektväg introduceras.
- Gamla omärkta mallrader behåller sin tidigare läsväg. Befintliga mallar med flera varianter kräver fortfarande ett val; ingen dold omkoppling till en ny standard.

## Verifiering

- `tests/job-standards.spec.ts`: PostgreSQL via PGlite, med tabell-DDL ur befintliga migrationsfiler och den riktiga v187-kopplingen. Provar återförsök, dubbletter, två skrivare, främmande artikel, ogiltiga mängder, kvot, läsfel, radbevarande och offertstart med artikelns kalkyl.
- `tests/job-standards.ui.spec.ts`: riktiga React-komponenter, CSS och ikoner i Chromium vid 375×812 och 1280×900. API-anrop avlyssnas och går till riktiga serverfunktioner mot isolerad PostgreSQL. Provar misslyckat jobbval + återförsök, egen jobbtyp, standardrader, mängd, decimalpris, skapad egen artikel och explicit återanvändning från offert. Det är INTE ett inloggat prov mot Supabase/AI.
- Båda sviterna har npm-kommandon och CI. Webbläsarprovet har en separat workflow; kontraktsgrinden förblir browserlös.
- Bilder i `docs/design/job-standards/` visar verkliga komponenter med exempeldata.

Slutresultat lokalt: **1 152 kontraktstester gröna**, inklusive de **12 nya PostgreSQL-proven**. **2/2 jobb-/artikelresor i Chromium gröna**, vid 375×812 och 1280×900. Separat **tsc rent** och **produktionsbygge exit 0**. PR #13:s mobilfix har dessutom 2/2 egna webbläsarprov för alla fem tipssteg och toasten; ligger i basgrenen.

## Kvar före merge/deploy

Inloggat prov mot demo-Supabase: nytt eller återupptaget konto → välj jobb/egen jobbtyp → spara standard → skapa affär med samma jobbtyp → skapa offert → granska priser, kalkyl och reservationsförslag → spara och öppna igen. Ändra därefter standarden och bekräfta att den gamla offerten är oförändrad och den nya får ändringen. Kontrollera också att en vanlig medarbetare inte kan ändra standarder. Inga produktionsskrivningar, utskick eller migrationer har gjorts i denna leverans.
