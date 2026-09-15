# Revenue OS – tilldelade partnerleads

Byggt som en fortsättning på den manuella Revenue OS-versionen på `codex/revenue-os-v1`.

## Användarflöde

1. En säljledare öppnar ett företag i Revenue OS och väljer **Dela lead med partner**.
2. Välj en aktiv partner med accepterat partneravtal och en befintlig kontakt med telefon eller e-post.
3. Granska förhandsvisningen och skriv underlaget som partnern ska få. Tryck **Tilldela lead till partner**.
4. Leaden visas i **Leads från Handymate** överst i partnerportalen och på den egna sidan `/partners/leads`.
5. Partnern kan acceptera eller avböja. Efter acceptans kan partnern rapportera kontakt, bokat möte, vunnen eller förlorad affär, skriva återkoppling och planera nästa aktivitet.
6. Säljledaren ser status, återkoppling och nästa aktivitet i företagets partnersektion. **Hämta partnerstatus** uppdaterar vyn.
7. Säljledaren kan återkalla tilldelningen. Den försvinner då från partnerns läs-API och portal vid nästa hämtning. Därefter kan leaden tilldelas en annan partner. Avböjda leads återlämnas på samma sätt och döljs i partnerns aktiva leadsvy.

## Informationsdelning och behörigheter

- En lead har högst en aktiv partner åt gången. Samma företag kan därför inte delas ut parallellt av två administratörer.
- Partnern får en sparad kopia av företagsnamn, organisationsnummer, ort, bransch, webbplats, vald kontakts namn/roll/mejl/telefon/källänk samt det uttryckligen skrivna partnerunderlaget.
- Interna anteckningar, research, poäng, säljidentiteter och andra partners följer inte med i partnerns API-svar.
- Adminrutterna använder befintlig verifierad Revenue-identitet och kräver säljledarbehörighet. Partnerns id hämtas från den befintliga partnerinloggningen, aldrig från POST-innehållet.
- Partnerstatus och gällande avtalsversion kontrolleras även i databasfunktionerna. Inaktiverade partners eller partners utan gällande avtal kan inte agera.
- Pausade, spärrade och avslutade Revenue-konton lämnas inte ut för bearbetning. Befintliga företags-/mejl-/telefonspärrar respekteras vid tilldelning, läsning och partneruppdatering.
- Återkallad tilldelning blockerar nya uppdateringar och återförsök av en tidigare partneråtgärd. Ingen funktion skickar mejl eller SMS automatiskt.

## Beständighet och samordning

Tilldelningar, partnerhändelser och återförsöksnycklar sparas i egna tabeller med RLS och åtkomst endast för serverns service role. Partnergränssnittet har en explicit projektion och paginering, 50 leads per sida. Denna sida använder samma inloggning som partnerportalen.

Skrivningar är atomiska. Versionskontroll skyddar mot gamla formulär, och återförsök skapar inte dubbla tilldelningar eller händelser. Vid tilldelning stoppas företagets aktiva interna kontaktsekvens och aktuella uppföljningsutkast ogiltigförklaras. En ny intern sekvens kan inte startas medan en partner aktivt hanterar leaden.

Partnerns rapporterade vunnen-status skapar ingen referral, inget kundkonto, ingen betalning och ingen provision. Det ordinarie partnerprogrammet hanterar attribution och betalning. Revenue-kontots affärssteg ändras inte automatiskt av partnern; säljledaren kan granska utfallet.

## Verifierat

- 31 nya API-/databaskontroller och ytterligare assertioner: säljledarbehörighet, partner A/B-isolering, accepterat avtal, inaktivering, tilldelning, acceptans, avböjande, kontakt, vunnen, återkallning, återtilldelning, versionskonflikt, återförsök, spärrar, avslutade konton, CSRF-ursprung, interna sekvensstopp, historik, privata tabeller/funktioner och paginering över 50 leads.
- Befintlig Revenue-svit passerar inklusive 16 SQL-scenarier, 19 handler-/onboardingkontroller, 34 säljarflödeskontroller samt domän- och identitetsprov.
- 55 befintliga kolumn-, behörighets- och partner-launch-gate-kontrakt passerar.
- Hela projektets TypeScript-kontroll passerar.
- Webbläsarprov med riktiga komponenter, API-handlers och isolerad PostgreSQL: tilldelning i admin → partner accepterar → partner loggar kontakt → omladdning behåller status → admin ser återkoppling → återkallning → partnerns lead försvinner. Den tidigare Revenue-rundresan och CRM-exporten passerar också.
- Mobilvyn på 375 px är visuellt granskad utan horisontellt överflöde. Webbläsarprovet inkluderar även 1280 px.
- Produktionsbygget passerar med exit 0. Den nya partnersidan och API-rutterna kompileras; 331 sidor genereras. Befintliga varningar om Sentry och dynamisk rendering kvarstår. Bygget hoppar över typkontroll enligt projektets konfiguration; separat TypeScript-kontroll är därför körd och grön.

Testharnessen ersätter externa autentiseringskontroller med två separata testidentiteter och använder ett minimalt partnerschema. Databasens partner-/ägarskapskontroller körs på riktigt. Detta är inte ett skarpt inloggningsprov eller ett prov mot riktiga partnerkonton. Inga verkliga leads har delats ut under utvecklingen.

## Aktivering

Installera `supabase/migrations/20260914220545_revenue_partner_leads.sql` efter Revenue v2, föregående `20260914213502_revenue_sales_workflow.sql` och befintliga partnertabeller med avtalsfält. Driftsätt sedan koden tillsammans med föregående Revenue-ändringar.

Verifiera i vald driftmiljö med en säljledare och två partnerinloggningar: tilldela en testlead till partner A, kontrollera att partner B inte ser den, låt A acceptera, verifiera återkopplingen i admin och återkalla tilldelningen. Produktionsmigration, driftsättning och verkliga tilldelningar har inte utförts här.
