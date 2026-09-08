# Skisser 2026-09-08 — Jobbkompisen och överlämning till teamet

Från designbriefen `docs/design/BRIEF_OVERLAMNING_OCH_JOBBKOMPISEN_2026-09-08.md`.

- `jobbkompisen-overlamning-v1.dc.html` — artboard 1a–1d, första passet.
- `jobbkompisen-overlamning-v2-med-revidering.dc.html` — samma duk plus
  artboard 2a–2e: Lars i tre varianter och Daniel under beviströsleln.
  **Detta är den gällande duken.**

## Läs markeringarna som ett kontrakt

Varje element bär en etikett. `Finns` betyder att fältet är kopplat till en
rad i dag och får ritas ut. `Backend` betyder att det kräver en primitiv som
inte finns, och **får inte byggas förrän den gör det**. `Regel` är en
designregel utan data bakom.

Kontrollerat 2026-09-08: samtliga `Finns`-markeringar stämmer, inklusive
`quickActions(page)` i `lib/matte/page-context.ts`, `quote_tracking_events`
för offertöppning, och `quoted_hours`/`actual_hours` i `project_outcome`
(v73, fryst av `lib/efterkalkyl/freeze-outcome.ts`).

## Beslut

**Fall A, Lars och kalendern: variant 2b gäller.** Lars är inte med i svaret
förrän offerten är signerad. 2a (han läser beläggningen) tas in när
bevakningsprimitiven finns, eftersom meningen "säger till om det fylls"
annars är ett löfte utan täckning och en ögonblicksbild tyst kan bli falsk.
2c (preliminär bokning som ny primitiv) är parkerad: fem backend-poster för
ett steg i ett svar. Tas upp igen om kunder efterfrågar det.

**Fall B, Daniel under tröskeln: 2d och 2e gäller båda.** Under
`AGENTRAD_MIN_SAMPLE = 3` svarar Daniel på det han kan läsa, med verbet
"läste" i bylinen i stället för "hittade", grått källchip med antalet, och
inga knappar.

## Ordning för invävningen

1. **1a** — Jobbkompisen i vila. Noll backend, störst daglig effekt.
2. **1d + 2d + 2e** — Daniel med och utan underlag. Allt utom `source_id`
   på kommentaren finns.
3. **1b och 1c** — kräver strömmande svar och steglistan, alltså efter att
   Codex primitiv landat.
