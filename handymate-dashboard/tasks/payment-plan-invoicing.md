# Fakturera enligt betalplan — separat tillägg

Bas: PR #11, egen gren codex/payment-plan-invoicing. Tillägget hålls avstängt tills migration, CI och inloggat prov är verifierade senast 2026-09-10. Annars efter lansering. PR #11 ändras inte av arbetet.

## Källor kontrollerade före implementation
- Skatteverket, Så fungerar rotavdraget för företag: https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/safungerarrotavdraget.4.2ef18e6a125660db8b080002709.html
- Skatteverket, betalning av del av faktura: https://www.skatteverket.se/foretag/etjansterochblanketter/svarpavanligafragor/rotochrutarbete/foretagrotochrutarbetefaq/narskajagsomutforareansokaomutbetalningdakundenbetalatbaraendelavfakturabeloppetexempelvisviddelfaktureringochvadhanderombetalningargorspabadasidornaavettarsskifte.5.71004e4c133e23bf6db800013003.html
- Fortnox ordinarie API: https://api.fortnox.se/apidocs

ROT ska framgå per faktura och arbetskostnaden dokumenteras per steg. Ansökan kräver utfört och betalt arbete. Betalningsåret styr; arbete och ansökan måste vara klara senast 31 januari följande år vid förskottsbetalning. Rättslig vägledningssida gav Request Rejected; företagsvägledningen och FAQ användes. Ingen generell flytt av ROT till slutfakturan.

## Avgränsning och invariant
- Accepterad offert, uttrycklig befintlig betalplan som summerar till 100 %, samma kund/företag/projekt. Ingen automatisk inferens från manuella a conto-fakturor.
- Steg 1..n-1 är delfakturor; sista steget slutavräknar den låsta offerten. ÄTA hålls i befintligt separat flöde; blandat manuellt fakturerat underlag måste granskas innan aktivering.
- Belopp fördelas i heltalsören med kumulativ avrundning. Varje steg får dokumenterad arbets-/materialandel, moms och ROT.
- Aktivering fryser offert och betalplan. Databastransaktion låser planen och skyddar steg, tak, krediter och fakturainsert tillsammans. Service-role-only RPC, egna RLS-tabeller; inga klientstyrda belopp.
- Kreditering återför exakt den tidigare delfakturans belopp och avdrag. En krediterad etapp skapas inte automatiskt igen; återstoden hamnar i slutavräkningen. Delkrediter kräver separat bedömning i denna första version.
- Befintliga fakturaflöden berörs bara av opt-in-koppling för nya planfakturor, avräkning och nödvändiga skydd. Ingen aktivering på befintliga projekt med redan manuellt fakturerat underlag.

## Arbetsplan
- [x] Kontrollera primära ROT-källor och befintlig betalplan/Fortnox/kreditkod.
- [x] Bygg beräkning, atomisk lagring och verkliga SQL-prov.
- [x] API och projektvy; opt-in-avräkning i slutfaktura/preview.
- [x] ROT-ansökningsgrind, Fortnox- och kreditprov.
- [ ] TypeScript/build/CI och separat draft-PR.
- [ ] Kör migration och inloggat demo-/Fortnoxprov före aktivering; åtkomst saknas i denna session.

