# Hela uppdragsresan — genomgång 2026-09-05

## Vad som faktiskt provats

Utgångspunkt: integrationsgrenen för PR #11, remote 05e4964 före denna ändring. Vercel rapporterade lyckad deployment för den committen. Browsern öppnade app.handymate.se och följde Öppna Handymate till Logga in; ingen inloggad session fanns. Ingen riktig AI-, Supabase- eller bildlagringsrundresa kunde därför genomföras. Det är inte ett godkänt driftprov av PR #11.

Repots tidigare Reality Week/golden-path-körbok återanvänds som referens; historiska gröna körningar räknas inte som bevis för dagens kod. De nya proven kör riktiga route-handlers och domänfunktioner med en simulerad databas som filtrerar företag/projekt och endast returnerar de kolumner som faktiskt väljs. Fakturaskapande och källmarkering fångas i testdubblar; inga kundutskick, betalningar eller riktiga fakturor skapas.

## Kedjan och bevisnivån

| Steg | Sparad källa och nästa konsument | Kontroll i denna genomgång |
|---|---|---|
| Kundunderlag → Lars → offert/ÄTA | customer_preparation, lars_review, quote-intag, pending_approvals | PR #11:s kontrakt återkörda i gemensamma kommandot. v213 och riktig modell/bildanalys fortfarande inte driftprovade. |
| Accepterad offert → projekt | quotes + quote_items → finalize-accepted/create-from-quote och getQuoteBudgetDerivation | Signerings-/idempotenskontrakt och projektbehörighet. Nytt beteendeprov hittade och rättade tappade valda tillval/rabatter i budget och timmar. |
| Artikelregister/reservationer → offert | linked_product_id och befintliga reservationer → offertens dokument/sparande | Befintliga reservationstester återkörda. Nytt fakturaprov bevarar artikelnummer, produkt-ID och uttrycklig arbetsandel 0. Inga nya lagerreservationer eller ändrad reservationssemantik. |
| Utfört arbete → tid/material | kanonisk tidsregistrering + project_material → invoices/from-project | Timpris-/skrivvägskontrakt. Läsfel i tid/material/inställningar stoppar nu hela underlaget. Projekt och kund måste stämma före fakturaskapandet. |
| ÄTA → fakturaunderlag | pending_approvals → project_change → signerade/godkända rader | Livscykel-/godkännandekontrakt och nytt route-prov: signerad ÄTA följer med, utkast gör det inte; rätt change_id skickas till markInvoiceSources. |
| Offert/projekt → slutfaktura | samma val/rabatter → preview och create-final-invoice | Nytt kedjeprov: 1 000 grundarbete + 200 valt tillval − 100 rabatt + 300 signerad ÄTA = 1 400 exkl. moms och 1 750 kunden betalar. Bortvalt 9 000 och delsummerad räknas inte. Äldre JSONB-offerter provas också. |
| Projektavslut → autofakturautkast | byggProjektFakturaUnderlag → createInvoice | Fel i offert/rader/ÄTA/befintliga fakturor stoppar kompositionen. Kundens belopp räknas från det nya underlaget efter ÄTA. |
| Faktura → leverans | createInvoice → sendInvoice → faktisk leveransstatus | Befintliga kärn-/leveranskontrakt återkörda; ingen verklig Resend/46elks/Fortnox-leverans utförd. |
| Betalning → betalt/efterarbete | payment-decision + applyInvoicePayment + Fortnox-klassificering | Befintliga betalstatuskontrakt återkörda. Ingen bank-/Fortnox-transaktion utförd. Begränsningen kring manuell delbetalning nedan kvarstår. |

## Rättade och reproducerade fel

