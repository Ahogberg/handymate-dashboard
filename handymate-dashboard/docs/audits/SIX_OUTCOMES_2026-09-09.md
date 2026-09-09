# Sex kundutfall — teknisk sprint och pilotfacit

Status: pågående, inte produktcertifiering. 2026-09-09.
Backendbas 647793c6c7380a32cd9f06545ff641c1a9ce38bd; mobilbas d797ccb.
Arbetet ligger på egen gren codex/six-outcomes-20260909 ovanpå integrationen.
Ingen ny produktionssättning eller migration. Mobilens fyra telefonfynd är rättade separat i mobil-PR #6 (grön grind och iOS-export). Den här sprinten gäller hela produktkedjan.

## Kartläggning och bevisläge

| Område | Implementerad grund och kod | Tekniskt bevis | Kvar före slutgodkännande |
|---|---|---|---|
| 1 Förfrågan | lib/leads/golden-path.ts, app/api/leads/intake/route.ts, Lisa-inflöden | Nytt verkligt helperprov stoppar fortsättning vid fel/utebliven kundrad; befintliga Lisa-kontrakt | Verkligt samtal/SMS, formulär och email. Lead/deal är inte en atomisk transaktion; upprepade publika förfrågningar saknar generell request-idempotens. Kundmatchningens läsfel, tvetydiga träffar och kvittenser är nu facit-låsta; full request-idempotens/återhämtning återstår. |
| 2 Offert | lib/quotes/generated-price-truth.ts, job-type-setup/start, buildQuotePayload | first-quote-reality-harness: prislista → reservation → sparning → återöppning. first-job-acceptance ingår i breda grinden | Christophers verkliga prislista och två representativa jobb; mäta kompletteringar, rättningar och nettotid |
| 3 Uppföljning | lib/followup/service.ts, sql/v2_durable_quote_followup.sql | Faktisk SQL: plan/idempotens, konkurrerande körningar, inkommande SMS/email/portal/samtal, signering, paus, ändrad kund/underlag; route-prov | Verkligt leverantörssvar, svar efter förberett beslut, handläggarens nästa steg när planen stoppats |
| 4 Fakturaunderlag | lib/matte/report-session.ts, work-report.ts, lib/invoices/mark-sources.ts | report-continuity/recovery med SQL, befintliga fakturakällor/ÄTA/betalplan-prov | Riktigt jobb med tid, material, signerad ÄTA, delfaktura/slutfaktura och faktisk ekonomisystemavstämning |
| 5 Administration | import/onboarding + lib/invoices/sync-to-fortnox.ts och lib/fortnox/sync.ts | Nytt körbart helperfacit för leverans och osäkra försök | Automatisk avstämning av osäkra Fortnox-anrop, verklig import, dubbelinmatningsmätning och bokföringsprov |
| 6 Nytta | lib/value/ledger.ts och recovered-revenue.ts | Verkligt I/O-prov med fakturastatus, plus befintliga 4-stegs-prov | Nettotid saknar här uppmätt före/efter-baslinje. Kopplade utfall är inte bevis på kausalt skapad merintäkt. Nyttovyn använder nu registrerat paid_amount för kundbetalda fakturor; verklig avstämning av betalningskedjan återstår. |

## Första rättningar: fel före, grönt efter

1. Kundinsert: helpern använde genererat kund-ID även om INSERT misslyckades
   eller ingen kund returnerades. Nu stoppas lead och Fortnox-hook med tydligt fel.
2. Värdeliggare: draft/cancelled/credited med direkt fakturareferens räknades som
   fakturerat. I/O-lagret accepterar nu bara kanoniska synliga fakturastatusar.
3. Leverans: bokföringssynk till Fortnox markerade manifestet levererat även utan
   lyckad e-faktura. Nu sker det bara efter e-fakturasvar; annan leverans ägs av sendInvoice.
4. Fortnox: pending-timeout fick skapa igen. Ny jämför-och-sätt-claim tillåter en
   skrivare; misslyckad claim stoppar externa fakturaanrop. Osäkert providersvar
   och förlorad lokal kvittens behåller pending och returnerar inte lyckat.
   Kunduppslaget är även explicit företagsskopat.

Begränsning för punkt 4: ingen automatisk återställning av osäkert pending-läge
är byggd i denna leverans. Kontrollera extern faktura via lokal invoiceId som
ExternalInvoiceReference1 eller känt Fortnox-nummer. Återställ aldrig pending
blint till failed: ett negativt/timeout-svar bevisar inte att fakturan saknas.
Äldre failed-rader kan härröra från tidigare osäkra försök och behöver avstämning
före skarp aktivering. Detta är en öppen releasepunkt, inte ett löfte om full
självläkning. Fortnox externalprint-ordning och externa kundskapandeförsök behöver
fortsatt granskning separat från den nu låsta faktura-POSTen.

## Prov som Andreas och Christopher kan genomföra

