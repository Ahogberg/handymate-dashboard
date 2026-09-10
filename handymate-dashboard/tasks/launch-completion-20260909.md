# Lanseringsmål och beständig arbetskö — 2026-09-09

Detta är aktuell genomförandeplan. tasks/six-outcomes-20260909.md beskriver de sex kundutfallen och historiken; de sex leveransblocken nedan är arbetsindelningen, inte sex slutgodkända kundutfall.

## Mål
En byggfirma ska kunna gå från företagsstart till första förfrågan, från förfrågan till accepterad offert/projekt och från utfört arbete till rapport, godkänd ÄTA och verifierat fakturaunderlag i ekonomisystemet. Avbrott, nekad behörighet och återförsök får inte orsaka förlust, dubletter eller falsk kvittens.

## Gemensamma färdigvillkor
1. Kontext och objektkopplingar följer hela kedjan; nästa steg och ansvar är synliga.
2. Fel, avbrott, dubbelklick, tappat svar, behörighetsnekande och återförsök har verifierade säkra utfall.
3. Resultat och kvittenser stöds av sparade bevis; skapat, skickat, levererat och betalt skiljs åt.
4. Andreas och Christopher klarar verkliga byggscenarier utan utvecklarhjälp.

Status: planerad → pågår → tekniskt verifierad → kundgodkänd. Externt blockerad är en separat markering och räknas inte som klar. En grön PR är inte ett slutgodkänt kundflöde.

## Arbetskö
| Block | Status vid start | Nästa arbete och tekniskt facit |
|---|---|---|
| 1 Säker fakturering | Tekniskt verifierad i PR35, kundprov öppet | Bevara atomiska källmarkeringar och replay-skydd. Kontrollera klientnyckel för fria fakturor; testa verklig provider separat. |
| 2 Fullständig offertaccept | Tekniskt verifierad i PR35, kundprov öppet | Bevara beständig completion/recovery. Osäkert bekräftelsemejl kräver avstämning; ingen blind omsändning. |
| 3 Tillförlitligt inflöde och uppföljning | Pågår: portal implementerad, releasegrind pågår | Kartlägg samtliga skapare; anslut först lead-portal till beständig mottagning. Bevisa sparat mottagande före sidoeffekter, samma ID vid retry och synlig återhämtning. Därefter verifiera uppföljningens aktivering, heartbeat och stopp vid svar/nej/signering. |
| 4 Rapport till ekonomisystem | Planerad | Kontrollera befintlig mobilåterupptagning, spara oskickade utkast där det saknas, bevisa rapport→ÄTA→fakturakällor och avstämning. Separera internt godkänd rapport från kundgodkänd ÄTA. Riktigt telefon-/Fortnoxprov öppet. |
| 5 Företagsstart och mejl | Planerad | Rätta Gmail opt-out, pagination och cursor vid partiella fel innan aktivering. Verifiera faktisk OAuth-onboarding och Bolagsverkets kontrakt; bekräftad företagsprofil ska nå offert/agent. Microsoft kräver separat verifierad appregistrering och samtycke; redovisa vad som faktiskt fungerar. |
| 6 Sammanhängande release | Planerad | Samla exakta backend-/mobil-SHA, migrationer, flaggor, miljö, EAS-profil och testbevis. Kör gemensamma roll-/tenant-/kedjeprov. Lista återstående kundprov och externa blockerare innan releasebeslut. |

## Startbevis
PR35: https://github.com/Ahogberg/handymate-dashboard/pull/35
Verifierat remote HEAD: 1ca2720936c95a04b13481f4f951c65addda552c.
Fem GitHub-grindar och två Vercel-previewbyggen gröna på detta HEAD enligt föregående leverans.
35 nya integritetsprov; sprintsvit 168 prov. Ingen produktionsmigration, main-merge eller ny EAS utförd i leveransen.
Detaljer: docs/handoffs/INVOICE_ACCEPTANCE_INTEGRITY_2026-09-09.md.
Lokal full build får inte beskrivas som lyckad: ENOTEMPTY vid städning; fulla Vercel-byggen gav byggbevis.

