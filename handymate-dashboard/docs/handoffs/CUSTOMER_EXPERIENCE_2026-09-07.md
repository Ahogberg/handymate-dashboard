# Kundens första intryck och värde — leverans 7 september 2026

## Uppdrag och baslinje

Fyra godkända arbetsområden: första tio minuterna, hantverkarens kundresa, sanna produktlöften och användbara kund-/partnermallar. Arbetet följer beslutet om små förbättringar före lansering 14 september. Ingen ny onboardingmotor, större agentfunktion eller ny konkurrerande lanseringsgrind.

Dashboard utgår från `7e3ef33468065331dbe5cfc6ac39189a985c4888`. Mobilens granskade main är `853f61744e83f2d8006ca2b01e6374aa5164f806`; ingen mobilkod ändras i detta pass. Publika webbplatsens ändringar ligger separat i `Ahogberg/handymate-landing`, branch `codex/customer-promises-20260907`. Repo-instruktioner och befintliga launch-/löftesunderlag har lästs. Befintlig beloppsfix från PR #19 ingår redan i main och byggs inte om här.

Vercels status för dashboard-main var success vid läsningen. Committextens uppgifter om nattsvit är författarens rapport, inte en lokalt körd eller självständigt verifierad nattsvit. Mobilens kombinerade commitstatus gav inga kontroller; detta är inget grönt mobilprov. Publika startsidan hämtades direkt med HTTP 200: löftet om 15 minuters start och 30 dagars grundarkundsgaranti fanns i den hämtade sidan. Äldre sökcache användes inte som facit.

## 1. Första tio minuterna

Granskat: `app/onboarding/page.tsx`, komponenterna `Step1MeetTheTeam`, `Step3HowYouWork`, `Step4PhoneNumber`, `Step5Activate`, `Step6LiveTour`, `FirstAssignmentFinal`, `lib/onboarding/first-assignment-options.ts` samt befintlig kom-igång-yta och uppföljning i `lib/onboarding/lifecycle-emails.ts`.

Befintlig styrka: första uppdraget kan utgå från kundens arbete. Det behövs ingen ny introduktionsguide för att få den effekten. Telefonanslutning, aktivering och ett fungerande samtalsprov är olika tillstånd och får inte beskrivas som samma framsteg.

Ändrat:
- Introduktionen säger att teamet förbereder fakturor, bekräftelser och kampanjförslag. Villkor för telefon/SMS framgår.
- Femminuterslöftet har ersatts med en tydlig startknapp. Att gå vidare i guiden betyder inte att hela tjänsten är aktiverad.
- Den statiska rundturen märks som förhandsvisning; toasten påstår inte att telefonen är live.
- Aktiveringssidan uppmanar till första uppdrag och kontroll av anslutningar, utan löftet att allt är aktivt från första minuten.
- Dag 14-mejlets ämnesrad lovar inte fem minuters genomförande. Befintlig mottagarlogik och dag 2/7/14-flöde är oförändrade.

Klarkriterium för kundstart: kunden kan själv genomföra ett överenskommet moment, hitta resultatet och säga vad nästa steg är. Om en anslutning saknas dokumenteras delvis klar start med ansvarig och nästa besked. Ingen faktisk tiominutersmätning eller färsk-konto-aktivering har körts i detta pass.

## 2. Hantverkarens kundresa

Kodgranskat: `app/quote/[token]/page.tsx`, portalens offertlista och `PortalQuoteSigningModal.tsx`, befintliga ÄTA-vyer/signering samt `PortalInvoiceDetail.tsx`, dokumentrouten `app/api/portal/[token]/invoices/[id]/route.ts` och befintlig PDF-väg. Granskningen följer mottagare, godkännande, kvitto och nästa steg. Den är inte ett skarpt signerings- eller betalningsprov.

**Åtgärdat fel:** ett misslyckat fakturadokumentanrop, eller modern mall utan dokumentdata, lämnade kundens fakturavy med en laddningsskelettbild även när laddningen redan var slut. Kunden fick varken begriplig förklaring eller ett återförsök.

`PortalInvoiceDetail.tsx` visar nu en tillgänglig felruta, knappen ”Försök igen” och den befintliga PDF-länken. Retry upprepar bara samma läsanrop. Fakturabelopp, status, PDF-behörighet, betalning och databas ändras inte. PDF-länkens destination kontrolleras i test; verklig PDF-generering ingår inte.

Två nya isolerade Chromiumprov i `tests/portal-invoice-recovery.ui.spec.ts` följer HTTP-fel → ofullständig modern mall → fungerande dokument på 375 och 1280 px. Riktig React-komponent används; dokumentmotor och betalningswidget är ersatta i testet och nätverket fångas lokalt. Båda proven misslyckas på main-versionen. De passerar med rättningen. Inga skrivande anrop tillåts. Testfilen ingår även i befintligt `test:feature-integration` för CI.

Avgränsade observationer för nästa förbättring, inte levererade funktioner:
- Mobilens `app/(auth)/login.tsx` saknar tydlig väg till lösenordsåterställning och kundstart. Specifikation: länka till befintliga verifierade webbrutter, behåll inloggningsåtergång och testa länköppning i native. Detta lämnas till efter det redan planerade EAS-bygget från angiven main.
- Offertsidan `app/quote/[token]/page.tsx` erbjuder hemnavigering vid fel. Specifikation: skilj tillfälligt läsfel från ogiltig länk; erbjud återförsök och relevant kontakt när avsändaren är känd, utan att exponera en annan kunds data. Acceptans: kunden får en begriplig nästa handling i båda fallen.
- `PortalQuoteSigningModal.tsx` visar bokningsfrågan efter signering även när förslagslistan är tom. Specifikation: vid tom lista ska ett sant signeringskvitto och relevant nästa kontakt visas, utan att en bokning påstås finnas. Acceptans: tomt svar ger ingen tom valsituation; icke-tomt svar behåller befintliga val.