Använd bara syntetiska mottagare/testföretag tills riktig kundkontakt uttryckligen
är beslutad. Mobilprofil vision-testflight till isolerad backend för appprovet.
Lisa-provet är separat med fungerande nummer och saldo. Riktig fysisk telefon,
rollprovskonto och mobilnät är fortsatt obligatoriskt före main.

| Prov | Gör så här | Anteckna |
|---|---|---|
| A Förfrågan | Skicka en förfrågan med namn, kontakt och jobbeskrivning. Kontrollera kund, ärende och nästa steg. Prova missat samtal separat. | Kanal, tid, ärende-ID, saknade/felaktiga uppgifter, extra handarbete |
| B Offert | Använd ett riktigt men avidentifierat jobb och egen prislista. Förbered, granska, rätta, skicka till testmottagare. | Start/sluttid, rättningar, saknade uppgifter, pris- och omfattningsfel |
| C Uppföljning | Planera uppföljning, låt testkunden svara före utskick; prova sedan signering i separat fall. | Plan-ID, vad som stoppades, nästa synliga handling |
| D Rapport | Rapportera tid/material/ÄTA, bryt nätet, återöppna och slutför samma rapport. | Rapport-ID, kvittens, eventuell dubblett eller förlorad del |
| E Faktura | Granska underlag med vald ÄTA och eventuell tidigare delbetalning, prova synk i godkänd testuppsättning. | Underlag/faktura-ID, totalsumma, källor, vad ekonomisystemet visar |
| F Nytta | Jämför samma arbetsmoment med tidigare arbetssätt. Följ ett utfall från källa till faktura. | Nettotid inklusive rättningar; vad som är kopplat utfall respektive faktiskt extra affär |

Ingen behöver formulera en teknisk felrapport: skärmbild + vad ni försökte göra +
vad ni väntade er + ungefärlig tid räcker. Inga lösenord i protokollet.

## Validering i denna arbetskopia

- 17 nya körbara helper-/I/O-prov; databas och externa leverantörer mockade.
  De identifierade felen reproducerades på basen före rättning.
- 108 riktade befintliga prov gröna, inklusive faktisk SQL för beständig
  uppföljning och rapportkontinuitet. Lokal isolerad testdatabas, inte produktion.
- Bred kontraktsgrind: 1772 passerade, 1 befintligt överhoppat, 17 Node-prov.
- Första omgångens fulla TypeScript och samtliga fem GitHub-grindar gröna. Next-build saknar ännu dokumenterad fullständig slutkvittens.
- Inget faktiskt SMS/email/e-faktura skickat i denna leverans.

## Fortsatt ordning

- [ ] S1: inmatningsidempotens/återhämtning lead→deal och synliga kvarstående fel.
- [ ] S2: osäkra Fortnox-resultat ska kunna avstämmas utan ny faktura-POST.
- [ ] S3: kundbetalt/skattereduktion rättat i ledger-metod 2; kausalitet och faktisk betalningsavstämning återstår.
- [ ] S4: Christophers underlag och uppmätt offert-/rapportarbete.
- [ ] S5: gemensamma acceptansprov över båda arbetskedjorna med rätt mobilbuild.
- [ ] Alla sex utfall slutgodkända med bevis. Aldrig enbart på grund av gröna enhetstester.


## Andra omgången: kundmatchning och registrerad betalning

- Dubblettuppslag kastar vid databasfel i telefon, e-post eller namn/adress.
  Ett läsfel får inte leda till att en ny kund skapas.
- LIKE-specialtecken behandlas bokstavligt. Svar verifieras dessutom med
  faktisk likhet, så t.ex. understreck i e-post inte matchar annan kund.
- Flera starka telefon-/e-postträffar stoppar automatisk kundkoppling.
  Kundkompletteringen är företagsskopad och kräver sparad rad; affär utan
  returnerat ID får tydligt dealError.
- Ledger-metod 2 använder registrerat paid_amount för betalsteget och dess
  detaljrad. Fakturerat behåller fakturans total. Äldre helt betalda fakturor
  utan paid_amount använder total; customer_paid utan beloppsbevis räknas
  inte som bekräftade kronor. Negativa/ogiltiga belopp utesluts; överbetalning
  räknas högst till den direktkopplade fakturans belopp. Påminnelser följer
  samma betalningsregel och behåller sitt befintliga tidsfönster.

Bevis: 42 helper-/I/O-prov, varav 25 nya; 20 fel reproducerade mot föregående
helpers. 76 befintliga ledger-/betalstatus-/kundsynkprov gröna. Kolumner och
literal ILIKE-matchning verifierade läsande mot isolerade testdatabasen
(eoodwyfxrdjmlqaealhj), inga kunddata ändrade. Full grind/tsc/build för denna
omgång redovisas i PR #34 när körningarna är klara.

Avsiktlig kvarstående gräns: detta är inte generell request-idempotens eller
atomiskt lead→deal. Saknad kundkoppling stoppar fortfarande anropet; en
beständig mottagningskö med återhämtning behövs för att slippa tappa ett
inflöde när ett sådant fel inträffar. Nästa S1-arbete ska täcka det hela vägen
från inkommande request, inte bara lägga till en lookup före INSERT.