## Arbetsprotokoll för varje fortsättning
1. Läs denna fil, repo-instruktioner och aktuell GitHub-status. Återställ repo från GitHub om scratch saknas.
2. Kontrollera pågående arbete/branch-HEAD innan ändringar. Skriv aldrig över andras ändringar och använd inte force-push.
3. Välj första oblockerade del i kön. Läs implementation, återge konkret fel, rätta grundorsak och testa verklig route/helper/SQL/render där relevant.
4. Vid fel i verifieringen: iterera tills orsaken är löst eller konkret extern blockerare är belagd.
5. Spara ändring och checkpoint i egen gren/draft-PR. Uppdatera denna fil med exakt SHA, provresultat, kvarstående risk och nästa körbara steg. Fortsätt automatiskt till nästa oblockerade del; vänta inte på ett nytt ”kör”.
6. Om en del kräver extern åtkomst: dokumentera exakt behov och fortsätt med övriga delar. Kalla aldrig mockade prov för liveprov.
7. Rapportera bara verifierade framsteg, misslyckanden och återstående användaråtgärder.

## Gränser
Ingen merge/push till main, produktionsmigration eller skarp kundkommunikation under nattpassen. Förbered granskbar leverans och befintliga kontraktsgrindar. Inga nya agentstartpunkter eller osanna schemalöften i mobilen. Bygg inte om befintlig SavedReportPanel utan att först läsa implementationen.
Kundgodkännande kräver Andreas/Christopher; externa OAuth-/leverantörsbeslut får inte antas vara klara.

## Nästa körbara steg
Kontrollera senaste PR36-grindarna. Fortsätt sedan inventeringen av storefront/contact, widget/chat, public/book och email/inbound: identifiera vilka som saknar beständig mottagning och hur stabil händelsenyckel kan fås utan att slå ihop två legitima förfrågningar. Gmail cursor/opt-out kan rättas oberoende om inflödeskoppling kräver produktbeslut. Uppföljningens målmiljö och körprov återstår.

## Checkpoint
2026-09-09: planen etablerad; block 3–6 inte slutförda. Nattpassen ska prioritera kod och lokala/CI-bevis och lämna en exakt lista över telefonprov och externa beroenden.


## Checkpoint: portal genomförd 2026-09-09
- Portal använder beständig mottagning före kund/lead/affär, inklusive kategori, nollvärde och adress. Extrafälten delar transaktion med affären; gamla kundadresser skrivs inte över.
- Versionerad receive_portal_lead_intake stoppar ny kod mot omigrerad DB. Inga legacy-fallbackinserts. Äldre externa portalklienter måste skicka Idempotency-Key (annars 428); aktuell portal gör det.
- Klienten sparar originalinskick och nyckel i sessionStorage före nätverk. Samma flik/omladdning kan återuppta; stängd flik/rensad lagring/annan enhet omfattas INTE. Inte generell offline-utkastfunktion.
- Blockerat/mottaget 202 visas som ej färdigställt. Osäkra svar får inte skapa nytt inskick. Ingen ny förfrågan kan startas i samma flik innan originalet är kontrollerat.
- 18 nya route/submission/render-prov + två nya SQL-prov. Sprintsviten 188 prov passerade; tsc passerade före sista storleksvalideringen. Slutlig CI/build kontrolleras separat.
- SQL v2_portal_durable_intake körd ENDAST på eoodwyfxrdjmlqaealhj. Live SQL-prov verifierade metadata, identiska replay-ID:n, ändrad payload och företag B nekas; samtliga provrader rullades tillbaka. Ingen SMS-/Fortnox-effekt kördes av provet.
- Reproducerbart DB-prov: sql/proof_portal_intake_test_only.sql. Lokala prov: npm run test:six-outcomes.
- Kvar: övriga inflöden, riktiga portal-klickprov och kundprov, uppföljning, block 4–6. SQL-provet bevisar inte HTTP eller extern leverans.

