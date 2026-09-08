# Visionstest på riktig iPhone — 9 september

## Kandidat och omfattning

Mobilgrenen `codex/mobile-vision-20260908` bygger på godkännande-PR #3,
exakt källversion `4c54e84240f2b58a551eb628cc51cffb79937b05`.
Hela arbetskopians ursprungliga Git-träd verifierades mot
`1422cd30a8da857b288e90fb421637a436298596`, inklusive riktiga bilder/fonter.
Backend ska vara `codex/vision-integration-20260908`: #26 tillsammans med #28–#31.
Använd de slutliga granskade commit-ID:na i respektive PR, inte bara grennamnen.

Nytt i mobilen: egna sparade rapportdelar/kvittenser i befintlig projektrapport
och Matte-chatt, serveråterupptagning av exakt nästa del, explicit avstående,
uppdatering efter bekräftelse/foreground samt skydd mot äldre svar efter
stängning, datumbyte eller kontobyte. Kontobyte rensar även lokala Matte-kort.
Ingen ny navigationsplats för Teamets uppgifter. Oskickad text/ljud synkas inte.

Backendens integrationsprov hittade och rättade en verklig aktivitetsbugg:
`automation_logs` finns inte i den kontrollerade databasen. Historiken använder
nu `v3_automation_logs` och sparade godkännandekvittenser. Ingen tabell skapades.
Signerad granskning och massutskicksbekräftelse är båda bevarade.

## Verifierat lokalt

- Full mobil-TypeScript, 214 Jest-prov i 30 sviter och samtliga 8 befintliga
  CJS-harnesser (bland annat 17 granskningsfall) passerar.
- 12 nya mobilprov: återöppning, exakt nästa kort, ingen automatisk bekräftelse,
  tappat svar, nekat avstående, kontobyte, stängning, background/foreground,
  datumbyte, fel/flagga/busy och faktisk autentiserad API-adapter.
- Separat byggmiljöprov kontrollerar testprofilens uttryckliga URL/nycklar.
- Expo har paketerat iOS/Hermes med riktiga resurser. Detta är en JS-/asset-export,
  INTE en signerad IPA, installerad iPhone-app eller TestFlight-build.
- Backend: 1 772 kontraktsprov + 17 Node-prov, 18 rapportkontinuitetsprov,
  full TypeScript och produktionsbygge passerar. 32 godkännandeharnesser provade;
  de två browserharnesserna anpassades till den riktiga gemensamma klienthjälparen
  och passerar, inklusive faktisk PDF-rendering och båda bekräftelsegrindarna.
- Slutlig GitHub CI är en separat grind; resultat och exakta träd förs i PR.

## Miljö och signerad build

EAS CLI 23.2.0 finns testad men `eas whoami` svarar `Not logged in` i arbetsmiljön.
Ingen Apple-inloggning, signering, IPA eller ny TestFlight-build har skapats.

1. Deploya det granskade integrerade backendträdet till en för mobilen åtkomlig
   testadress. En Vercel-preview som kräver separat webbinloggning räcker inte.
2. Använd en avgränsad godkänd testdatabas/testfirma. Applicera rapportmigrationen
   EN gång, verifiera RLS/RPC och sätt `WORK_REPORT_CONTINUITY_ENABLED=true`.
   Övriga migrationskrav följer backend-PR #26 och #29. Ingen sådan aktivering
   har utförts i detta pass.
3. För offertuppföljning: följ backendens DURABLE_QUOTE_FOLLOWUP-underlag, inklusive
   runner, verifierad heartbeat och `DURABLE_QUOTE_FOLLOWUP_ENABLED`. Appflaggan
   ensam aktiverar inte runnern och stoppar inte en redan aktiverad runner.
4. I EAS preview-miljön: sätt EXPO_PUBLIC_API_URL till testad backendadress samt
   matchande EXPO_PUBLIC_SUPABASE_URL och publik EXPO_PUBLIC_SUPABASE_ANON_KEY.
   Byggprofilen `vision-testflight` vägrar tyst fallback till app.handymate.se
   eller en service-nyckel. Den använder remote autoIncrement och store-distribution.
5. Logga in i rätt EAS-konto och kör från exakt granskad mobilcommit:
   `npx eas-cli@23.2.0 build --platform ios --profile vision-testflight`.
   Signeringsuppgifter måste vara giltiga för com.handymate.mobile.
6. Ladda upp den uttryckligen valda signerade kandidaten via EAS/App Store Connect.
   Ange dess exakta build-ID/IPA; använd inte en ospecificerad senaste build.
   Denna testprofil pekar på testmiljö och ska inte bli publik produktionsrelease.

## Morgondagens prov — registrera bevis per rad

| Prov | Förväntat | Bevis |
|---|---|---|
| Logga in som tilldelad anställd | Rätt egna jobb, inga andra användares rapporter | Konto/roll + skärmbild |
| Föreslå tid, anteckning, material och ÄTA | Fyra granskade delar, inget sparat före ja | Plan + noll skrivningar |
| Bekräfta första delen, tvångsstäng appen | Samma delkvittens efter omstart | Rapport-ID + faktisk sparad rad |
| Öppna samma jobb/datum och granska nästa | Samma kvarvarande plan, ingen ny AI-tolkning eller dubblering | Kort + server-ID |
| Bekräfta material, bryt nätet under svaret | Osäkert läge; samma rapport kontrolleras före återförsök | Exakt en materialrad |
| Gå till bakgrunden under återupptagning | Sent svar får inte lägga in ett gammalt kort | Ny foreground-läsning |
| Byt datum, konto och projekttilldelning | Ingen gammal plan visas/utförs i ny omfattning | Nekat anrop + UI |
| Avstå från resterande delar | Servern stänger återstoden; redan sparat ligger kvar | State + tidigare artefakter |
| Alla fyra delar klara | Fyra kvittenser; ÄTA är ett förslag, inte ett kundutskick | Rader + kvittenser |
| Godkännanden, badge, historik, dokument | Preview → separat ja → korrekt lagrad kvittens | App + backendåterläsning |
| Schemalagd offertuppföljning med stängd app | Förslag väntar på granskning; inget automatiskt SMS | Runner + kort + sändlogg |
| Telefon/Lisa och bilagor/WebView | Verklig enhetsfunktion, full text och dokument före ja | Inspelat telefon-/iPhone-prov |

## Fortfarande öppet i hela visionen

Detta är ingen 77/77-certifiering av godkännandetyper och inte hela ekonomikedjan.
Exakt offert-/faktura-/Fortnox-/e-fakturagranskning, alla sändarvarianter,
foto/delning i rapportkedjan, faktura-/kundlöftesmotor och bekräftade affärsresultat
har separata öppna delar i backendens audit. Kontinuiteten omfattar tid,
arbetsanteckning, material och ÄTA-förslag — inte all backofficeadministration.
En App Store-inlämning avgörs efter grön slutlig CI, läst diff och riktiga
inloggade iPhone-/telefonprov. Byggdatum får inte förväxlas med bevisad funktion.
