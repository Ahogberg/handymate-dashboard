# Sex kundutfall — sprint 2026-09-09

Ägare: Codex teknik/verifiering; Andreas och Christopher verksamhetsfacit och telefonprov.
Bas backend: 647793c6 (vision-integration). Mobil: d797ccb (redesign).
Egen gren codex/six-outcomes-20260909. Ingen main/release utan befintliga grindar.

- [ ] 1 Förfrågan: sparad kund/lead, dubbletter, ansvar, fel och återförsök.
- [ ] 2 Offert: verkliga priser, saknade uppgifter, dokument och signering.
- [ ] 3 Uppföljning: beständig körning, stopp vid svar/nej/signering, kvittens.
- [ ] 4 Fakturaunderlag: tid/material/ÄTA, källmarkering, ingen dubbelfakturering.
- [ ] 5 Administration: import/synk, ingen falsk kvittens eller dubbelinmatning.
- [ ] 6 Nytta: verifierade belopp, utfall och attribution; ingen påhittad tidsvinst.

Arbetsgång: läs existerande implementation/facit, återge fel med verklig helper/route,
rätta grundorsak, kör kontraktsgrind/tsc/build, dokumentera bevis och öppna pilotprov.
De sex områdena är inte slutgodkända förrän relevant verkligt flöde har provats.

## Nästa omgång: förfrågan och belagd nytta

- [x] Stoppa kundskapande vid fel i kundmatchning och tvetydig identitet.
- [x] Exakta e-post/namn/adress-matchningar även med LIKE-specialtecken.
- [x] Kundkomplettering och affärssparning måste ha kvittens.
- [x] Betalt i nyttovyn använder registrerat belopp, inte obetald skattereduktion.
- [ ] Regressionsprov, typkontroll, build och grön GitHub-grind.

## Fortsättning: beständig mottagning

- [x] Lägg kund- och betalningsfallen A2–A5/F2–F5 i testningslistan.
- [x] Spara mottagen förfrågan före kundmatchning; samma nyckel återanvänder samma förfrågan.
- [x] Återförsök återanvänder sparade kund-/lead-/affärs-ID:n och stoppar ändrat innehåll.
- [x] Separera mottaget, färdigställt och osäker status; verifiera krascher och samtidighet.
- [ ] Fortnox-avstämning kvarstår som nästa separat steg.

Nästa: koppla fler inflöden till samma beständiga gräns, prova recovery-vyn visuellt och genomför Fortnox-avstämning. S1/S5 och pilotkedjor är fortsatt öppna.

## Fortnox-avstämning

- [x] Läsande sökning med extern referens, exakt verifiering av detalj och kund/belopp.
- [x] Noll träff/okänt/flera träffar får inte släppa spärren eller skapa ny faktura.
- [x] Historiska failed-rader kräver avstämning, inte blind POST.
- [x] Separera återfunnen faktura från leverans/ROT/e-faktura; ingen automatisk kundkommunikation vid kontroll.
- [x] Ägare/admin-kontroll från fakturavyn, företagsskopat API och CAS-kvittens.
- [ ] Körbara provider-/routeprov, tsc/build, grön CI och uppdaterad testlista.

Avstämningen sparar kopplingen men lämnar pending. Automatisk upplåsning efter verifierad leverans/ROT och riktiga Fortnox-pilotprov återstår. Ingen avsaknad av sökträff får automatiskt tillåta POST.