### Verifieringsnotering efter första kodpush
Första kod-HEAD remote: ea84a174f4f0538871097eec6125375fb6e4e710. Uppföljande ändring återställer även formulärfälten ur sparat original efter omladdning; 18 portalprov fortsatt gröna efter ändringen lokalt.
Lokal next build kompilerade men typkontrollens Node-process kraschade med heap out of memory; detta är INTE en godkänd lokal full build (trots launcher exit 0). GitHub/Vercel-resultat måste avläsas på senaste HEAD.
Första breda lokala kontraktskörningen träffade en gammal Playwright-cache med försvunnen absolut importsökväg; ny körning med egen cache påbörjades. Slutresultat ännu inte verifierat: den lokala exec-servern blev otillgänglig innan loggen kunde avläsas. Fortsätt från GitHub om scratch inte återkommer; håll test/build sekventiella och begränsa workers/minne.
Nästa Gmail-pass måste även läsa processor.ts: stored:false kan vara ett lagringsfel, inte bara duplicate. Deduplikationsläsningarna saknar business_id. Ett cursor-fix som endast fångar kastade undantag är otillräckligt. Inga Gmail-ändringar utförda i portalpasset.

## Checkpoint: Gmail-datasynk 2026-09-09
Implementerat: opt-out filtreras i cron och kontrolleras igen vid direktanrop och mellan meddelanden; kontobyte/återanslutning stoppar gamla skrivningar. Alla historiesidor/listningssidor läses, första dygnets startpunkt sparas beständigt och profilens baseline hämtas före listning. Lagringsfel, tomma svar, sidfel och missad cursor-kvittens håller tillbaka läspositionen. CAS skyddar nyare cursor mot en äldre körning. Cron rapporterar delvis fel som 503/success:false.
Kund- och dubblettuppslag är företagsskopade och stoppar vid queryfel/tvetydighet. Namn ensamt länkar inte en avsändare till kund. Sparad kund/mejl kräver returnerad rad. Befintliga mejl hoppas över på återförsök utan ny Google-/AI-bearbetning.
Migration sql/v2_gmail_sync_start.sql + CLI-genererad migration körd på isolerade testprojektet, inte produktion. SQL-provet sql/proof_gmail_sync_test_only.sql verifierade startankare, cursor-CAS, opt-out och tenantfilter och rullade tillbaka syntetisk anslutning. Inga riktiga Gmail-konton användes.
30 nya körbara prov i tests/sprint/gmail-polling.cjs. Bred kontraktsgrind grön lokalt: 1772 pass +1 befintlig skip, 17 Node-prov. Portalens force-dynamic-rättelse ingår. Typkontroll/slutlig CI/build avläses separat på aktuell commit.

### Fortsatt öppet i mejlkedjan
- Historik-404 stoppar med uttryckligt behov av återläsning. En säker, användarstyrd backfill och återhämtningsyta är INTE byggd; ingen tyst fallback som tappar äldre mejl.
- Första importen avser inkorg från dygnet före sparad startpunkt, INTE hela inkorgen eller Skickat. Gmail-OAuth i onboarding och Microsoft kvarstår.
- Tidsbudget stoppar utan framflyttad cursor; sparade mejl gör nästa försök billigare. Mycket stora listningar kan behöva beständig sidkö; ännu inte byggd.
- Ingen mailbox-lease eller atomisk kund+mejl+agent-outbox i detta pass. Samtidiga processorer och sidoeffekter efter lagrat mejl behöver separat genomgång innan kedjan kallas komplett.
- Historiskt globalt UNIQUE(gmail_message_id) kvarstår. Företagsskopade kontroller ger nu synligt sparfel i stället för falsk duplicate vid annan tenants rad; korrekt kontonamnsrymd/migration återstår.
- Riktigt OAuth-/Gmail-prov, provideravbrott och användarens synkvy återstår. Ingen produktion aktiverad.

Nästa körbara del efter grön CI: spara releasebevis och fortsätt med rapportkedjans oskickade utkast/återupptagning, alternativt den beständiga mottagningen för kvarvarande inflöden. Gmail-blockets ovanstående öppna delar får inte räknas som kundgodkända.