## 3. Samma sanna löften överallt

Ändrat i `app/partners/material/{partnerdeck,leave-behind,demo-manus}/page.tsx`:
- Guidad start från ett riktigt jobb ersätter ett löfte om färdig installation på 15 minuter.
- Standardgaranti och grundarkundsvillkor skiljs åt. Månadsbetalning anges exklusive moms och utan bindningstid; större plan framgår.
- Bränsle ingår upp till planens gräns. Extra påfyllning köps separat, enligt `lib/costs/fuel.ts`. Detta är inte samma sak som obegränsad inkluderad förbrukning.
- Exempelvolymer och belopp presenteras som exempel, inte verkliga kundresultat.
- Telefonuppföljning kräver aktivering och verifiering; tidslöften om omedelbara SMS och fasta påminnelsedagar tas bort där de saknar stöd.
- Leave-behind får staplad pris-/kontaktyta på mobil så villkoren går att läsa.

Separat webb-PR ändrar motsvarande start-/telefonlöften i 13 HTML-sidor. Startsidan synkar grundarkundserbjudandet med `lib/billing/founders-offer.ts`: första 20 betalande, 90 dagars garanti när erbjudandet gäller, tillgänglighet kontrolleras vid aktivering. Standardgarantin är fortsatt 30 dagar. Smala skärmar får en korrekt brytande grundarkundsremsa och startgrid.

Detta är en granskning av berörda ytor, inte ett intyg om att alla historiska försäljnings- eller avtalsformuleringar är avstämda. Webbplatsens befintliga allmänna prisändringsvillkor bör uttryckligen stämmas av mot grundarkundens låsta pris före ett framtida villkorsarbete. Inga avtalsvillkor ändras här. Teknisk marknadsledarposition och konkurrenters omdömen används inte som obestyrkta försäljningspåståenden.

## 4. Kundstart som går att använda idag

`docs/customer-start/KUNDSTART_2026-09-07.md` innehåller nio färdiga mallar:
1. Mejlet inför första mötet.
2. Startmöte med ett riktigt arbetsmoment och klarkriterium.
3. Startkvitto: klart, återstår, ansvarig och nästa kontakt.
4. Personlig hjälp när kunden fastnar.
5. Första veckans uppföljning.
6. Dag 30-värdekvitto med verkliga utfall.
7. Partnerns samtalsstöd och överlämning.
8. Fråga om rekommendation efter ett bekräftat positivt utfall.
9. Handskrivet välkomstbrev, med eller utan maskot.

Mallarna är också levererade som ett separat, visuellt kontrollerat Word-dokument. Inget är skickat till kund. Mötet på 45 minuter och uppföljningen på 15 minuter är bemanningsförslag, inte offentliga garantier. Befintlig automatisk kontakt ska läsas före manuell uppföljning för att undvika dubbla frågor.

Praktiskt ansvar: Andreas eller utsedd kundansvarig väljer ett verkligt mål, fyller mallarna, håller ihop partneröverlämningen och följer upp nästa självständiga moment. Maskoten kan följa med ett personligt brev när adress och mottagare är bekräftade; starthjälpen ska inte vänta på gåvan.

## Verifiering och begränsningar

- Dashboard: 69 riktade kontroller passerade. Körningen omfattar onboarding, lifecycle, pris-/lanseringslöften samt fyra isolerade browserprov för rundtur och fakturafel.
- Kompletterande körning: 25 passerade i feature-parity, pricing-truth och onboarding-wow. Pricing överlappar tidigare körning; siffrorna ska inte summeras som unika tester.
- TypeScript `tsc --noEmit`: exit 0. Slutligt Next-produktionsbygge efter UI-ändringarna: exit 0.
- Lint är **inte verifierad**: `next lint` öppnar konfigurationsfrågan eftersom färdig ESLint-konfiguration saknas. Ett exit 0 från den frågan räknas inte som grön lint.
- Webb: fulla `npm test` stoppas i SSRF-svitens tillåtna DNS-fall av miljöns namnuppslagning. 124 kontroller i de övriga fem filerna passerar (scoring, CTA, lead-save, ROT och hero). Detta är lokala kod-/kontraktskontroller, inte ett produktionsprov av formulären.
- Isolerad visuell granskning: tre partnertexter vid 375 px samt lokal startsida vid 375/1280 px, utan horisontell overflow eller JavaScript-fel. Partneridentitet är testdata, externa anrop blockeras. Före rättningen klipptes partnerns pris-/kontaktfält och startsidan blev bredare än mobilskärmen.
- Inga färska kundkonton, verkliga mejl/SMS, skarp signering, betalning, telefonprov, native-mobilprov eller databasmutationer har körts. PR-CI bedöms separat när den är klar. Befintlig `docs/launch/GO_NO_GO.md` gäller fortsatt.

## Rekommenderad användning

Granska de två avgränsade draft-PR:erna och använd kundstartsmallarna för nästa kund. Följ tid till första självständiga moment, andel starter med ett hittbart resultat och andel hållna återkopplingslöften. Först när verkliga utfall finns kan värdekvitton och rekommendationer beskriva dem trovärdigt. Större produktidéer behåller sin plats efter lansering.
