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