## Checkpoint: rapportutkast i mobilen 2026-09-09
Mobile draft-PR7: https://github.com/Ahogberg/handymate-mobile/pull/7
Exakt kod-HEAD: fe433e3a8f3a01eff8eed72182e6c8b8d455e53b. Bas PR6 cc8fd5c4e43a6b5ccefa31933a0d441fb9d16d6d. Lokal commit f37756f.
Rapportarket och fullchatten delar beständiga textutkast per miljö, Auth-användare, företag, medlem, projekt och datum. Återöppning skickar inte; nätfel behåller text, lagringsfel stoppar skick och en sen kvittens rensar endast originalrevisionen. Återställning i röstläge startar inte över befintlig text.
Verifierat lokalt: typkontroll, 12 nya utkastprov, totalt 222 Jest-prov i 30 sviter, separat scripts/check-contracts.cjs. Tre äldre sviter kan inte starta eftersom lokala snapshoten saknar assets/ai-team-bilder; blobbarna finns på GitHub. Full check:readiness är INTE godkänd lokalt. EAS, Expo-export och telefonprov inte utförda. CI ska avläsas på ovanstående SHA.
Begränsning: endast text på samma enhet; ingen ljud-/bildbackup. Dödas processen innan sparad-markeringen kan senaste ändringen gå förlorad. Tappat serversvar är inte löst av utkast: beständig inskickningsnyckel och avstämning återstår innan retry kan kallas dublettsäker. Block 4 är fortfarande pågående, inte kundgodkänt.
Öppna kundprov: tvångsstäng efter sparad-markering, återöppna samma projekt/datum, konto- och datumbyte, avbrutet skick, därefter separat verkligt rapport→ÄTA→faktura-/Fortnoxprov. Ingen main-merge, produktionsmigration eller kundkommunikation.
Nästa körbara steg: kontrollera PR7-CI; undersök sedan rapportchattens /api/matte/chat och sendToMatte för beständig inskickningsidentitet och avstämning vid tappat svar. Reproducera mottaget serverskick + förlorad HTTP-kvittens innan implementation. Inventera samtidigt rapportens koppling till godkänd ÄTA/fakturakällor; telefon-/providerprov hålls öppna. Portalens anslutning är redan genomförd, inte en ny startuppgift.

## Checkpoint: tre hela värderesor och två synliga avbrott 2026-09-09

Draft-PR37: https://github.com/Ahogberg/handymate-dashboard/pull/37. Kodcommit: `a7de2778c5cc79f890ad5d9f8ef561f8ecec5689` på egen gren. Full karta med manuella steg, automation, sparade resultat, bevisnivå och öppna prov: `tasks/three-value-journeys-20260909.md`.

Rättat efter reproduktion:

- Hemsidan dolde ett verkligt fakturagranskningsbehov när arbetet saknade säkert belopp, eftersom `PengarBand` behandlade `totalKr === 0` som tomt. Nu avgör faktiska kategorier tomläget, okända belopp visas i antal och ingen `0 kr` uppfinns.
- `/dashboard/quotes?status=sent`, som är mål för uppföljningslänken, ignorerade queryn och visade hela offertlistan. Nu läses URL-filtret, skickat+öppnat delar arbetskö och flikvalet skrivs tillbaka till en delbar URL.

Verifiering på kodcommitten:

- 314 riktade Playwright-prov för Bolagsverket/onboarding/företagsskanning/första offert, Pengar-bandet, offertfiltret och projekt→ÄTA→faktura: godkända på desktop + mobilkonfiguration.
- `npm run test:six-outcomes`: godkänd (42 boundary, 13 SQL-intake, 35 intake/HTTP, 45 Fortnox-avstämning, 15 faktura/accept-SQL, 20 faktura/accept-service, 18 portal, 30 Gmail).
- `tsc --noEmit` med 8 GB heap: exit 0. Första körningen med standardheap dog av OOM och räknades inte som godkänd.
- Next-produktionsbygge: avslutat med `.next/BUILD_ID=RACW2sK8VDYob6H3kgEBY`; de befintliga Sentry-deprecationsvarningarna kvarstår.
- `git diff --check`: exit 0 före commit.

Läsande produktionsklick, Nordström El AB, utan sändning eller skrivning:

- Accepterad offert visade signatur, händelselogg, överlämning och sparad projektlänk.
- Klart projekt visade rapportstart, separat ÄTA-livscykel och fakturautkast. Samma projekt visade samtidigt 85 500 kr kvar att fakturera och 2 017 kr redo/ofakturerat på andra ytor; beloppsparitet måste provas med ett nytt kontrollerat scenario.
- En äldre testfaktura innehöll offertformuleringar i intro/avslut. Det kan vara legacydata och är ännu inte reproducerat i dagens generator.
- Produktion bevisar inte PR35/PR36 eller denna nya kod.

