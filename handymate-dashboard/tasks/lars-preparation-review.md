# Lars kontroll av kundunderlaget

## Levererad kod

Ett inskickat kundunderlag kan granskas med Lars från kundkortet. Granskningen kräver inga tidigare projekt och kan användas inför den första offerten. Den omfattar kundens svar och de privata bilder som faktiskt kunde laddas. Saknas en bild sparas ingen påstått fullständig analys.

Resultatet sparas i customer_preparation.lars_review: kort sammanfattning, kontroller före arbete, kompletteringsfrågor och möjliga tillägg att bedöma. Punkterna måste hänvisa till tillåtna källor. Interna kund-/projekt-/underlags-ID:n skickas inte till modellen. Text, bilder och projektbeskrivning behandlas som underlag, inte instruktioner eller teknisk säkerhetsverifiering.

Hantverkaren väljer projekt uttryckligen. Servern kontrollerar business_id, customer_id och project_id tillsammans; databastriggern i v213 upprätthåller samma relation vid skrivning. Ny projektkoppling ogiltigförklarar tidigare granskning. En kontrollsumma upptäcker också ändrad projektbeskrivning/status. En ny analys kräver ny mänsklig granskning.

Efter granskningen kan hantverkaren redigera texten till ett internt ÄTA-förslag. Samma suggestAtaDraft/byggAtaUtkast används som i befintliga rapport- och agentflöden. Förslaget blir ett riktigt pending_approvals-kort med project_id och går därifrån till befintligt godkännande, ÄTA-utkast och intäktskö. Inget kundmeddelande eller någon faktura skickas av denna funktion. Förberedelsefrågorna kan kopieras, inte skickas automatiskt.

Återförsök använder samma deterministiska förslags-ID per kundunderlag. Det finns högst ett sådant kort från underlaget, även efter att kortet godkänts eller avvisats. Projektkopplingen får inte bytas när ett kort redan skapats. Nya behov efter det kräver ett nytt underlag. En skrivlåsning med tre minuters giltighet skyddar granskning/åtgärd mot samtidiga ändringar; giltigt källunderlag kontrolleras igen efter AI-genereringen och före sparning. AI-kostnad mäts och bränsle kontrolleras före nya anrop.

## Rättelser från Andreas/Claude

- package.json innehåller exakt CI:s kontraktslista samt Node-kontrakten. Browser-workflowen anropar nu samma npm-script som lokal körning. Ett paritetstest bevakar detta.
- Återställningskopians debounce är separerad från avmontering/pagehide. Snabb inmatning skriver inte på varje tangenttryck. Senaste värdet flushas vid navigering utan att läsa nästa kundkontexts data.
- Kundunderlagets interna ID finns inte längre i texten som går till offertgenereringen. Strukturerad källkoppling för granskning och ÄTA behålls på servern.

## Aktivering och kvarvarande driftbevis

**v213_customer_preparation_review.sql är skriven men inte körd av Codex.** Ingen Supabase-anslutning, databasnyckel eller riktig AI-nyckel finns tillgänglig i denna session. Befintligt schema har kartlagts i repo och mot v212-informationen från Claudes PR-granskning; det nya schemat har inte verifierats i produktion.

1. Kör v213 efter v212 via den befintliga Supabase-anslutningen och kontrollera SELECT-resultatet i filen. Kontrollera också att preparation_project_scope-triggern finns.
2. På ett avgränsat demokonto: skicka in ett kundunderlag med bild, kör Lars kontroll och läs om kundkortet. Resultat och källhänvisningar ska finnas kvar.
3. Kontrollera att nytt konto utan projekthistorik kan köra analys. Koppling till annat företags eller annan kunds projekt ska avvisas.
4. Välj rätt projekt, granska resultatet, redigera tilläggstext och skapa internt ÄTA-förslag. Kontrollera den verkliga pending_approvals-raden, godkännandekön och Pengar. Upprepa samma begäran och kontrollera att inget andra kort skapas.
5. Ändra projektbeskrivningen och kontrollera att en gammal kontroll inte kan användas. Kör ny granskning och kontrollera att mänskligt godkännande krävs igen.
6. Verifiera verklig AI-förbrukning och fuel-bucket preparation_review. Genomför därefter tidigare kvarvarande inloggade offert-/dagsavslutsprov före merge.

Om migrationen saknas visas att kontrollen inte är aktiverad. Manuellt kundunderlag och offertöverföring fortsätter fungera. PR:n ska inte betraktas som verifierad i drift förrän stegen ovan är genomförda.

## Testbevis

De riktade testen kör verkliga route-handlers, granskningsorkestrering, den befintliga ÄTA-förslagsfunktionen och intäktsköns härledning med simulerad databas/AI. De kontrollerar lyckad kedja, roll/kundisolering, bränslestopp, bilder, modellens källhänvisningar, inaktuella underlag, samtidighet och återförsök. Browserproven använder verkliga komponenter med interceptat API. Detta är inte ett ersättningsbevis för PostgreSQL, PostgREST eller riktig modellkvalitet.

Verifierat 2026-09-05:

- `CI=true npm run test:contracts`: 1 139 Playwright-kontrakt + 17 Node-kontrakt godkända.
- TypeScript (`--noEmit`, 6 GB heap): utan fel. Produktionsbygge: lyckat.
- Mobilbilden på 375 px visuellt granskad; inget horisontellt överflöde i browserproven på 375/1280 px.
- De utökade bränsleproven uppdaterar befintliga testantaganden efter centraliserad transkribering och abonnemangsfält. Två befintliga ref-typer får uttrycklig night_work-mappning, samma bucket som tidigare fallback.
- `HANDYMATE_CHROMIUM_PATH=/tmp/handymate-chromium npm run test:feature-integration`: 25 komponentprov + 2 kundformulärprov mot lokal Next-server godkända. API-anrop interceptade.
- Totalt 1 183 godkända tester i de två kanoniska kommandona; överlappande utvecklingskörningar är inte medräknade.
- `git diff --check`: utan fel.
