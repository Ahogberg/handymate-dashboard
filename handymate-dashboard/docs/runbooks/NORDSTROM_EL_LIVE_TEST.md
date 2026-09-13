# Nordström El AB — manuell inloggad testresa

## Status

**Senaste verifiering 2026-09-13:** Efter användarens uttryckliga godkännande sparades projektets befintliga automationsnyckel som krypterad `VERCEL_AUTOMATION_BYPASS_SECRET` i GitHub-miljön `live-test`. [Körning 34721809781](https://github.com/Ahogberg/handymate-dashboard/actions/runs/34721809781) på `e44b2b71aa01726bd4a207797baec8931ab79225` passerade Vercels skydd och nådde appen, men stoppades före appinloggning av **HTTP 503** från `/api/health`. Vercel-åtkomst är därmed verifierad; kontots lösenord, session, företag och browserresa är fortfarande inte verifierade. Inget utkast eller utskick gjordes.

Separat autentiserad hälsoläsning bekräftar version `e44b2b7`, databas `ok` och `credit_watch=error`. Den sparade providerkontrollen är från 2026-09-12 05:05 UTC, så kontrollera/uppdatera den mot aktuell providerstatus innan något saldobesked betraktas som färskt. Hälsogrinden har inte försvagats. Nästa steg: utred/förnya kreditkontrollen, åtgärda faktisk kreditbrist om den kvarstår och kör lästestet igen efter godkänd hälsa.

Teststödet är verifierat med TypeScript, 18 lokala policyprov, 11 CI-kontrakt och testupptäckt. Alla vanliga PR-/push-workflows och båda previewbyggen passerade på `e44b2b71a`. Full kundrese-/releaseacceptans kvar på HOLD.

**Uppdatering 2026-09-13:** Autentiserad `vercel curl` når rätt previews `/api/health` och bekräftar version `7e07a3b`. Vercels skyddsinställning är fortsatt `all_except_custom_domains`. En befintlig automation-bypass-nyckel finns i projektet. GitHub-testet kan nu läsa `VERCEL_AUTOMATION_BYPASS_SECRET` från miljön `live-test`, men nyckeln är ännu inte överförd dit och den autentiserade kundresan är inte omkörd.

Nyckeln ska sparas som krypterad environment-secret i `Ahogberg/handymate-dashboard`, inte i kod, URL, rapport eller logg. Den ger plattformsåtkomst till projektets skyddade deployments; testkoden skickar den bara till det exakt valda originet. API-anrop följer inga redirects. Browsern hämtar endast godkända samma-origin-anrop utan automatisk redirect och granskar destinationsanrop separat. Transportfel återges utan headers i rapporterna. Appens login-, versions-, företags- och skrivgrindar gäller fortfarande. Vercels rekommenderade header är dokumenterad i [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

Hälsorutten svarade `degraded`: sparad kreditkontroll från 2026-09-12 05:05 UTC rapporterar slut Anthropic-kredit, 7 kr hos 46elks och Stripe i testläge. Detta är återläst kontrollstatus, inte en färsk provider-/saldoverifiering. Sådana livekrav kvarstår separat.

**Uppdaterat 2026-09-12:** [Körning 34720493107](https://github.com/Ahogberg/handymate-dashboard/actions/runs/34720493107) startades via GitHub CLI på merge-commit `fc586381aa7bc2defd0dc2ebe4dcb327d04b694b`, med `customer_journey=true` och `create_draft=false`. Testkonfigurationen passerade. Den breda produktionssviten och tvåtenantprovet hoppades över enligt plan.

**BLOCKERAD före autentisering:** `/api/health` svarade HTTP 302. Ett separat anrop utan inloggningsuppgifter bekräftade att omdirigeringen går till Vercels `/sso-api`. Previewns åtkomstskydd blockerar alltså runnern. Inga appcredentials skickades, inget utkast skapades och inget företags-/sessions-/UI-bevis erhölls. Testkontots lösenords giltighet är fortfarande okänd; att konfigurationen passerade bevisar bara att ett värde fanns.

Nästa steg är att ordna godkänd åtkomst till rätt preview och köra samma avgränsade prov på aktuell branch-commit. Skyddet har inte ändrats eller kringgåtts. Ett lyckat bygge ersätter inte detta prov. Release kvar på HOLD.

## Redan förifyllt

Read-only uppslag 2026-09-11 bekräftade att testföretaget heter **Nordström El AB**, har ID `biz_al7pjuu5smi` och ägarkontot `andreashogberg93@gmail.com`. Detta är samma ID och e-post som den befintliga nattliga sviten använder.

- Adress: PR #38:s Vercel-preview, `https://handymate-dashboard-git-codex-ecd8bb-andreas-projects-f2b98374.vercel.app` (hämtad ur Vercels PR-kommentar).
- Förväntad version: den startade arbetsgrenens commit. Testet jämför dess första sju tecken med `/api/health.version`, innan lösenordet skickas. Hälsorutten exponerar sju tecken, inte full SHA.
- Lösenord: använder i första hand `LIVE_TEST_PASSWORD`, annars den befintliga repo-hemligheten `TEST_USER_PASSWORD`. Att hemligheten är konfigurerad/aktuell är ännu inte verifierat; saknas den stoppar körningen.
- Environment: `live-test`. Befintliga environment-regler måste tillåta arbetsgrenen. Lägg inga hemligheter i en PR, fil eller chatt.

Du behöver alltså inte lägga in allt igen. Om nuvarande lösenord inte redan finns i GitHub: lägg det som environment-secret **LIVE_TEST_PASSWORD** under repots Settings → Environments → live-test. Valfritt **LIVE_TEST_EMAIL** ersätter den förifyllda e-posten. Byt inte kontots lösenord för testets skull.

Valfria environment-variables för en annan uttryckligt vald testdeploy: `LIVE_TEST_BASE_URL` (rent HTTPS-origin), `LIVE_TEST_COMMIT_SHA` (40 tecken) och `LIVE_TEST_BUSINESS_ID`. Företagsnamnet måste fortfarande vara Nordström El AB. Previewns underliggande databas kan vara prod; den behandlas inte som disponibel.

## Starta från arbetsgrenen utan merge

Den befintliga filen `playwright.yml` finns redan på main och har workflow_dispatch. Den återanvänds för att kunna välja arbetsgren. Nya workflowfiler går annars inte att starta förrän de finns på standardgrenen.

Kör i en terminal med GitHub CLI inloggat på ditt GitHub-konto, efter att Vercel har byggt arbetsgrenens aktuella commit:

```bash
gh workflow run playwright.yml --repo Ahogberg/handymate-dashboard --ref codex/brain-visibility-weekend-20260910 -f customer_journey=true -f create_draft=false
```

Detta väljer **endast** Nordström Els lästest. Den breda produktionssviten och tvåtenantprovet hoppas över. Kör inte den gamla manuella workflowen utan dessa val. Om GitHubs Run workflow-formulär visar de nya valen, välj samma arbetsgren och `customer_journey=true` där. CLI-kommandot är den uttryckliga vägen om formuläret ännu visar mains äldre inputs.

För att också prova ett sparat utkast, använd samma kommando med `-f create_draft=true`. Detta skapar högst ett märkt utkast för samma GitHub-run-ID, utan kund, lead, affär eller betalplan. Två syntetiska arbetstimmar à 100 kr ger 250 kr inklusive moms; detta är testdata, aldrig föreslagna kundpriser. Utkastet lämnas kvar för granskning. Ingen automatisk radering görs. Vid tappat svar görs ingen andra automatisk POST; omkörning söker efter samma markör först. Separata nya körningar skapar separata utkast.

GitHub-anslutningen kan läsa körningar och starta om befintliga jobb, men saknar verktyg för en ny workflow_dispatch och för att konfigurera secrets. GitHub CLI är nu tillgängligt och användes för starten ovan. Den återstående spärren är verifierad previewåtkomst, inte möjlighet att starta workflowen.

## Vad testet bevisar

1. `/api/health` svarar med rätt version innan credentials lämnar köraren.
2. Appens riktiga `/api/auth` skapar en cookie-session; login-svaret och `/api/me` måste visa rätt företags-ID, medlemskap och företagsnamn.
3. Hem och offerter öppnas i Chromium; omladdning behåller sessionen. Jobbtyps-/offertdata läses från appens riktiga API.
4. Offertlistan fotograferas vid 1280 och 375 px. Endast testföretaget får användas; bilder kan innehålla dess befintliga data.
5. Om utkast valts: appens API sparar ett fristående draft. Riktiga GET-anrop verifierar företag, status, titel, rader, mängd, pris och total. UI öppnar offerten och visar titeln före/efter omladdning samt fotograferas vid båda bredder.

Inloggningen och skapandet använder appens API, inte tangentbordsinmatning i formulären. Detta är **inte** bevis på hela onboardingen eller offerteditorns inmatningsflöde. Ett konto som kräver onboarding omdirigeras och provet blir rött; testet kringgår eller återställer inte onboardingen.

Webbläsarens egna POST/PUT/PATCH/DELETE samt externa HTTP-anrop och cron/debug blockeras. Eventuella blockerade sid-skrivningar redovisas i bevisbilagan. Den separata API-delen får endast logga in och, efter verifierat företag/explicit val, skapa testutkastet. Inga godkännanden, fakturor, kundutskick, betalningar eller integrationsaktiveringar begärs. Ingen service-role-nyckel används.

## Resultat och kvarstående begränsningar

GitHub Actions → körningen → artifact `nordstrom-el-live-journey-<run>-<attempt>` innehåller HTML-rapport, valda skärmbilder och en bevisbilaga med versions-/företagsreferens samt eventuellt offert-ID. Cookies, sparat auth-state, trace/HAR och video laddas inte upp. Artifacts behålls i tre dagar och lokala rapportmappar är gitignorerade.

Röd preflight vid saknad secret, fel version eller otillgänglig preview är en blockerad körning, inte ett godkänt kundreseprov. Om Vercel visar inloggningsskydd i stället för appens hälsorutt stoppar testet innan appens lösenord skickas. Skapa inte något automatiskt skyddsundantag som del av felsökningen; rätt åtkomst måste ordnas separat.

Den ännu ej införda mejlmigrationen, hela inmatningsresan i UI och verkliga leverantörs-/mottagarkvitton kvarstår efter detta prov. Ingen capability eller release uppgraderas enbart för att denna smala resa passerar.
