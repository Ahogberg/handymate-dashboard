# Första nyttan — skiss och genomförande

Bas: main 28d3bce. Separat från #11/#12; ingen migration eller ny fakturaväg.

## Skiss

1. Onboardingens befintliga slutvy: "Vad ska vi ta tag i först?".
   Ett synligt kvitto på kundens valda fokus följs av ett rekommenderat
   uppdrag och ett alternativ. Verkliga portföljsignaler krävs för portföljplan.
   Offertvalet använder redan valda jobbtyper, mallar och registerpriser.
2. Uppdragsval: beskrivning → öppna redigerbar fråga hos Matte → skicka själv
   → befintlig plan/granskning. Öppnad chatt räknas inte som skapat uppdrag.
   Knappar beskriver att frågan förbereds, inte att modellen redan arbetar.
3. Offertval: egen företags-/jobbkortvy → befintlig offerteditor.
   En frivillig, återöppningsbar pratbubbla i sidflödet leder till kund,
   innehåll/priser och granskning. Inga blockerande lager över mobilens editor.
4. Hem: befintlig startlista prioriterar valda mål och verklig data.
   Uppdragsknappen öppnar Matte, inte en länk tillbaka till samma sida.
   En generell välkomstmodal får inte avbryta den valda uppgiften.

## Bevis och risker

- Inga nya databasfrågor, endpointar eller AI-verktyg. Läs befintliga
  onboardingfält och behåll befintliga behörigheter/beräkningar/reservationer.
- Handoff avgränsas per företag, med giltighetstid och synligt lagringsfel.
- Gamla globala guideflaggor får inte dölja guiden för ett annat företag.
- Startlistans status hämtas om vid återkomst; läsfel visas med återförsök.
- Ingen fabricerad ROI, färdigmarkering vid klick eller automatisk sändning.
- Verifiera ren logik och verkliga React-komponenter vid 375/1280 px,
  tangentbord, avbruten lagring, felaktigt konto, återförsök och verkliga
  offertkopplingar. tsc, build och CI enligt befintlig grind.
- Inloggat AI-/DB-prov rapporteras separat; simulerade svar är inte driftbevis.

## Levererat och granskningsordning

- `review.html`: interaktiv skiss byggd från de riktiga presentationskomponenterna.
  Agentbilder/ikoner, företag och det lilla offertdokumentet är exempeldata.
  Skissen visar start, offertguide och startlista; den skickar inget till AI.
- `start-mobile.png` och `quote-mobile.png`: 375 px. Desktop provas också (1280 px).
- Riktig implementation: `/onboarding` sista steget och den befintliga
  `/dashboard/quotes/new?first_quote=1&job_type=…&template_id=…`-överlämningen.
  Referenser verifieras av befintlig mottagare; gissa inte URL-id:n.
- Offertsektionernas navigation väntar nu tills bildrutan körts innan den
  nollställer väntande mål. Tidigare cleanup kunde avbryta scrollningen.
- Startlistan läser om vid fokus, återmontering och när Matte stängs.
- Onboardingens sista val kvitteras med PUT innan befintlig finalize-POST.

## Provning

- `npm run test:contracts`: 1 104 godkända prov.
- `npm run test:first-value-ui`: fyra Chromiumprov med riktiga React-komponenter,
  verklig sektionsnavigation och avlyssnade API-svar, vid 375/1280 px.
- Rena TypeScript- och produktionsbyggskontroller redovisas i PR:n.
- Ny UI-workflow använder exakt samma npm-kommando och sparar skiss/bilder.

## Kvar före merge

1. Inloggat nytt demoföretag: välj fokus, ändra till alternativt uppdrag,
   starta, kontrollera sparade val och att Matte får rätt redigerbar fråga.
   Skicka själv, granska verkligt svar/plan och kontrollera faktisk uppdragsstatus.
2. Offertvägen: välj jobbtyp/mall i onboarding, öppna offerten, välj riktig kund,
   ändra artikelpris/mängd, granska reservationer, spara och läs tillbaka.
   Kontrollera prisval, förhandsvisning och mottagardialog med #11 efter integration.
3. Fysisk iPhone: tangentbord, stor text, scrollning, hoppa över och återöppna guide.
4. #11 är fortfarande separat och öppen. Denna gren inför inte dess återställning,
   kundunderlagsgranskning eller fakturarättningar och får inte markeras som deras
   driftbevis. Ingen migration, produktionsaktivering eller skarpt AI-prov är gjort.