Matte-onboarding: den namngivna grenen `feat/matte-onboarding-v3` är SHA `e33a8db58f18632f0d6edb50505f377baa87f2e5`, 17 egna commits men 1 448 commits efter main. Vercel-statusen är historiskt grön men ingen aktuell publik preview är verifierad. Den är designkälla, inte lanseringskandidat. Nästa implementation ska porta beslutad guidning till aktuell motor och bevara Bolagsverket, återupptagning, betalverifiering, company scan och första-offert-handoff.

Nästa körbara steg: öppna draft-PR och invänta CI/preview för de två rättningarna. Klicka därefter om offertfiltret på preview. Parallellt i kod: reproducera mobilens första rapportanrop där servern skapat `work_report_session` men HTTP-svaret tappas, och säkerställ att klienten hittar/resumerar serverkvittot innan den får erbjuda ett nytt inskick. Kund-/providerprov för ny onboarding, portal, uppföljning, rapport→ÄTA→faktura och Fortnox är fortsatt öppna och får inte kallas godkända.


## Checkpoint: tappad första rapportkvittens 2026-09-10

Dashboard draft-PR37 har aktuell HEAD `f5bbc6f6297dc5327671a80046011709f5804ac9`; backendens kodcommit är `80aadfba383f440a247f6868a716e8652d4a91b6`. Mobile draft-PR7 innehåller klientdelen på exakt HEAD `4a4252157e0247f0a40e52bb59d8bf685d8f3fc9`.

Reproducerat avbrott: servern kunde ha skapat `work_report_session` medan mobilens första HTTP-svar försvann. Det lokala textutkastet blev kvar, men ”Försök igen” saknade beständig inskickningsidentitet och kunde köra en ny AI-tur.

Rättat:

- Rapportutkastet bär nu en beständig v4-UUID. Oförändrad text och manuellt återförsök återanvänder nyckeln; redigerad text får en ny. Nyckeln sparas med samma konto-/företag-/medlem-/projekt-/datumavgränsning som texten.
- `/api/matte/chat` kontrollerar autentiserat företag, aktiv medlem, projektbehörighet och datum innan återhämtning. Samma UUID returnerar den redan lagrade planen före bränslegrind och nytt AI-arbete. Konfliktreplay skapar inte en andra rapport.
- Vid osäkert transportsvar anropar mobilen `/api/day-close` med exakt UUID. Hittas rapporten installeras en ny kortlivad granskningssignatur; annars behålls text och UUID. Ingen del utförs automatiskt.
- Befintlig `work_report_session.id text` används; ingen schemaändring eller migration tillkommer.

Verifierat:

- Dashboard: 17 PGlite-baserade rapportkontinuitets-/återhämtningsprov godkända, inklusive tappad första kvittens, tenant-/medlem-/projekt-/datumscope och exakt en rapportplan. `npm run test:six-outcomes` godkänd. TypeScript exit 0. Next-produktionsbygge klart med `.next/BUILD_ID=lcVv-xxPHM6oFUYYsiKYJ`; befintliga env-/Sentry-varningar kvarstod.
- Mobil: typkontroll godkänd; 224 Jest-prov i 30 sviter godkända; separat `scripts/check-contracts.cjs` godkänd. Två nya prov täcker beständig/roterad nyckel och mottaget serverskick med förlorad HTTP-kvittens.
- Lokal full `check:readiness` är fortfarande INTE helt grön: tre äldre sviter kan inte starta i scratch eftersom agentbilder saknas lokalt. Remote-branchens bilder är orörda. GitHub `Mobile readiness` run 16 är godkänd på mobil-HEAD ovan.
- Supabasegranskning: servern använder service-roll endast på servern och varje återhämtningsläsning filtrerar `business_id`, `business_user_id`, `project_id`, `work_date` och UUID. Befintlig RLS/revoke-modell ändrades inte.

Öppet före komplett-/kundgodkännande: samordnad backend-preview och mobilbuild, verkligt felprov där HTTP-kvittensen kapas efter DB-commit, telefonprov, rapport→ÄTA→fakturaunderlag→Fortnox med kontrollerade belopp samt kundklick av Andreas/Christopher. Ingen produktion, migration, main-merge eller extern leverantör användes i detta pass.

