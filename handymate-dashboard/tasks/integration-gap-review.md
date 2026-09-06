# Gemensam granskning av PR #7–#10 — 2026-09-05

## Omfattning och leverans

Grenen samlar alla fyra PR:er och integrationsrättningarna. Basen inkluderar mains CI-fixar från 0a088ed. Detta är en gemensam granskningsversion; de äldre PR:ernas separata previews innehåller inte dessa rättningar.

| Flöde | Producent → sparad källa → konsument | Granskningsresultat |
|---|---|---|
| Kundunderlag | Kundens POST /api/preparation/[token] → customer_preparation → kundkortet | Befintlig validering, företagsavgränsning och compare-and-set behålls. Kontobyte monterar nu om kundunderlagsytan; omläsning tömmer den gamla bilden. |
| Underlag till offert | Manuellt granskat svar → QuotePreparationInput → quickInput/aiTextInput/sourceTranscript → buildQuotePayload → befintlig POST /api/quotes | Ny explicit överföring. Kund och förfrågan anges med ID; text och privata länkar läggs inte i URL. Befintlig text bevaras. Bara granskade svar kan läggas till. Bilder stannar på kundkortet och påstås inte ha analyserats eller bifogats. |
| Paketval | Befintliga tillval → applyPackage → QuoteBuilder/QuoteEditView → canonical quote_items | Gemensamt test bevarar option_selected/default, linked_product_id, component_snapshot och reservations_snapshot. Samma spar- och kunddokumentvägar används. |
| Dagsavslut | POST /api/matte/chat i rapportläge → signerat bekräftelsekort → befintlig verktygsrouter → tid/anteckning/material/pending_approvals | Ny omläsning av projektet efter saved/already_saved. Ingen omläsning som kvitto efter förslag eller misslyckande. Omläsningsfel får inte ändra sparresultatet eller ersätta projektet med en tom sida. |
| ÄTA till intäktskö | create_ata_draft → pending_approvals med project_id → loadRevenueRecoveryCases → intäktskö | Dagsavslutet länkar nu vidare till godkännandekön och Pengar. Test visar att ett pending projektförslag blir needs_review och länkar till /dashboard/approvals; det framställs inte som skapat ÄTA eller betald intäkt. |
| Offertsparande | Editorns fält → autospar/manuell sparning → samma PUT /api/quotes | Bakgrundssparningar serialiseras. Explicit sparning väntar in pågående autospar, och nya autospar startas inte under den explicita sparningen. |
| Återställning | Osparade fält → sessionStorage i samma flik → explicit återställning | Kopian skrivs även vid komponentens avmontering, före 500 ms-debounce. Källkontextbyte monterar om editorn. Mer av faktiskt påbörjat arbete aktiverar kopian, exempelvis enbart beskrivning eller AI-text. |
| CI | Samma tester → contracts.yml + feature-integration.yml | Tidigare separata tester kopplas in i ordinarie push/PR-körningar. Browserproven använder interceptade anrop och lokal Next-server; inga riktiga kundmeddelanden. |

## Avsiktliga gränser och kvarvarande bevis

- Uppdatering: Lars kontroll av svar och bilder är nu implementerad i granskningsgrenen. Aktivering kräver v213 och det inloggade provet; se tasks/lars-preparation-review.md.
- Projektkoppling och beständigt granskningsresultat tillkommer genom v213. En förfrågan inför första offert klassas aldrig automatiskt som ÄTA: hantverkaren väljer projekt och granskar tilläggstexten innan ett internt förslag skapas.
- Den ursprungliga migrationens SQL är oförändrad, endast omdöpt till v212_customer_preparation.sql enligt Claudes PR #7-kommentar. Claude rapporterade att migrationen körts och kontrollerats i produktion. Ingen ny SQL har körts i denna session.
- Produktionsdatans mängd och behörigheter har inte verifierats direkt här. Claudes PR #9-granskning rapporterade avsaknad av aktiva intäktsärenden; grenen skapar inte testärenden i produktion för att fylla kön.
- Autentiserad provning av verklig mikrofon/transkribering, AI-generering, DB-skrivningar och offertleverans återstår. Fixture-proven verifierar kopplingarna under kontrollerade förutsättningar, inte hela driftmiljön.

## Inloggat acceptansprov efter granskning

1. Skapa kundlänk på ett avgränsat demokonto, lämna svar och bilder, läs dem på rätt kundkort och markera manuellt granskat.
2. Följ Använd i ny offert. Lägg till svaren, kontrollera källtexten, generera/prissätt, välj paket och reservationer, spara. Öppna samma offert igen och kontrollera rader, artikelkopplingar, förbehåll och kunddokument.
3. Registrera tid och material på ett demoprojekt via dagsavslut. Bekräfta varje kort. Projektets vy ska uppdateras och återförsök med samma kort ska inte skapa dubbletter.
4. Föreslå ett faktiskt projektbundet tillägg. Bekräfta förslagskortet, öppna godkännandekön, kontrollera intäktskön som ägare/admin och följ vidare till riktigt ÄTA-utkast.
5. Upprepa läsning med annat företag och otillräcklig roll. Inga tidigare kundunderlag eller intäktsärenden får bli kvar synliga.

## Tidigare verifiering före Lars-utbyggnaden

- 184 gemensamma Playwright-prov godkända: 162 kontrakts-/funktionsprov och 22 isolerade Chromium-prov.
- 17 kundunderlagsprov godkända med verkliga route-handlers och simulerade databasanrop.
- 2 prov av kundens formulär godkända mot lokal Next-server, med interceptat API, på 375 och 1280 px.
- Totalt 203 tester. De överlappande utvecklingskörningarna räknas inte igen.
- TypeScript med 6 GB heap: exit 0. Produktionsbygge: exit 0. Befintliga Next/Sentry-varningar finns kvar.
- git diff --check: utan fel.
- Inga live-AI-anrop, kundutskick eller databasändringar utfördes för verifieringen.

## Senaste verifiering inklusive Lars-kontrollen

1 139 kontraktsprov + 17 Node-kontrakt + 25 komponentprov + 2 publika formulärprov godkända (1 183 totalt). TypeScript och produktionsbygge passerar. De två npm-kommandona motsvarar CI:s testlistor. Detaljer och obligatoriskt driftprov för v213: tasks/lars-preparation-review.md.
