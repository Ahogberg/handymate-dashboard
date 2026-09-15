# Första jobbet, trygg överlämning och kundvärde V2/V3

2026-09-14. Beställt av Andreas: ”Ja bygg dem! Menar du V2 och V3 också?” Bygg och tester genomförs före pilot enligt den uttryckliga beställningen. Tidigare pilotberoende gäller fortsatt aktivering och verkligt bevis, inte implementation. Backend bygger på PR #75; native får en separat PR.

## Första verkliga jobbet

Arbetsprovet får ett servergenererat `first_work.id`, stabilt per företag. Start stämplas innan AI-anropet; förberedelse stämplas när underlaget är klart. Befintlig onboarding sparar underlag och referens. Offertbyggarens återställning bevarar referensen. Inklistring är inte samma sak som sparning: efter omladdning kan ett osparat underlag återanvändas. När offerten finns leder återgång till samma offert.

v244 kopplar offerten i samma databasskrivning som skapar offertposten. Tenant-FK och unikindex förhindrar dubbla offerter efter samtidig sparning/okänd respons. Servern returnerar befintligt offert-id vid konflikt; klienten öppnar det och behåller lokala återställningsdata. Raderad offert rensar länk och utskickstid, så en omstart inte ärver ett falskt utskick. Kontoradering tar bort metadata efter offerterna.

Första registrerade utskick stämplas av triggern när `quotes.sent_at` skrivs av befintlig sändväg. Kvittot säger ”registrerad som skickad”, inte mottaget/läst. Mätningen är förfluten tid inklusive väntan/pauser, inte arbetstidsbesparing. Nästa steg, väntande beslut och bevakning läses från den befintliga handoff-rutten; inga extra automatiska utskick införs. Webb och native visar samma kvitto. Ett ännu osparat underlag öppnas i webbens befintliga offertbyggare från mobilen.

## V2: beslutat implementationsfacit för granskning

`value-ledger` körs via befintlig C3-lease och cron. Dess enda effekt är RPC:n `record_value_money_event(business_id,event_id)`. SQL hämtar tenant, källa, faktura, komponent, valuta och belopp från kernel. Finansiella skrivningar och observationer delar företagets advisory lock. Det finns inga klientbelopp eller sändanrop i konsumenten.

- `invoice_issued` i värdeloggen bevarar ursprungligt fakturabelopp och kanoniskt event-id.
- `payment_received` är en historisk kundavräkningskontrollpunkt, rekonstruerad vid källhändelsens sekvens även vid fördröjd konsumtion. Kontrollpunkterna summeras aldrig som nya inbetalningar.
- `money_state_observed` är en oföränderlig observation av nuvarande tillstånd: utfärdat belopp, krediterat nettobelopp, kundallokeringar och betalningstid. Läsaren tar senaste observation per faktura.
- Fakturerat är ursprungligt fakturabelopp minus riktiga kreditjusteringar. Helt krediterade fakturor lämnar dagens penningsteg, som i den tidigare läsaren. Historiken finns kvar.
- Betalt kräver avräknad kundfordran och faktiska aktiva kundallokeringar. Betalt begränsas till fakturans nettobelopp. Delbetalningar på öppen fordran visas på raden men läggs inte i slutbetalt. ROT:s myndighetsdel är inte kundbetalning. Överbetalning som inte allokerats räknas inte.
- Avrundning kan slutföra kundfordran men skapar ingen betalning. Avskrivning och kredit skapar ingen kontant betalning. Återförd allokering tas bort från dagens betalningsbevis.
- Fristående `payment_settled` kvitteras utan fakturapåstående tills en verklig allokering ger fakturakopplingen. Detta fungerar även utanför fasaden.
- Nuvarande kreditväg är `receivable_adjusted`. Framtida separata `invoice_credited`, `payment_refunded` och `payment_disputed` kräver en granskad kanonisk mappning; konsumenten stoppar på dem i stället för att kvittera bort okända monetära förändringar.

Idempotensnyckeln innehåller kanoniskt event-id. En krasch efter värdeskrivning men före C3-ack ger ingen dubbelpost. Betalningsbryggan och utskickaren går före värdeprojektionen inom tidsbudgeten. Fel i värdekonsumentens transport stoppar inte betalningsbryggan/utskickaren. Uttömda försök syns i samma superadminvy, med manuell återupptagning och obligatoriskt loggat skäl.

`VALUE_KERNEL_EVENTS_ENABLED=true` växlar enbart företag med `financial_kernel_enabled=true`. Övriga behåller fakturaprojektionen. Kernel-företag får aldrig fallback vid fel, halt, eftersläpning eller saknat utfärdandebevis. Kända outställda utkast exkluderas. Uppdelade läsningar och hela Impact-läsningen måste ha samma finansiella sekvens. Nya pengaposter kan inte direktläsas via V1:s medlemspolicy; owner/admin-API:t är visningsvägen.

