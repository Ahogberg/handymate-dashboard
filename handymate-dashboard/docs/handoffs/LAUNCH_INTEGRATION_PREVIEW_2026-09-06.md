# Gemensam granskningsversion inför lansering

Tillfällig gren: `codex/launch-integration-preview`. Ingen produktionsmerge.

Ingår: main `a416add1`, PR #11 `0b5c9da`, och PR #13–#15 via #15 `d3e3f9b`. PR #12 ingår inte.

Konflikter: båda sidors arbetsanteckningar bevarade; CI och package.json har samma samlade testlista med ROT-specen sist. Budgeten behåller #11:s tillval/rabatter och mains labor_amount-signal samt båda kolumner i selecten. Offertytan behåller kundunderlag, återställningsstatus och förstagångsguide tillsammans.

Verifiering: hel körning 1 561 passerade, 1 överhoppat och ett föråldrat jobbtypsfacit underkänt. Facitet uppdaterat att kräva både jobbtypsstart och kundunderlag i QuickIntake. Omkörning av jobbtyps- och paritetsprov: 16 gröna. Kundunderlagets Node-prov: 17 gröna. Budget/ROT-facit: 39 gröna före andra integrationen, ingick även i helkörningen.

## Öppna driftgrindar

- ROT omprov på Nordström El med samma instruktion efter a416add1 misslyckades: motiveringen respekterar inget avdrag, artikelkopplingen återinför ROT. Sparat testutkast #2026004, quote_krotoez6g1c, visar 446 kr avdrag. Orsaksspår: linkAiItemsToProducts → applyProductToItem skriver över AI-flaggorna med produktstandard. Claude äger rättningen; inte ändrad här.
- Arbetsklassning i projektvyn ännu inte driftverifierad. Ingen kundkommunikation eller accept/signering utförd.
- Previewns AI, autentisering, databas och lagring måste provas i den gemensamma versionen; en grön byggning är inte ett driftprov.
- #13 provas via riktig onboarding med nytt konto och verifierbar e-post, inte genom direkt databasskapande.
- Befintliga testutkast #2026003 och #2026004 behålls; ingen numrering återställs.
- #11:s beskrivning har en kvarvarande fakturagrind för delfaktura → slutfaktura. Integrationsgrenen innebär inget mergegodkännande.

Produktionsordning när grindarna är klara: #11 → prov → #13 → prov → #14 → #15.