## Tillagda testfall för Andreas och Christopher

Kör i testföretaget. Databasfel och samtidighet injiceras av Codex i de
tekniska proven; ni behöver inte manipulera databasen.

| ID | Test | Förväntat resultat |
|---|---|---|
| A2 | Samma kund med 070-format och +46-format | Befintlig kund återanvänds; ingen ny kund på grund av formatet. |
| A3 | E-post med understreck, t.ex. test_kund@example.invalid | Får inte kopplas till testXkund@example.invalid. |
| A4 | Flera kunder med samma kontaktuppgift | Ingen godtycklig sammanslagning; förfrågan behöver granskning. |
| A5 | Avbruten hämtning/sparning och nytt försök | Ingen falsk sparbekräftelse. Kontrollera kund-, förfrågnings- och affärs-ID samt antal rader. För det beständiga intake-flödet återanvänds samma Idempotency-Key; kund, förfrågan och affär ska finnas exakt en gång. |
| F2 | Faktura 1 500 kr, registrerat betalt 1 000 kr, status kundens del betald | Fakturerat 1 500 kr; bekräftat betalt 1 000 kr, även i detaljraden. |
| F3 | Kundens del betald men registrerat belopp saknas | Hela fakturabeloppet får inte visas som bekräftat betalt. |
| F4 | Utkast, makulerad eller krediterad faktura med kopplat agentkort | Ska inte räknas som fakturerat eller betalt i nyttovyn. |
| F5 | Samma faktura länkad från flera kort | Beloppet räknas en gång. Påminnelse skapar inte ny fakturerad intäkt. |

Anteckna vad ni gjorde, förväntat/faktiskt resultat, berörda ID:n och en
skärmbild. A4/A5 som ännu behöver återhämtning är inte slutgodkända av att
systemet bara stoppar en felaktig skrivning.


## Tredje omgången: beständig formulärmottagning

`POST /api/leads/intake` med `Idempotency-Key` sparar först en beständig
mottagningskvittens. Därefter sparas kund, lead, affär och räknare atomiskt.
Samma företag/källa/nyckel återanvänder kvittensen; ändrat innehåll ger 409.
Ett lagringsfel lämnar mottagningen som blockerad med möjlighet att försöka
igen. Ett osäkert RPC-svar får aldrig falla tillbaka till gamla INSERT-flödet.

Ägare/admin kan granska och återuppta i dashboardens pipeline, under
"Mottagna förfrågningar att kontrollera". Anställda nekas av servern och
panelen monteras bara för aktiv ägare/admin i aktuellt företag. Aviseringar
har en separat atomisk claim: försökt/osäkert återutskick görs inte automatiskt.
Sparade entiteter betyder inte att SMS/event eller Fortnox kundsynk är bekräftade.
Den senare är fortfarande best-effort och har inte en egen återhämtningskö.

Migration: `sql/v2_durable_lead_intake.sql`, tillämpad **endast** på isolerade
`eoodwyfxrdjmlqaealhj`. Tabellen är RLS-skyddad och funktioner/tabell saknar
anon/authenticated-åtkomst; API använder service-klient efter autentisering.
Kvittensen innehåller kontaktuppgifter och ingår därför i kontoradering.
Inga nya säkerhetsadvisors nämner dessa objekt.

Bevis: 42 tidigare helperprov + 11 verkliga SQL-prov i PGlite + 35
service/API-prov med mockade externa effekter. SQL-proven täcker fel i sista
INSERT, rollback inklusive räknare, saknat steg, tvetydig kund, ändrat innehåll,
normalisering och behörighet. Tre parallella anrop mot riktiga isolerade
Postgres gav samma kund-/lead-/affärs-ID, en rad av varje och attempts=1.
Det syntetiska testföretaget med alla provrader är borttaget efter kontrollen.
Inga SMS, mejl eller Fortnox-anrop utfördes i databasprovet.

Bred lokal grind: 1771 passerade och en befintlig skip; den nya tabellen
utlöste kontoraderingsvakten. Efter att tabellen lagts i RADERAS passerade
hela den berörda sviten (29/29), samt 17 Node-prov. TypeScript och full
Next-build passerade före den sista UI-behörighetsavgränsningen; slutkontroll
redovisas i PR. Build använder syntetisk konfiguration, inte externa tjänster.

Avgränsning: opt-in för anrop med stabil nyckel. Befintliga formulär utan
header, widget, Lisa och e-postvägar har ännu inte generell beständig
mottagning. Låsningen serialiserar denna väg per företag, inte andra äldre
kundskrivare. Det går inte att garantera dubblettfrihet mellan dessa vägar.
Pilotprov A4/A5 och visuell granskning av återhämtningspanelen återstår.
Nästa tekniska steg är Fortnox-avstämning av osäkra och historiska failed-resultat.