## V3: samma kontrakt, olika klienter

`GET /api/dashboard/impact` kräver verifierad ägare/admin, samtliga tre värdeflaggor och företagets kernel-flagga. Svar är `no-store`; ofullständigt underlag ger 503 och återförsök. Kontraktet innehåller version, företag, kontrolltid, SEK, period, källa och de befintliga ledger-/vecko-/månadskvittona. Ingen ny beloppshärledning görs av UI.

- Fyrastegsvyn följer månadens kortkohort genom senare händelser. Identifierat/agerat bygger på förslagets underlag; fakturerat/betalt på kernel.
- Veckan är rullande sju dagar; månadskvittot följer händelser inom UTC-kalendermånaden. De summeras aldrig med varandra eller med kohortens steg.
- Uppmätt genomloppstid och uppskattad besparing är separata. Agent och dagar till utfall visas från befintliga kvittorader.
- Fakturabevis öppnas i respektive klient. Historiska godkännandekort öppnas med exakt kortankare i webben även från native; den mobila godkännandekön visar bara väntande kort och används inte som falsk historiklänk.
- Webbens session är nycklad per företag/användare, mobilens per verifierad användare. Gamla svar avbryts/ignoreras efter byte eller avmontering. Fokus återläser underlag. Behörighetstapp döljer vyn.

PR #75 har redan ersatt agentsidans gamla schablonwidget med veckokvittot. Aktiverade företag får länken vidare till hela Impact; native har ett fyrastegskort och en detaljsida över samma API.

## Verifiering och återstående grindar

Lokala prov omfattar riktig SQL under icke-superuser-migrationsägare, medlemstriggers/RLS, C3 före-ack-replay, ROT, delbetalning, kredit, reversal, avrundning/avskrivning, felaktig tenant, felande läsare, kontoradering samt riktiga React-komponenters återupptagning och nätverksfel. Native använder riktiga komponenter med mockade plattforms-/nätverksgränser och validerar samma API-kontrakt. Slutliga antal, byggresultat och CI-huvuden dokumenteras i PR:erna.

Ingen produktions-SQL, flaggändring eller verklig kundkommunikation ingår här. v239 → v240 → v242 och C6-pilot kvarstår; V1:s v241, gallrings-/anonymiseringsbeslut, företagsvis backfill och metodjämförelse kvarstår. v245 tillkommer för V2. v244 och `FIRST_WORK_ENABLED` kan aktiveras separat när produktflödet är godkänt. V3 kräver `VALUE_EVENTS_ENABLED`, `VALUE_KERNEL_EVENTS_ENABLED` och `VALUE_IMPACT_ENABLED` samt företagsflaggan.

Innan V2-piloten aktiveras: jämför legacyfacit med kernel för pilotens faktiska fakturor, säkerställ initial konsumentupphämtning och hantera äldre utfärdade fakturor utan kanonisk historik. De får inte tyst räknas bort. Ingen historisk registrerad betalning konverteras automatiskt här.

Ett verkligt första-jobbet-prov återstår: namngivet företag, faktisk förfrågan, granskad offert, godkänd sändning och underlagslänk. Rapportera även misslyckanden och tider över 15 minuter. Fixtures, Expo-export och lokala tester bevisar inte en produktionsresa eller uppnått tidsmål. Kontaktanslutningarna fortsätter i PR #69.

## Review #77 — B1, M2 och LOW (2026-09-15)
M1 är rättad på #75 och samma komponenträttning med fyra prov finns även här; ombasering mot main återstår tills Claude mergat #75. V2-filen heter nu `v245_value_money_events.sql`, med oförändrat SQL-innehåll; v243 är redan upptaget av `v243_value_trigger_wrappers_private.sql` i #76. H3a/H4 i #78 flyttas därför till v246. Testreferenser och filundantaget i event-kontraktet följer namnbytet.

`usesKernelValue` behandlar saknad företagskonfiguration som avstängd; läsfel förblir fel. Piloten ska räkna med upp till tio minuters eftersläpning efter en pengahändelse: under tiden vägrar läsaren belopp. UI-förtydligandet ”uppdateras strax” kvarstår som LOW; inga fel får döljas som noll eller ersättas med legacy-belopp.

Runbook vid halt: kontrollera konsumenten `value-ledger` i `/api/admin/financial-kernel/consumers`. Rätta eller implementera den saknade kanoniska mappningen först; återuppta därefter via `POST /api/admin/financial-kernel/consumers/resume` med `business_id`, `consumer: "value-ledger"` och loggat `reason`. Återuppta aldrig för att kringgå en okänd kredit, återbetalning eller tvist. #76:s paketlogg sammanfogas av Claude enligt granskningsöverlämningen.