GitHub-resultat: dashboardens fem Actions-grindar och båda Vercel-byggena är godkända på PR37-HEAD; mobilens `Mobile readiness` run 16 är godkänd på PR7-HEAD. Preview-klicket stoppas före Handymate av Vercels deployment protection och är därför inte ett produktprov. Nästa körbara steg: öppna preview med verifierad Vercel-session och klickprova offertfiltret, därefter samordnat mobilprov mot samma backend-HEAD. Fortsätt sedan med beloppsparitet i rapport→fakturaunderlag och portning av Matte-onboardingens godkända guidning till aktuell motor.

## Checkpoint: rätt fakturakälla och beloppsparitet 2026-09-10

Dashboard draft-PR37 innehåller rättningen i commit `7977b22cee0d50058e596e62ef4a99d7d0953a03`.

Reproducerat avbrott: samma projektsida kunde visa 85 500 kr från avtal/offert och 2 017 kr från faktisk tid, men primärknappen öppnade alltid tid-/materialbyggaren. Därmed kunde ett fastpris-/blandprojekt leda ägaren till fel fakturakälla. Ofakturerat material saknades dessutom i beloppet för löpande projekt, och knapptexten ”Godkänn & skicka” lovade en sändning trots att bara ett utkast öppnas.

Rättat:

- En ren källväljare håller avtalsfakturering och löpande fakturering åtskilda. Fastpris/blandavtal med offert går till offertrader + fakturerbar kundgodkänd ÄTA; löpande projekt eller projekt utan offert går till faktisk ofakturerad tid + material.
- Samma val styr projektets huvudknapp, åtgärdsrad och ekonomikort. Inga källor summeras ihop universellt.
- Löpande belopp inkluderar nu både ofakturerad tid och ofakturerat material. Avtalsvägen visar uttryckligen ”kvar av avtalat värde”, inte att hela beloppet redan är ett färdigt fakturaunderlag.
- Primärknappen heter ”Granska fakturaunderlag”; inget skickas vid klicket.

Verifieringsläge: tre deterministiska käll-/beloppsfall är tillagda, inklusive det reproducerade 85 500/2 017-scenariot. Lokal omkörning kunde inte starta efter att den tidigare scratch-cachen för node_modules försvunnit; offlineinstallationen stoppade på saknat paket `zwitch@2.0.4`. Detta räknas inte som ett godkänt prov. GitHub Actions/Vercel ska avläsas på exakt PR-HEAD innan leveransen kallas tekniskt grön.

Öppen datarisk: `project_type` härleds i dag heuristiskt ur offertens radslag (arbete/material), inte ur ett uttryckligt kundvalt avtalsvillkor. Rättningen följer den befintliga modellens `fixed_price/hourly/mixed`, men ett nytt kontrollerat byggscenario måste verifiera att valt avtal blir rätt typ. Ett framtida explicit `billing_model` är en separat modelländring och ska inte smygas in före kundbeslut.

Nästa körbara steg: invänta och avläs PR37-grindarna; klickprova sedan ett fastpris-, löpande- och blandprojekt på samma preview-HEAD och jämför projektets belopp, valda källrader, ÄTA, fakturautkast och ekonomisystemskvitto. Preview är fortfarande spärrad av Vercels deployment protection utan giltig session. Ingen produktion, migration, fakturasändning eller providerkommunikation har utförts.


### Uppföljning: samma fakturakälla i projektlistan

Slutlig fakturakälleskod för detta pass ligger i `ff4549a6cda47c5fa961fe386150750710d63ad1` före plansynk. Projektlistan använder nu samma källval som detaljsidan, hittar fastprisprojekt utan tid samt löpande projekt med enbart ofakturerat material, och stoppar nytt avtalsutkast när en projektfaktura redan finns. Två ytterligare källfall och ett statiskt kopplingsfacit är tillagda. Grön status inväntas på plansynkad PR-HEAD; kundklick och providerprov är oförändrat öppna.


### Slutligt tekniskt bevis för fakturakällan