## Levererat för granskning
- `sql/v214_payment_plan_invoicing.sql`: tjänsterollsbegränsade RPC:er, RLS, lås för aktivering och fakturering, unik etapp, oföränderligt fakturabelopp och avdragsreservation inklusive utkast. Nummer/OCR kommer från befintlig fakturakärna och v81, utan osäker nummerseriefallback.
- `/dashboard/projects/[id]/payment-plan`: förhandsvisning, aktivering, delfakturautkast, slutavräkning, befintliga faktura-/kreditlänkar och bekräftelse av utfört arbete. Befintlig slutfakturaknapp och förhandsvisning går till planen för aktiverade projekt.
- Sista fakturans ekonomiska rader innehåller återstoden; dokumenttexten visar offertbelopp och tidigare nettodebitering. Den lägger inte samtidigt på hela offerten och en andra skattereduktion.
- Full kredit kopplas till original, projekt och offert. Kreditutkast spärrar nästa etapp och ROT-ansökan. När kreditfakturan får utfärdad status avräknas beloppet och originalet markeras krediterat i samma transaktion.
- Fortnox ordinarie OpenAPI hämtades från https://api.fortnox.se/apidocs och dess inbäddade spec lästes. `PUT /3/invoices/{DocumentNumber}/credit` returnerar originalets `CreditInvoiceReference`; testet använder inte originalets DocumentNumber som kreditnummer.
- Fortnox-claim tillåter inte två parallella POST eller ett blint återförsök efter osäkert svar utan sparad dokumentreferens. Sparad referens återanvänds. Avdrag och fakturabelopp kontrolleras före kundleverans; avvikelse stoppar utskick.
- Nya kontrakt finns både i package.json och CI. De tre berörda Fortnox-facitsviterna är också tillagda i båda. Mobilproven ingår i samma feature-integration-kommando som CI.

## Avgränsningar — får inte döljas vid lanseringsbeslutet
Detta är inte bevis för full driftfunktion. Båda flaggorna `PAYMENT_PLAN_INVOICING_ENABLED=true` (server) och `NEXT_PUBLIC_PAYMENT_PLAN_INVOICING_ENABLED=true` (projektmenyn) ska lämnas avstängda i produktion tills nedanstående är provat. De behöver aktiveras i den isolerade demomiljön för provet.

- Första versionen kräver accepterad offert, 25 % moms, 2–10 steg och högst en ROT/RUT-typ. Blandade avdrag och grön teknik stoppas. Befintliga manuella a conto-fakturor importeras inte.
- **ROT-förskott med Fortnox är ännu inte ett komplett förskottsflöde:** fakturautkastet kan skapas, men export/utskick via Fortnox stoppas tills arbetet är bekräftat utfört. Fortnox beteende för förskott, avdragsregistrering och ansökan måste driftprovas och kompletteras innan detta kan utlovas för lansering.
- Fortnox avrundning och skattereduktion måste matcha fakturan inom ett öre. Företagsinställningar eller hela-kronor-avdrag som ger större avvikelse stoppar utskick och behöver avstämning; koden ändrar inte tyst kundens belopp.
- Bara helkrediter ingår. Redan begärd/utbetald ROT, kredit av tidigare etapp efter slutavräkning och delkredit kräver separat avstämning. En krediterad etapp skapas inte igen; beloppet går tillbaka till slutavräkningen. Efter kredit av slutfakturan öppnas planen inte automatiskt på nytt.
- Utkast måste skickas före nästa etapp. Belopp kan inte ändras via vanliga editorn och det finns ännu ingen ångra-/avsluta-väg för en aktiverad plan med felaktigt skapat utkast. Detta ska bedömas vid granskningen, inte döljas bakom att testerna är gröna.
- Årstaket utgår från avdrag registrerade för kunden i detta företag, inklusive utkast. Det är inte ett direkt saldo från Skatteverket eller andra utförare. Betalning över årsskifte behöver ingå i provet.
- ÄTA går separat. Funktionen avräknar inte äldre manuella projektfakturor och reparerar inte PR #11:s generella slutfakturaspärr för sådana projekt.

## Verifiering och vad proven faktiskt bevisar
- PGlite kör PostgreSQL och den verkliga v214-migrationen, med minimal befintlig tabellfixture. Testet går även genom `createPlanInvoice` → gemensamma `createInvoice` → v81-numrering → RPC → faktura/register → slutavräkning.
- SQL-prov: återförsök, köade samtidiga anrop, maxbelopp, fel företag/ordning, avdragsutkast, kreditutkast kontra utfärdad kredit, redigerings-/borttagningsspärr, klientrollens nekade åtkomst och Fortnox-claim. PGlite har en anslutning: detta ersätter inte två oberoende Supabase-sessioners samtidighetsprov.
- Mobilprov kör den riktiga React-sidan med interceptade API-svar, inklusive aktivering, korrekt steg-ID utan klientbelopp, navigering och blockerad nästa etapp. Ingen riktig faktura skickas i dessa prov.
- Rena Fortnox-prov verifierar kreditreferens, återanvändning, utebliven referens och beloppsavvikelse. De använder inga Fortnox-token och är inte ett Fortnox-driftprov.

