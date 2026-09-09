# Sex kundutfall — teknisk sprint och pilotfacit

Status: pågående, inte produktcertifiering. 2026-09-09.
Backendbas 647793c6c7380a32cd9f06545ff641c1a9ce38bd; mobilbas d797ccb.
Arbetet ligger på egen gren codex/six-outcomes-20260909 ovanpå integrationen.
Ingen ny produktionssättning eller migration. Mobilkandidaten under telefonbygge ändras inte här.

## Kartläggning och bevisläge

| Område | Implementerad grund och kod | Tekniskt bevis | Kvar före slutgodkännande |
|---|---|---|---|
| 1 Förfrågan | lib/leads/golden-path.ts, app/api/leads/intake/route.ts, Lisa-inflöden | Nytt verkligt helperprov stoppar fortsättning vid fel/utebliven kundrad; befintliga Lisa-kontrakt | Verkligt samtal/SMS, formulär och email. Lead/deal är inte en atomisk transaktion; upprepade publika förfrågningar saknar generell request-idempotens. Kundmatchningens läsfel behöver eget facit. |
| 2 Offert | lib/quotes/generated-price-truth.ts, job-type-setup/start, buildQuotePayload | first-quote-reality-harness: prislista → reservation → sparning → återöppning. first-job-acceptance ingår i breda grinden | Christophers verkliga prislista och två representativa jobb; mäta kompletteringar, rättningar och nettotid |
| 3 Uppföljning | lib/followup/service.ts, sql/v2_durable_quote_followup.sql | Faktisk SQL: plan/idempotens, konkurrerande körningar, inkommande SMS/email/portal/samtal, signering, paus, ändrad kund/underlag; route-prov | Verkligt leverantörssvar, svar efter förberett beslut, handläggarens nästa steg när planen stoppats |
| 4 Fakturaunderlag | lib/matte/report-session.ts, work-report.ts, lib/invoices/mark-sources.ts | report-continuity/recovery med SQL, befintliga fakturakällor/ÄTA/betalplan-prov | Riktigt jobb med tid, material, signerad ÄTA, delfaktura/slutfaktura och faktisk ekonomisystemavstämning |
| 5 Administration | import/onboarding + lib/invoices/sync-to-fortnox.ts och lib/fortnox/sync.ts | Nytt körbart helperfacit för leverans och osäkra försök | Automatisk avstämning av osäkra Fortnox-anrop, verklig import, dubbelinmatningsmätning och bokföringsprov |
| 6 Nytta | lib/value/ledger.ts och recovered-revenue.ts | Verkligt I/O-prov med fakturastatus, plus befintliga 4-stegs-prov | Nettotid saknar här uppmätt före/efter-baslinje. Kopplade utfall är inte bevis på kausalt skapad merintäkt. Kundbetalt ROT-belopp vs hela fakturabeloppet behöver fortsatt granskning. |

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
- Full TypeScript och Next-build: resultat inväntas; inte markerade gröna.
- Inget faktiskt SMS/email/e-faktura skickat i denna leverans.

## Fortsatt ordning

- [ ] S1: inmatningsidempotens/återhämtning lead→deal och synliga kvarstående fel.
- [ ] S2: osäkra Fortnox-resultat ska kunna avstämmas utan ny faktura-POST.
- [ ] S3: kundbetalt/skattereduktion och kausalitet i värdevisning.
- [ ] S4: Christophers underlag och uppmätt offert-/rapportarbete.
- [ ] S5: gemensamma acceptansprov över båda arbetskedjorna med rätt mobilbuild.
- [ ] Alla sex utfall slutgodkända med bevis. Aldrig enbart på grund av gröna enhetstester.
