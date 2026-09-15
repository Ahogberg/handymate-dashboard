# Revenue OS – användbar manuell säljar-V1

Arbete mot Ahogberg/handymate-dashboard, från main `4a334519`, på `codex/revenue-os-v1`.
Den här leveransen utökar den befintliga Revenue OS v2-koden till ett sammanhängande manuellt säljflöde. Namnet V1 beskriver användningsomfånget, inte en nedgradering av databasens tidigare v2.

## Kartläggning och prioritering

| Område | Befintligt vid start | Lucka och åtgärd |
| --- | --- | --- |
| Lead sourcing | Manuell registrering och Platsbanken-import med organisationsnummer-/annonsdeduplicering, körningshistorik och felhantering | Behållet och regressionstestat. Ingen ny dataleverantör ansluten. Treg saknar körbara connectorverktyg i denna session. |
| Enrichment | Kontaktpersoner med kontaktgrund och källa; underlag sammanfattat från signaler | Ny redigering av webbplats, bransch, ort, antal anställda och daterat kvalificeringsunderlag. Detta är säljarverifierad komplettering, inte automatisk företags- eller mejlverifiering. |
| ICP/scoring | Sex poängkolumner visades, men UI/API saknade kvalificeringsflöde. Research fyllde främst timingpoäng. | Ny server-/databasberäknad kvalificering med källa, datum, versionskontroll och historik. |
| Outreach | Samtalsunderlag, manuellt kontaktloggande och godkända uppföljningsutkast | Ny kontaktsekvens med granskat underlag per steg. Rättat osant tack-för-samtalet-utkast efter uteblivet svar. |
| Sekvenser | Saknades | Tre beständiga manuella steg med vald kontakt, datum, godkännande, faktiskt loggat utfall, automatiskt nästa datum och stoppregler. |
| Pipeline/CRM | Affärssteg, ägarskap och nästa aktivitet på revenue_accounts. revenue_opportunities finns i schema men saknar anslutet arbetsflöde. | Kontot förblir den gemensamma säljposten. Ny portföljexport för manuell CRM-import med stabilt id och kontaktspärr. Ingen extra parallell möjlighetspipeline skapad. |
| Uppföljning | Dagens kö, nästa aktivitet, utkast samt versions-/återförsöksskydd | Sekvensstegen skriver till samma kö. Rättat omvandling av säljarens lokala uppföljningstid till UTC innan API-anrop. |
| Mätning | Totalt, förfallet, saknad planering och vunna konton | Ny aggregerad pipeline, källa, kanal, kontakt/svar/möten senaste 30 dagar, aktiva sekvenser, okvalificerade och 14 dagars inaktivitet. |
| UI | Svensk företagslista, säljkö, sidopanel och genomgångssida | Kvalificeringsformulär, kontaktsekvens, pipeline-/utfallsvy och CRM-export tillagda i befintligt flöde. |

De viktigaste luckorna var saknade fungerande övergångar, inte markerade dummyknappar. De oanvända opportunity-tabellerna och avsaknaden av automatiska leverantörskopplingar ska inte presenteras som färdiga integrationer.

## Vad som byggts

### Kvalificering

- Bekräftat svenskt hantverks-/serviceföretag ger 15 poäng; 3–20 anställda ger ytterligare 10.
- Bekräftat administrationsbehov ger 20; bekräftad tillväxt 15; varm relation 10; bekräftad budget 10.
- Befintlig aktuell rekryteringssignal ger fortsatt 15 timingpoäng. Rekrytering fyller inte automatiskt behov eller tillväxt.
- Klienten skickar fakta, aldrig godtyckliga poäng. Källa/anteckning och datum krävs. Negativa personalantal, framtida datum och osäkra webbprotokoll avvisas.
- Uppdateringen sparas atomiskt med historik, versionsökning och ogiltigförklaring av tidigare granskade underlag. Den räknas inte som kundkontakt.
- Poängen är en arbetsprioritet och viktningen är en hypotes, inte en verifierad köpsannolikhet.

### Kontaktsekvens

1. Välj en kontakt med telefon och e-post, och en starttid.
2. Granska och kopiera underlaget. Ring och logga faktiskt utfall.
3. Vid inget svar planeras mejl efter två kalenderdagar kl. 09 i Europe/Stockholm; helg flyttas till måndag.
4. Granska mejlet, skicka manuellt i egen e-post och logga utfallet.
5. Vid inget svar planeras sista samtalet efter ytterligare tre kalenderdagar med samma helgregel.
6. Tredje kontaktförsöket avslutar sekvensen och tömmer den automatiska nästa aktiviteten.

Godkännande skapar aldrig en skickat-händelse. Framtida steg kan inte loggas som genomförda. Dubbelklick/återförsök skapar inte flera steg eller aktiviteter. Endast en aktiv sekvens får finnas per företag.