## Inloggad provningsordning — före aktivering senast 10 september
1. Applicera v214 på demodatabasen. Spara faktisk schema-/RPC-evidens, testa separat användare från annat företag och två samtidiga sessioner. Produktionsmigration är INTE körd av Codex.
2. Skapa och acceptera en offert med arbete, material, rabatt, valt/ovalt tillval och betalplan 40/40/20. Aktivera. Klicka första etappen samtidigt i två sessioner: samma invoice_id och en registerpost.
3. Granska PDF, kundbelopp, arbetsunderlag, moms och avdrag. Skicka via demokontots ordinarie leverans till en egen testmottagare. Ingen kund får användas som testmottagare.
4. Skicka etapp två och skapa sista steget från både projektsidan och befintliga slutfakturaknappen. Samma slut-ID; summan exakt offertbelopp. ÄTA ska hållas separat.
5. Ny testplan: kreditera första utfärdade etappen. Kreditutkast får inte frigöra belopp; utfärdad kredit ska återföras exakt i sista steget. Upprepat kreditanrop ska returnera samma kredit.
6. ROT: ingen ansökan före utfört arbete och kundbetalning, pending kredit stoppar ansökan, årsskiftet och 31 januari provas. Kontrollera registrerat årsutrymme och faktisk XML.
7. Fortnox demo: debit, slutavräkning och kredit måste ha rätt dokumentreferenser och exakt belopp. Simulera tappat svar och läsfel: ingen andra debet eller felaktig kundleverans. Prova ROT-förskott och avrundning särskilt; kvarstående spärr innebär att den delen inte är lanseringsklar.
8. Om komplett driftprov och produktbeslut om avgränsningarna inte är klara senast den 10:e: lämna flaggorna av och flytta funktionen efter lansering. PR #11 ändras inte av denna leverans.

## Lokalt verifierat på leveransen
- TypeScript: exit 0.
- `CI=true npm run test:contracts`: 1 485 Playwright-prov gröna, 1 befintligt överhoppat, samt 17 Node-prov gröna.
- `payment-plan-invoicing.ui.spec.ts`: 2 gröna mobil-/gränssnittsprov med interceptat API.
- Produktionsbygge och GitHub-CI redovisas på PR:n efter avslutad körning.

## Rättning efter Claudes granskning av f3c0139
- Projektlåset tas enbart vid INSERT. En vanlig UPDATE returnerar omedelbart när OLD.payment_plan_quote_id är null; status, betalning och cronuppdateringar gör då inga betalplansuppslag eller projektlås.
- Fristående INSERT utan projekt, offert eller betalplansreferens returnerar också direkt. En angiven betalplansreferens kontrolleras fortfarande mot registret.
- Skyddet för befintliga planfakturor och krediter behålls. Offertkopplad INSERT behåller låset även utan project_id, så att aktivering och samtidig vanlig fakturaskapning fortfarande serialiseras.
- 27 betalplansprov gröna. Nya PGlite-prov läser pg_locks i samma transaktion: vanliga UPDATE och fristående INSERT saknar RowShareLock på project; offertkopplad INSERT har det. Positiv kontroll visar att provet faktiskt observerar låset. Källfacit låser också operationsgrenarna.
- Rekommendation: aktivering efter lansering, med driftprov veckan efter den 14:e när åtkomst finns. INSERT på en kopplad vanlig faktura tar fortfarande ett lås efter migrationen; appflaggorna är inte en avstängning av SQL-triggern.
- v214 är fortfarande INTE körd i demo eller produktion av Codex. Ingen retarget ännu: #11 är fortfarande öppen. PR #12 förblir draft och avstängd.
