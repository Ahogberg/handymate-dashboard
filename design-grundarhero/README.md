# Heroskiss — grundarerbjudandet

Designkanvas för herosektionen som ersätter nedräkningen i
`handymate-landing/index.html` (`#lanseringHero`) vid lansering.

Beslut den bygger på: `handymate-dashboard/docs/gtm/grundarerbjudandet-beslut-2026-09-13.md`
— 20 platser, den villkorade användningsgarantin, livstidspris och halva
priset på bokföringen.

**"Core" används inte i kundtext.** Namnet finns bara i strategidokumenten och
är inte lanserat utåt, så gränsen beskrivs i stället som "det du köper i dag"
(Andreas 2026-09-13). Löftena presenteras också utan numrerade
garantietiketter — korten säger vad vi lovar, inte vilket löfte i ordningen
det är.

Filerna här är KÄLLAN. Värdena är hämtade ur landningssidans egen CSS
(Space Grotesk/DM Sans, `--teal-950` som botten, gradientknappen och dess
skugga, 12px-radier) så skissen går att föra in utan omtolkning.

| Fil | Artboard |
|---|---|
| `Main.dc.html` | Heron, desktop 1440×900 |
| `Mobil.dc.html` | Heron, mobil 390×844 |
| `Accounting.dc.html` | Sektionen under heron — vad priset gäller, och bokföringen |
| `canvas.json` | Layout och anteckningar |

**"Ytor" är internt och står inte i kundtext** (Andreas 2026-09-13: det säger
inget). Villkoret uttrycks i stället som "Handymate gör åtta saker för dig —
gör minst fyra av dem", med de åtta namngivna i samma ordalydelse som
`lib/admin/adoption.ts` YTOR och kundens egen räknare på
`/dashboard/min-garanti`. Ändras listan på ett ställe måste den ändras på
båda — det är villkoret kunden bedöms på.

Platsräknaren är en reglage här (tagna av totalt) för att kunna se hur olika
lägen känns. **I skarp drift måste talet komma från grinden
(`lib/billing/founders-offer.ts`) — annars ingen siffra alls.**
