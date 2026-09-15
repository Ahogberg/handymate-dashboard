# Planeringsfeedback — återställd 2026-09-15

## Omfattning

Fem önskemål från kundens ljudfeedback:

- Behåll jobbval från `/dashboard/schedule?project=…` (även `project_id`).
- Välj flera dagar och personer i samma formulär.
- Behåll heldagar synliga när tidsrutnätet scrollas.
- Visa jobb och personal tillsammans.
- Visa budget, rapporterat, kvar/över budget och schemalagda persontimmar separat.

Den tidigare lokala committen `f1896b91` försvann med arbetsytans städning före publicering. GitHub saknade committen och grenen. Denna implementation är återställd från dokumenterad ändringsbeskrivning mot main `c09364e76228eabc6a248319c22be9705c530d75`. Tidigare testresultat gäller inte denna commit; verifiering har körts på nytt.

## Implementation

- `app/api/schedule/batch/route.ts`: tenant- och användargränser, aktiv personal, tillåtna jobb, konfliktkontroll mot schema/bokningar/godkänd frånvaro, explicit överlappningsbekräftelse, en atomär flerradsinsert.
- Deterministiska rad-ID:n per företag, aktör och request-ID gör återförsök idempotenta. Ändrat innehåll med samma nyckel nekas.
- Okänd sparstatus låser formulärinnehållet. Kunden kan stänga och återöppna för att kontrollera samma sparning. Ingen ny nyckel genereras då.
- Högst en notifiering per annan person och batch; inga notifieringar vid replay.
- `app/api/schedule/projects/route.ts`: behörighetsfiltrerade jobb och paginerade tids-/schemaunderlag. Underlagsfel visas som fel, aldrig falska nollor. Inga timpriser exponeras.
- Budget/rapporterat/kvar gäller hela jobbet. Schemalagt omfattar historiska och kommande interna pass; heldag räknas som 8 persontimmar. Kundbokningar ingår inte i denna siffra.
- Virtuell frånvaro använder svensk tidszon och exklusivt slut; flerdagsposter visas på varje berörd dag.

## Verifiering av återställd kod

- `node tests/schedule/routes.cjs`: 19 kontroller, alla godkända. Omfattar skrivning, replay, ändrad payload, obehörig/annan tenant, frånvaro/överlappning, fel vid läsning/skrivning, timsummering och DST-heldag.
- Befintliga `person-day`, `schedule-utilization`, `schema-tider`: 47 godkända.
- `tsc --noEmit`: godkänd med 8 GB heap.
- `tests/schedule/ui.cjs`: riktiga sidkomponenter med mockad transport, Chromium 390 och 1280 px. Jobbcontext, två personer × tre dagar, avbrutet nätanrop, stäng/öppna och samma request-ID vid retry, fast heldagsrad efter scroll. Inga sidfel.
- UI-harness kräver esbuild via NODE_PATH (tillfälligt installerad utanför repot), samt Chromium via HANDYMATE_TEST_CHROMIUM.
- `npm run test:planning` ingår i kontrakts-CI.
- Produktionsbygge: pågår vid denna anteckning; resultat kompletteras före PR-leverans.

## Gränser

- Ingen migration, produktionsdataskrivning, live-notifiering, merge eller deploy har gjorts.
- Mobilprovet avser responsiv webb, inte en native/TestFlight-build.
- Konfliktkontrollen är en varning före skrivning, inte ett databaslås som förbjuder samtidiga överlappande förfrågningar. Användaren kan uttryckligen tillåta överlappning.
- Idempotensen stöds av beständiga schemarader, inte en separat ledger som överlever att samtliga rader raderas.
- Okänd sparstatus bevaras under aktuell sidlivstid; full sidomladdning återställer formuläret.
- Befintlig svensk tidskonvertering återanvänds för klockslag. Nya tester täcker heldag vid DST, inte tvetydiga nattklockslag vid höstomställning.