Draft-PR37 HEAD `7fc9c45c374dfc24a14d7f04791b79fa41798b93` är tekniskt grön: fem GitHub Actions-flöden och båda Vercel-previewbyggena godkända. TypeScript hade noll fel; browserlösa kontraktsgrinden gav 1 772 godkända och 1 befintlig skip. De separata SQL-/intake-/Fortnox-/faktura-/portal-/Gmail-kontrakten var också gröna; providerresultaten är mockade och räknas inte som liveprov.

En kapad filöverföring till PR-grenen upptäcktes av grinden, återställdes till exakt lokalt Git-blob-ID och omprovades. Ett därefter synligt typfel och fem saknade route-harness-mockar rättades; endast den sista gröna SHA:n ovan gäller.

Nästa körbara steg är oförändrat kundprov på samma preview: skapa eller välj ett kontrollerat fastpris-, löpande- och blandprojekt, verifiera källval och belopp hela vägen till fakturautkast utan att skicka. Därefter samordnat mobilprov för rapportkvittens och separat Fortnox/providerprov. `project_type`-heuristiken och Matte-onboardingens portning är fortfarande öppna produktfrågor; inget av dem är kundgodkänt.


## Checkpoint: ÄTA-beloppsparitet och robust företagsstart 2026-09-10

Kod-HEAD i draft-PR37: `ac52c8e7bf4d94e699d1383bbcb442deb74eee9e`. Lokal motsvarighet `e8173a62`. Ingen main-merge, migration eller skarp kommunikation.

- Felreproduktion på `34ec5ac41e49b7dfd0bd9fc96281aab6b9d2c66a`: GitHub Kontraktsgrind run 459/job 102771972703 gav exakt fem väntade ÄTA-paritetsfel, 1797 godkända och en befintlig skip. En gammal sparad ÄTA-total kunde styra preview trots att utkastet räknade raderna.
- Rättat: signerad/godkänd ÄTA med rader räknas från raderna i preview. Legacy utan rader behåller total-fallback. Noll i antal bevaras i båda fakturabyggarna och ROT/RUT-underlag; radvisningen använder samma legacy-default för saknat antal. Prov täcker tillägg/avgående, noll/två i antal och gammal total genom preview → båda utkastvägarna. Providers är isolerade/mockade, inte liveprov.
- Setup Studio: blockerad sessionStorage kunde kasta vid start och hindra byte till klassisk guide. Felet reproducerades mot originalkoden med Node; ändrade riktiga funktioner klarar samma prov. Läsning ger nu null och nekad skrivning stoppar inte lokalt lägesbyte. Detta är en robusthetsrättning i befintlig guidning, INTE portning eller godkännande av den efterfrågade nya Matte-designen.
- Upptäckt verifieringslucka: project-derive-todo och facit-project-list-next-todo ingick inte i tidigare breda grindens 1772 prov. Nu ingår båda samt onboarding-setup-studio i GitHub-grinden och npm test:contracts, med ett facit som kräver inkopplingen.
- Slutbevis på kod-HEAD ovan: fem GitHub Actions gröna, Kontraktsgrind run 461/job 102773183241: TypeScript utan fel, 1809 browserlösa prov godkända + en befintlig skip, kundunderlagskontrakt och sex-kundutfall-sviten godkända. Båda Vercel-byggena gröna. Alla nio överförda ändringsfiler verifierade mot lokala Git-blobbar. Lokal full svit kunde inte köras eftersom beroenden saknas och offlinecache saknar TypeScript; CI är det fulla körbeviset.
- Browserkontroll: befintlig flik visar Vercels vanliga inloggningssida före preview. Ingen giltig preview-session; inga inloggade kundklick utförda i detta pass. Ingen kringgång av skyddet.

Nästa körbara kodsteg: rätta återstående osäkerhet i faktureringsvalet utan att anta att project_type bevisar ett avtal; granska även previewns befintlig-faktura-kvittens och felhantering. Nya Matte-guidningen behöver jämföras mot befintliga SetupStudioShell/MatteSetupGuide och beslutad design innan portning; byggflaggan NEXT_PUBLIC_SETUP_STUDIO_ENABLED är inte i sig designgodkännande. Kundprov kvarstår för fastpris/löpande/blandavtal, rätt onboarding-version, portal/uppföljning, tappad mobilkvittens och rapport → ÄTA → faktura → verkligt Fortnox. PR7/mobil är oförändrad i detta pass.


