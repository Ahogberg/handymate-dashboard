# Fakturering och offertaccept – sammanhängande leverans

Gren: `codex/invoice-acceptance-integrity-20260909`, bas: `codex/six-outcomes-20260909` (PR 34).

## Problemet och ändringen

Fakturan skapades före källmärkningen. En konflikt kunde lämna fakturan kvar och ge ett lyckat HTTP-svar utan varning. Alla nio identifierade källbaserade skapare skickar nu sina explicita tid-, material- och ÄTA-ID:n till `createInvoice`. Den nya serverfunktionen sparar faktura och källägarskap i samma transaktion. Konflikt, fel kund/projekt, otillåten ÄTA-status eller saknad källa rullar tillbaka hela operationen. Ingen fallback till separata skrivningar är tillåten för denna väg.

Samma källbaserade begäran återger den sparade fakturan efter förlorat svar. Ändrat innehåll med samma begäran avvisas. Projektavslutets automatiska väg och motsvarande godkännande har en stabil projektbaserad begärandenyckel även utan ÄTA. Nummerserien kräver sin fungerande RPC; en omkörning kan reservera ett oanvänt nummer men får inte skapa en dubblett. Den fristående manuella fakturavägen utan källor behöver en klientnyckel för motsvarande idempotens; den här leveransen påstår inte att alla godtyckliga fritextfakturor kan identifieras som samma avsikt.

Offertacceptens projekt-, affärs- och mejlsteg har nu en beständig journal som skapas i samma transaktion som kundens accept. Sparade steg körs inte om. Interna steg kan återtas efter ett avbrott med ett nytt tidsbegränsat anspråk; gamla arbetare kan inte skriva över nya kvittenser. Ett mejlanspråk löper aldrig ut till ett automatiskt återförsök. Falska/skippade mejlresultat blir inte skickatkvittens. Affärens faktiska vunnen-status återläses efter flytt.

I affärsvyn visas accepterade offerter som behöver slutföras. Aktiv ägare/admin kan återuppta projekt och affär. Återhämtningen skickar inga mejl eller demo-SMS. Osäkra eller ännu ej startade bekräftelser visas separat och kräver kontroll i den befintliga kundkontakten. Denna leverans innehåller ingen automatisk avstämning hos mejlleverantören och ingen knapp som låtsas att osäker leverans är bekräftad.

## Migrationsordning och gränser

1. Applicera `sql/v2_invoice_source_commit.sql` och `sql/v2_quote_acceptance_completion.sql`, alternativt motsvarande samlade migration `supabase/migrations/20260909195907_invoice_acceptance_integrity.sql`. Kör inte båda representationssätten i samma databas.
2. Verifiera funktionernas serverbehörigheter, journalens RLS, unikt begärandeindex och offerttriggern.
3. Driftsätt denna backend ovanpå hela basstacken. Starta inte nya källbaserade fakturaflöden på en miljö som saknar migrationerna.
4. Vid paus: behåll journal, fakturanycklar och kompatibel kod. Återgå inte till gamla separata fakturaskrivningar. Återställ aldrig osäkra mejlanspråk till pending utan leverantörsbevis.

Migrationerna är applicerade i isolerade testprojektet `eoodwyfxrdjmlqaealhj` och verifierade läsande: journal-RLS och trigger aktiva, begärandeindex finns, serverrollen får exekvera, publika användarroller nekas. Produktionsprojektet är inte migrerat i denna sprint. Äldre accepterade offerter backfylls inte automatiskt; det skulle kunna återutlösa gamla kundmeddelanden.

## Automatiserad verifiering

- SQL-prov kör de riktiga migrationsfunktionerna i isolerad PGlite: alla källtyper, total rollback, återförsök, ändrat innehåll, överlappande källor, fel kund/projekt, statusgränser, journalkoppling, anspråk och publika roller.
- Service-/HTTP-prov kör faktisk skapande- och acceptkod med simulerade beroenden: falsk/skippad/förlorad mejlkvittens, saknad journal, ägare/admin/anställd/inaktiv/anonym, konfliktsvar och återgivning av sparat faktura-ID.
- Återhämtningskomponenten renderas med blockerad projektstatus och osäker mejlkvittens. Facit kräver också att affärsskärmen faktiskt monterar komponenten.
- Bred kontraktsgrind och TypeScript/build ska vara gröna på levererad version. De nya proven ingår i `test:six-outcomes`, som körs av befintlig GitHub-grind.

## Återstående externa acceptansprov

1. Samma källa från två riktiga inloggade sessioner: en faktura, korrekt avvisad konflikt eller återläst kvittens.
2. Acceptera offert via kundportal och publik länk. Kontrollera projekt, vunnen affär och separat faktisk mejlkvittens.
3. Avbryt efter accepterad offert och återuppta via affärsvyn. Inga dubbla projekt och inget nytt mejl från återhämtningsknappen.
4. Kör hela fakturaunderlaget vidare genom den redan förberedda Fortnox-grinden och verifiera faktisk kundleverans separat.

Tekniskt godkänd kodleverans är inte samma sak som produktionsgodkänd kundkedja. Externa utskick, produktionsmigration, main-merge och nytt EAS-bygge ingår inte i denna verifiering.
