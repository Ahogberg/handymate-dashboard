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