## Checkpoint: fakturakedjans åtkomst, felåterhämtning och uttryckliga källval 2026-09-10

Senaste verifierade kod-HEAD i draft-PR37: `462d3da0e9010a46eaad2f4e131e5c9e4e8da032`. Åtkomstkod `63da25c1ef650dc869c70417b4fd42988ef911cc`; källval `91af57d8636a7a783bd2682d348e432e2d80ae0f`; sista commit rättar endast renderprovets JSX-laddning. Lokala commits: `4a83365e`, `c203c6bc`, `ceac4d9a`.

### Reproduktion och rättning
- Nio nya prov föll på originalet `4cbae6500b00c1c7106c6df1b82ea0ffde3434b1`, Kontraktsgrind run 467/job 102775470853. Preview saknade medlems-/tilldelnings-/ekonomigrind; slutfaktura saknade projekttilldelningsgrind; läsfel vid befintlig faktura såg ut som ingen faktura.
- Preview använder nu getCurrentUser med verifierat business_id, samma tilldelningsfilter som projektdetaljen och see_financials före kund-/prisdata. Saknad medlem är inte impersoneringsbevis; befintligt serververifierat _impersonation-undantag för läsning bevaras.
- Slutfakturans medlemsuppslag är företagsskopat och kräver projekttilldelning när see_all_projects saknas. create_invoices kvarstår som separat skrivbehörighet; läsbehörighet ger inte skapanderätt.
- Tilldelnings-/fakturauppslagsfel stoppar med 503. Preview visar fel och erbjuder Försök igen som endast hämtar underlaget; gamla data/fel rensas före ny läsning. Inga fakturor skickas av detta.
- Alla generiska fakturastarter på projektdetaljen använder en gemensam ingång. Projekt med offert kräver val mellan offert + fakturerbara ÄTA respektive faktisk tid + material. Projekt utan offert går till tid/material. Valet navigerar, det ändrar inte avtalet och skapar inget. Blandade upplägg slås inte ihop automatiskt. Den uttryckliga menylänken till offertens fakturapreview finns kvar.
- project_type används fortfarande i tidigare belopps-/arbetsköprognoser. Det är INTE ett explicit billing_model och detta pass påstår inte att all automatisk fakturering eller blandfakturering är löst. Den tysta navigeringsgissningen är borttagen; belopps-/avtalsprov kvarstår.

### Verifiering
På exakt kod-HEAD ovan: fem GitHub Actions gröna; Kontraktsgrind run 473/job 102779466083: TypeScript utan fel, 1822 browserlösa prov godkända + en befintlig skip, kundunderlagskontrakt och sex-kundutfall-sviten gröna. Båda Vercel-previewbyggena gröna. Åtkomsträttningen separat gav 1819 godkända på run 469 innan källvalet tillkom. SSR-provet renderar riktiga komponenten med standard React-JSX; första försöket föll på Playwrights __pw_type-transform och räknas inte som produktfel eller godkänt prov. Ändrade fjärrfiler verifierades mot lokala Git-blobbar.

Ingen ny inloggad klickverifiering: preview kräver fortfarande giltig Vercel-session. Källvalets fokus, Escape, mobil layout och bägge navigeringarna måste klickprovas på rätt preview. Ingen main-merge/push, produktionsmigration, fakturasändning eller riktig providerkommunikation. Mobil PR7 oförändrad.

### Nästa körbara steg
Prioritera nu förfrågan → agent → offert/uppföljning: storefront/contact använder fortfarande legacy createLeadAndDeal utan beständig inskickningsnyckel. Befintlig intakeInput kräver telefon, men storefront tillåter endast e-post; anslut inte genom att hitta på telefonnummer eller bryta befintliga formulär. Inventera den publicerade klientens nyckel/återförsök och SQL-kontraktets kontaktkrav; bygg email-only-kompatibel beständig mottagning med prov innan integration. Därefter kvarvarande widget/public-book/email-inbound, uppföljningens verkliga aktivering och stoppvillkor. Fortsätt jämförelsen av nya Matte-designen med aktuell guidning. Kund-/telefon-/Fortnoxprov och alla tre hela kundresornas slutgodkännande är fortfarande öppna.
