# Revenue OS v2 — leverans 1–4

Bas: 432a44c2cbd882a510411388c1c911d8f2537414. Strategi: ../../docs/strategy/HANDYMATE_REVENUE_OS.md.

## Plan
Återanvänd revenue_accounts/signals/activities och sales_case. Lägg till kontakter, säljbehörigheter via verifierad identitet/app_metadata, versionssäkra uppföljningsutkast och sessioner. Befintligt personligt case har API och onboardingförifyllning men saknar sida på /case/[token]; bygg den och en svensk intern genomgång. Stabil meeting_date sätts vid sessionsstart.

Säljaråtkomst: verifierad Supabase-användare, explicit intern behörighet (administratör eller revenue-medlemskap), aldrig user_metadata. Säljare ser egna konton, ledare alla; uppslag och skrivningar kontrollerar samma ägarskap. Ingen utökning av kundföretagsbehörighet. Nycklar stannar på servern.

Första källa: befintlig Platsbanken-parser. Hämtningsfel måste särskiljas från noll träffar. Begränsad import, organisationsnummer normaliseras och annons-ID dedupliceras. Annonskontakters personuppgifter följer inte med. Rekrytering är fakta; tillväxt och adminsmärta är hypoteser. Research och hook kan genereras deterministiskt från verifierade källor utan en ny modellintegration.

Uppföljning: loggad händelse + nästa aktivitet + eventuellt utkast sparas atomiskt med en request-id. Svar/nej/paus ogiltigförklarar tidigare utkast. Ingen automatisk stage-flytt. Ingen sändning eller bakgrundsaktivering ingår; godkända utkast kan kopieras för manuell sändning och verkligt utskick loggas separat. Följ upp från förfallodatum på kontot.

## Acceptans
- Företag → källbelagd research → kö → samtalsutfall → beständig genomgång → personligt case → onboardingförifyllning → uppföljning.
- Återförsök skapar inte dubbel aktivitet/session/case; fel är synliga.
- Anteckning räknas inte som kontakt, gammal kontakt flyttar inte tiden bakåt.
- Köprioritering sker före begränsning; pausade och avslutade konton utesluts.
- Andra säljares konton nekas i läs- och skrivvägar; vanliga kunder nekas.
- Mötesdatum ändras inte när kunden öppnar länken senare.
- Svar/nej/paus blockerar gamla uppföljningsutkast; godkännande är aldrig bevis på skickat.

## Levererat
- Säljarvy med kontakter, händelser, rollavgränsning, tydliga poängkomponenter och databasprioriterad kö före sidbegränsning.
- Platsbanken-hämtning på begäran, normaliserad orgnummer-deduplicering, annons-ID och källbelagda briefs. Providerfel syns i körningshistoriken; befintligt säljarägarskap och spärrlistan respekteras.
- Intern genomgång för fem smärtpunkter och publik /case/[token] som använder befintlig onboardingförifyllning. Mötesdatum skapas server-side i Europe/Stockholm. Varje publicering är en oföränderlig snapshot.
- Utkast och nästa steg från genomgången; standarduppföljning två kalenderdagar framåt kl. 09 svensk tid, framflyttad från helg till måndag. En redan framtida planerad tid behålls. Säljaren kan ändra datumet.
- Atomiska aktivitet/plan/utkast-övergångar, versionskontroll och återförsöksnycklar. Svar/nej/paus ogiltigförklarar tidigare utkast. Godkänt betyder aldrig skickat.

## Verifiering
- `npx tsc --noEmit`: exit 0.
- `RAYON_NUM_THREADS=1 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`: exit 0. Första försöket avbröts efter native worker-fel; reducerad parallellism löste det. Befintliga konfigurations-/metadata-varningar från andra rutter under statisk generering kvarstår.
- 16 verkliga SQL-scenarier i PGlite/PostgreSQL: dubbletter, återförsök, ägarskap, oföränderligt mötesdatum, versionskonflikter, paus/opt-out, svar, funktionsprivilegier och en förfallen rad bakom 300 högt prioriterade konton.
- 13 verkliga handler-/PostgreSQL-/onboardingförifyllningskontroller, plus separata identitets- och källtolkningsprov.
- 62 befintliga behörighets-/sales-case-kontrakt gröna.
- Browserprov mot verkliga React-komponenter, API-handlers och isolerad PostgreSQL: företag → kontakt → samtal → genomgång → case → omladdning → onboardinglänk → godkänt utkast → svar som stoppar utkastet → källimport. 375 och 1280 px; inga sidfel, inget horisontellt överflöde. Skärmbilder granskade. Browserharnessen ersätter Next-navigering, autentiseringsgränsen och extern Platsbanken-hämtning; detta är inte ett skarpt inloggningsprov.
- Supabase pktaqedooyzgvzwipslu: hela nya migrationen och kommandoövergångar provade i en rollback-transaktion, även med `SET LOCAL ROLE service_role`. Efterkontroll: migrationen återställd, noll kvarlämnade testkonton. `tests/revenue/live-rollback.sql` innehåller provblocket; kör det endast tillsammans med migrationsinnehållet i samma transaktion utan migrationens avslutande COMMIT.

## Aktivering och kvarvarande grindar
1. Granska PR och invänta CI. Kör `sql/v2_revenue_os.sql` före driftsättning av denna gren. V1-tabellerna och sales_case måste finnas.
2. Verifiera faktiska konton för Andreas och Christopher. Serververifierad, bekräftad @handymate.se/ADMIN_EMAILS behåller ledaråtkomst. Serveradministrerad `app_metadata.revenue_role` kan vara `seller`, `manager` eller `disabled`; explicit roll vinner över standarden. En säljare ser bara egna `owner_email`-konton. Inga användarroller har ändrats i detta arbete.
3. Inloggat prov i Next-preview med två säljaridentiteter och ledare. Granska ett sparat case i separat kundwebbläsare och bekräfta förifyllningen i onboarding. Betalsteg och kontoskapande ska fortfarande vara ordinarie flöde.
4. Verifiera ett verkligt Platsbanken-anrop från driftsmiljön. Kontrakt och felvägar är provade med fixture, men det externa live-anropet gick inte att verifiera i denna session.

Importen startas manuellt i v2. Ingen cron har aktiverats. Utkast godkänns/kopieras för manuell sändning och utfört utskick loggas separat; ingen e-post-/SMS-sändare eller automatisk inkorgskoppling ingår. Mottagna svar loggas av säljaren och stoppar utkast då. Den interna genomgången är en fungerande svensk grundupplevelse; Claude Designs fulla animerade prototyp är inte portad hit.

Ingen produktionsmigration, merge, ändrade roller eller verkliga utskick har gjorts.

## Publiceringsstatus

Implementation committad lokalt som 343a7217504c80cbad39dc6961be1b83010619e0 på codex/revenue-os-v2. Push stoppades av automatisk godkännandegranskning: intern implementation till offentlig GitHub-destination var inte uttryckligt godkänd. GitHub-metadata bekräftar att Ahogberg/handymate-dashboard är public och att den anslutna användaren har admin/push-rättigheter. Ingen alternativ publiceringsväg användes. Andreas har därefter uttryckligen godkänt offentlig push och draft-PR. Publicering återupptagen med detta godkännande; merge och produktionsaktivering ingår inte.
