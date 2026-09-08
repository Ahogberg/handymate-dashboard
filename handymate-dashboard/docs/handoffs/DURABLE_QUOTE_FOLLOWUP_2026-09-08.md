# Beständig offertuppföljning — första kompletta kedjan

Beslut: Andreas vill bygga nu på separat gren och avgöra release efter provning.
Gren: codex/durable-quote-followup-20260908, bygger på PR #28 (74829fc).
Detta är en schemalagd förberedelse, inte ett nytt tillstånd för automatiska utskick.

## Kundens kedja

1. En ägare/admin planerar en kontroll av en skickad offert, via offertens befintliga överlämning eller Mattes `schedule_quote_followup`.
2. Databasen bekräftar en beständig plan bara om minutköraren är aktiverad och nyligen har körts. Idempotensnyckel och unikt aktivt ansvar per offert skyddar omförsök.
3. När tiden nås kontrolleras företagets aktivering/paus, beställarens behörighet, uppdragets status/tidsram, offertens giltighet/version/rader och kundens kontaktuppgifter/STOPP.
4. Ny kontakt via SMS, e-post, portal eller telefon stoppar den gamla planen. Redan registrerad utgående kontakt stoppar även uppföljningen. Systemet gissar inte om ett nytt meddelande är ett ja eller nej.
5. Köraren skapar ett vanligt `send_sms`-kort och kopplar det till uppföljningen i samma databastransaktion. Den har ingen nätverkskod och skickar inte själv.
6. Hantverkaren granskar kortet via befintligt godkännandeflöde. Efter den vanliga godkännandelåsningen kontrolleras källorna igen. Ett beständigt engångslås måste tas innan SMS-sändaren anropas.
7. Bekräftat utfall återläses ur godkännandets sparade execution_result. Utskicksbekräftelse betyder inte leverans, kundsvar, vunnet jobb eller betalt.

## Befintliga vyer och begrepp

- Jobb är project, Uppdrag är mission. Teamets uppgifter är innehåll, ingen ny navigation.
- Offertens överlämning får planering, återläsning, fel, avbrott och länk till befintligt beslut/kvittens.
- Kopplade uppföljningar visas i samma Mission Control-panel. Planens deadline blir aldrig en påhittad bokad körningstid.
- Ingen omdöpning, onboardingtvång, ny sidomenypost eller ändring av ett aktivt uppdrag per firma.
- Ingen ändring av native-appen eller telefon-/App Store-arbetet.

## Databas och körning

`agent_followup` lagrar ansvar, tidpunkt, offertens källfingeravtryck, tillstånd och godkännandekoppling.
`agent_followup_event` är en beständig händelsehistorik.
`agent_followup_runner` lagrar aktiveringsflagga och senaste körning.

Köraren `run_agent_followups(50)` kör transaktionellt och väljer arbete med radlås. Förberedelse och kvittens skrivs ihop; avbruten transaktion lämnar inget halvt kort. Ett fel ger högst fem försök med väntetid. En missad tid äldre än 24 timmar blir en blockerad plan, aldrig ett sent automatiskt utskick. Samtidiga starter och förberedelsekörningar ska inte dubblera planen eller kortet.

Ett osäkert utskick låses konservativt. Engångslåset släpps inte automatiskt även om nätverkssvaret saknas; operatören måste kontrollera leverantör/logg innan något nytt skickas. Inga garantier om exactly-once hos en extern SMS-leverantör görs.

De befintliga offertproducenterna (legacy-cron, V3 och Daniels arbetsprovskort) lämnar över en offert med aktiv beständig uppföljning när funktionsflaggan är på. Övrig förtjänad autonomi och mandatmekanik ändras inte. **Den nya schemalagda vägen kräver alltid kortgranskning i denna leverans**, även på konton med annan beviljad autonomi.

Alla nya tabeller har RLS och åtkomst endast för service_role. Funktionerna kör som anroparen, med tom search_path och uttryckliga kvalificerade tabellnamn. PUBLIC/anon/authenticated får inte exekvera dem. API och Matte-verktyg kontrollerar aktuell intern medlemsidentitet; databasen kontrollerar även rollen vid skrivningen och på nytt vid körning.

Supabase-schemat kontrollerades läsande: offerter, kanoniska offertrader, medlemskap, loggar, kundmeddelanden och telefonloggar finns. pg_cron är inte installerat i det kontrollerade projektet. Ingen produktions-DDL, produktionsaktivering eller kundkontakt har utförts under bygget.

## Releaseordning — först efter grön grind och läst diff

1. Granska/merga beroendet PR #28 före denna gren, eller prova dem tillsammans i preview. Ingen automatisk merge.
2. Applicera **en** kopia av migrationen: `supabase/migrations/20260908165615_durable_quote_followup.sql`. Samma innehåll finns granskningsbart i `sql/v2_durable_quote_followup.sql`; kör inte båda. Runner förblir avstängd.
3. Kontrollera schema, RLS, funktionsrättigheter och advisors i målmiljön. SQL-testet i CI använder en isolerad PostgreSQL 16 med syntetiska tabeller/data.
4. Deploya granskad kod med `DURABLE_QUOTE_FOLLOWUP_ENABLED=false`.
5. Efter releasebeslut: kör `sql/operations/enable_durable_quote_followup.sql` i matchande databas. Den installerar pg_cron och startar en förberedelsekontroll varje minut, utan extern hemlighet eller Vercel Hobby-cron.
6. Verifiera en andra heartbeat och lyckad cron.job_run_details-körning. Sätt därefter `DURABLE_QUOTE_FOLLOWUP_ENABLED=true` i samma appmiljö.
7. Kör ett avgränsat pilotprov: planera ett testkort, stäng appen, läs tillbaka, avbryt; därefter granska avtalat syntetiskt sändprov separat. Riktigt kundutskick ingår inte i standardtesterna.
8. Kontrollera vyn på verklig iPhone. Webbläsarprov på 375 px är inte ett native-/iPhone-bevis.

Paus: `sql/operations/pause_durable_quote_followup.sql` stoppar nya förberedelser utan att radera data. Att bara stänga av appflaggan stoppar inte en redan aktiverad databaskörare. Företagets vanliga team-paus stoppar även nya sändanspråk genom källkontrollen.

## Verifiering

- 217 riktade regressionsprov gröna (uppdrag, agentgränser, tidigare kundstart, HTTP, SQL och browser). Därefter fyra extra SQL-prov för okänd offert-/abonnemangsstatus, raderad medlem och svenska telefonformat.
- 31 databaskontroller, 3 HTTP-prov och 2 browserprov gröna, inklusive avbruten appsession och återläsning. Samma SQL-svit finns i CI mot PostgreSQL 16 med flera anslutningar.
- Produktionsbygge exit 0 och separat TypeScript med 6 GB heap exit 0. Sista byggkontroll exit 0.
- Bred kontraktsgrind: 1 766 passerar, 1 befintligt överhoppat prov; dessutom 17 Node-kundunderlagsprov gröna. PostgreSQL-CI registreras i PR med exakt resultat.
- Kontoradering omfattar även nya uppföljningar/händelser; fullständighetsvakten passerar.
- Ingen live-Supabase-migration/pg_cron-körning, verklig extern leverans eller native-test är påstådd verifierad här.

Dokumentationsstöd: Supabase Database Functions (https://supabase.com/docs/guides/database/functions), särskilt SECURITY INVOKER och explicita EXECUTE-rättigheter. Changelog-indexet kunde inte läsas via tillgänglig webbläsningsfunktion; API-kontraktet verifierades mot aktuell officiell dokumentation och faktisk schemainventering.
