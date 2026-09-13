# Heroskiss — grundarerbjudandet

Designkanvas för herosektionen som ersätter nedräkningen i
`handymate-landing/index.html` (`#lanseringHero`) vid lansering.

Beslut den bygger på: `handymate-dashboard/docs/gtm/grundarerbjudandet-beslut-2026-09-13.md`
— 20 platser, den villkorade användningsgarantin, livstid på Core och halva
priset på bokföringen.

Filerna här är KÄLLAN. Värdena är hämtade ur landningssidans egen CSS
(Space Grotesk/DM Sans, `--teal-950` som botten, gradientknappen och dess
skugga, 12px-radier) så skissen går att föra in utan omtolkning.

| Fil | Artboard |
|---|---|
| `Main.dc.html` | Heron, desktop 1440×900 |
| `Mobil.dc.html` | Heron, mobil 390×844 |
| `Accounting.dc.html` | Sektionen under heron — Core-gränsen och bokföringen |
| `canvas.json` | Layout och anteckningar |

Platsräknaren är en reglage här (tagna av totalt) för att kunna se hur olika
lägen känns. **I skarp drift måste talet komma från grinden
(`lib/billing/founders-offer.ts`) — annars ingen siffra alls.**