Svar, etablerad kontakt, avböjande, paus och opt-out stoppar sekvensen. Ändrat affärssteg, ansvarig eller egen nästa planering stoppar den också. Kontakt som loggas i det vanliga aktivitetsformuläret avbryter sekvensen; interna anteckningar gör det inte. Befintlig global spärrlista kontrolleras vid start, granskning och genomförande. Stoppade företag kan fortfarande kvalificeras och följas i historiken.

### Mätning och CRM

Alla mått beräknas över säljarens behöriga portfölj i databasen, inte de 50 synliga företagen. Kontaktmått bygger på loggade händelser. Antal vunna är nuvarande säljarbedömning och säger inte att betalning är verifierad. Källtabellen visar aktuell status, inte en historisk kohortkonvertering eller kausalt uppmätt effekt.

CRM-exporten innehåller id, namn, organisationsnummer, webbplats, bransch, ort, ansvarig, affärssteg, kontaktstatus, poäng, källa, nästa aktivitet, tid och uppdateringstid. Använd `id` som unik import-/uppdateringsnyckel. CSV-fält med möjliga kalkylbladsformler neutraliseras. Exporten har ingen sidbegränsning på 50; över 5 000 företag avvisas tydligt i stället för att tyst kapas. Det externa CRM:et behöver bevara kontaktspärrarna.

## Verifiering

- `npm run test:revenue-v2`: domän-/identitetsprov, 16 befintliga SQL-scenarier, 19 befintliga handler-/onboardingkontroller samt 34 nya handlerkontroller och ytterligare databasassertioner.
- De nya proven täcker kvalificeringspoäng, stale-version-konflikt, krav på underlag, granskat kontra faktiskt genomfört, hela trestegssekvensen, helgplanering, inga dubbla aktiviteter, svar/stopp/spärr, säljaravgränsning, export med mer än 50 rader, exporttak samt funktions-/tabellprivilegier.
- Hela projektets `tsc --noEmit` passerade med 12 GB tillåten Node-heap. Första körningen nådde standardgränsen 4 GB. Ett upptäckt typfel i datumomvandlingen rättades.
- 66 kontraktsprov passerade: column-contract, permission-contract och salj-case-overlamning.
- Webbläsarprov använder riktiga React-komponenter, API-handlers och isolerad PGlite/PostgreSQL. Det täcker kvalificering, sekvens, omladdning, befintlig genomgång/case/onboardinglänk, svar som stoppar utkast, fixturebaserad sourcing och CRM-nedladdning. Kontroller i 375 och 1280 px, utan sidfel eller horisontellt överflöde.
- `npm run build`: exit 0, kompilerat och alla sidor genererade. Kördes med RAYON_NUM_THREADS=1 och NEXT_PRIVATE_BUILD_WORKER=1. Första försöket blockerades av nätåtkomst till befintliga Google Fonts; omkörning med nätåtkomst lyckades. Bygget rapporterade befintliga Sentry-/dynamisk-rendering-varningar och en ENOSPC-varning vid skrivning av webpack-cache, men slutfördes. Projektets byggkonfiguration hoppar över typkontroll, varför separat grön tsc-körning är redovisad ovan.

Browserharnessen ersätter Next-navigering och den externa autentiseringsgränsen samt Platsbanken-anropet. Detta är inte ett skarpt inloggnings-, betalnings- eller leverantörsprov. Inga verkliga utskick gjordes.

## Aktivering och kvarvarande arbete

Före användning i en driftmiljö ska den nya migrationen `supabase/migrations/20260914213502_revenue_sales_workflow.sql` installeras och denna kod driftsättas tillsammans. Migrationen kräver Revenue v1, sales_case och Revenue v2 enligt filens första kommentar. Den är testad i isolerad PostgreSQL; ingen produktionsdatabas har ändrats här.

Kör ett inloggat acceptansprov i den valda miljön med intern säljledare och säljare: kvalificera ett testföretag, starta sekvens, logga ett försök, ladda om, logga svar och verifiera stopp. Kontrollera verklig Platsbanken-hämtning från samma miljö. Befintliga personers roller har inte ändrats.

Återstående integrationsluckor:

- Automatisk enrichment via Treg eller annan leverantör, inklusive beslutsfattare och mejlverifiering.
- Automatisk e-post-/SMS-sändning, inkorgssynk, bounce- och avregistreringswebhooks. I denna version måste säljaren logga svar och spärrar.
- Tvåvägssynk med ett namngivet externt CRM; nu finns en manuell export.
- Verifierad koppling mellan vunnen affär och kundens aktivering, abonnemang och betalning. Befintlig personlig case-länk förifyller onboarding men bevisar inte köp.
- Historiska stegövergångar, kohortkonvertering, ARR, offer/sekvens-A/B-test och automatiskt kalibrerade scoringvikter.
- Sourcing i bakgrunden, större batchimport och automatisk aktualisering av gamla företagsuppgifter.

V1 är avsiktligt ett manuellt founder-led försäljningsverktyg med beständig data och tydliga övergångar. Automatisk outreach och betalningsattribution ingår inte i leveransen.