1. Projektbudget och budgettimmar tappade valda tillval; rabatter ignorerades. Både tabellrader och äldre JSONB följer nu kundens val.
2. Slutfakturan hade en egen mappning: valda tillval fick inte vanlig radtyp, och avtalade rabatter drogs inte av. Båda fakturavägarna använder nu den befintliga gemensamma mapparen.
3. Fakturaförhandsvisningen summerade andra rader än slutfakturan, inklusive bortvalda tillval. Nu används samma mappning och rabattprincip. Ett uttryckligt tomt val återupplivar inte en gammal offerttotal.
4. Autofakturautkastets customerPays kunde vara offertens gamla belopp trots tillagt ÄTA. Det räknas nu från det sammansatta underlaget; moms avrundas till ören.
5. Autofakturautkast kunde tolka läsfel som tomma listor och använda en gammal JSONB-spegling eller bara ÄTA. Läsfel stoppar nu kompositionen.
6. Noll antal och noll aktuellt pris kunde ersättas av 1 respektive gammalt legacy-pris. Gemensamma mapparen bevarar uttryckliga nollvärden.
7. Tid/material-underlag kunde visas ofullständigt vid läsfel. Hela svaret stoppas nu med fel.
8. Faktura från projekt kunde skapas utan giltigt projekt eller med fel kund. Servern kräver nu ett projekt inom företaget och samma kund.

De första nio nya regressionerna var röda före rättningen. Ett senare budgetprov reproducerade samma tillvalsglapp tidigare i kedjan. Slutversionen innehåller 14 nya beteendeprov. Inga nya databaskolumner eller migrationer behövs för dessa rättningar; kolumnerna kommer från befintliga queries/schemafiler. Deras driftfunktion är inte direkt verifierad här.

## Kvarvarande risker — inte gröna bara för att kontrakten passerar

- **Inloggat driftprov är fortfarande blockerat av åtkomst.** Kör v213 och verifiera SELECT/trigger enligt tasks/lars-preparation-review.md. Logga därefter in på ett avgränsat demokonto och kör hela kedjan med omläsningar.
- **Upprepad slutfakturering saknar ett heltäckande skydd.** create-final-invoice saknar samma befintlig-faktura-kontroll som autofakturans underlag. Fakturanummer-RPC:n hindrar inte två olika fakturor för samma arbete. Källmarkering sker efter insert. Ett verkligt samtidighets-/återförsöksprov och samordnat skydd mellan manuell slut-, tim- och autofakturering återstår; detta är inte åtgärdat i denna leverans.
- **Manuell delbetalning har begränsad semantik.** payment-decision och dess befintliga test anger uttryckligen att ett delbelopp utan ROT blir paid; även ROT-grenen jämför med totalen utan att först kräva hela kundandelen. Att dessa kontrakt passerar innebär inte att generell delbetalning är korrekt hanterad. Detta behöver ändras tillsammans med registreringsvyn, kvittot och påminnelserna och är inte ändrat här.
- **Förhandsvisning och slutlig avdragsberäkning använder olika årstakskällor.** Preview använder den rena avdragsfunktionen, medan skapandet använder kundens återstående årsutrymme. Dagens rättningar bevisar rad-/tillvalssumman, inte full avdragsparitet för en kund med tidigare nyttjat utrymme.

Dessa risker ska inte döljas bakom ett totalt grönt testantal. Granskningen är genomförd på kod-/kontraktsnivå; hela resan är inte frisläppt som driftverifierad.

## Driftprov när åtkomsten finns

Använd det befintliga demokontot och Reality Week-körboken. Skapa en ny testkund och en offert med grundrad, valt/bortvalt tillval, rabatt och artikelkoppling. Acceptera, kontrollera projektbudget/timmar, registrera tid/material, gå genom Lars → granskat projektbundet ÄTA-förslag → kundgodkännande, jämför preview med sparad faktura och läs om varje steg. Prova källfel, återförsök och samtidig slutfakturering innan något sänds. Först därefter kontrollerad leverans till en verifierad testmottagare och betalstatus. Gör inget utskick till riktiga kunder för att fylla testdata.

## Verifieringsresultat

- `CI=true npm run test:contracts`: 1 415 godkända Playwright-prov och 17 godkända Node-kontrakt. Ett befintligt test i send-invoice-core är uttryckligen skip-markerat; det är inte räknat som godkänt.
- 14 nya beteendeprov i project-invoice-journey.spec.ts ingår i ovanstående antal. Överlappande utvecklingskörningar räknas inte igen.
- Samma nya specar finns i package.json och CI och kontrolleras av paritetstestet.
- Inga browserkomponenter ändrades i denna rättning; tidigare mobilprov är inte omräknade som nya driftbevis.
- TypeScript `--noEmit`: exit 0. Produktionsbygge: exit 0. Befintliga Next/Sentry-varningar kvarstår; ingen sådan varning räknas som driftbevis.
- `git diff --check`: utan fel.
