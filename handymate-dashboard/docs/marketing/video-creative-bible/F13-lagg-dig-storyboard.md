# F13 · Efter jobbet — storyboard V02

2026-08-29. Sammanslagning av Claude V01 ("Gå och lägg dig") och Codex förslag ("Efter jobbet börjar det andra jobbet"). Beslut Andreas: kör V02.

**Vad V02 tar från Codex:** 16:03-hooken med skåpbilsdörren, tempot (20–22 s), repliken "Ditt jobb, ja.", montaget per agent, slutraden.
**Vad V02 behåller från V01:** hela teamet tar bordet (inte Matte ensam vid laptopen), "Du säger ja i morgon" + tre riktiga kort, hantverkaren går till familjen, namn som text — aldrig i tal.
**Vad som är förbjudet (risken "ersätter hantverkaren"):** Matte sitter aldrig på hantverkarens stol · gubben från Knappen är INTE hantverkaren här (han är det gamla sättet) · hantverkaren lämnar bordet för att gå till familjen, inte för att bli överflödig · teamet rör bara admin-rekvisita (papper, laptop, kalender), aldrig verktyg · slutbilden: bordet fullt av folk, hans stol tom.

Princip: varje agent får ett synligt jobb och sitt namn i bild. Humorn i tempot och i tre små skämt: "Kommer du?" · "Ditt jobb, ja." · kaffekoppen.

## Tidslinje (22 s, 9:16)

| Bild | Tid | Bildstorlek | Vad man ser | Text i bild | Ljud / replik | Produktion |
|---|---|---|---|---|---|---|
| 1 | 0–3 | Halvbild, utomhus | Hantverkaren (ny karaktär, ~42, sympatisk) stänger skåpbilsdörren efter dagen, lättad, sen eftermiddagssol. Omärkt vit skåpbil. | *16:03* uppe till höger | Dörren slår igen. Fåglar, lätt trafik. | Hero-still A → Seedance 2.0, 4 s |
| 2 | 3–7 | Helbild, låst kamera | Köksbord kväll: laptop, fakturor, offerter, papperskalender, kaffekopp. Han sätter sig, suckar, öppnar laptopen. Vid 5 s står Matte bakom stolen, händerna i hoodie-fickan. Han märker honom inte. | *"Kommer du?"* nere vänster vid 4 s | Stolen, laptopens gångjärn. Tickande klocka som slutar när Matte syns. | Hero-still B (hantverkare + Matte-porträtt som refs) → **Tagning 1**, Seedance 2.5 omni, 6 s |
| 3 | 7–11 | Halvnära på Matte | Matte lutar sig fram, stänger laptopen lugnt med en hand, tittar i kameran. | – | Matte (i bild, läppsynk): **"Ditt jobb, ja."** *(paus)* **"Gå och lägg dig."** Laptopens lock: ett mjukt klick. | Hero-still C = crop ur tagning 1:s sista bild → **Tagning 2**, Seedance 2.0 + Element, 6 s, Sync |
| 4 | 11–16 | Helbild (samma kamera som bild 2) | Han reser sig, går mot hallen utan att titta tillbaka. Teamet kommer in från höger och hallen, utan brådska: Karin drar fakturahögen till sig · Lars vecklar ut kalendern · Daniel tar offertbunten · Lisa vänder hans telefon och läser · Hanna vid bordsändan. Matte kvar bakom den tomma stolen. | Namnetikett per agent när de sätter sig, 1 s var: *Karin · din ekonom* · *Lars · din projektledare* · *Daniel · din säljare* · *Lisa · din kundservice* · *Hanna · din marknadschef* | Matte (voiceover): **"Fakturorna. Kalendern. Offerterna. Telefonen."** — ett ord per person, 0,4 s luft. Låg varm puls börjar. | **Tagning 3**, Seedance 2.5, startbild = tagning 1:s sista bild, refs: fem porträtt, 9 s. Etiketter i ffmpeg. |
| 5 | 15–16 | Helbild (slutet av tagning 3) | Han dyker upp i dörröppningen i strumplästen, sträcker sig efter kaffekoppen. Karin räcker den utan att titta upp. | – | – | Skrivs in i tagning 3:s prompt ("returns briefly for his mug") |
| 6 | 16–20 | Produktbevis, skärm | Morgon. Handymate-hemmet på mobil: "Det här behöver dig idag" — tre riktiga kort: Karin (påminnelse förfallen faktura) · Daniel (uppföljning offert) · Lars (klart, faktureringsklart?). Tummen trycker Godkänn på första. Kvitto. | *I morgon: tre ja från dig.* | Matte (voiceover): **"Du säger ja i morgon."** Riktigt klick. Pulsen växer. | Inspelningsläge `tests/filming/f13-lagg-dig.spec.ts`, 0 kr |
| 7 | 20–22 | Text + platta | *Efter jobbet ska inte det andra jobbet börja.* (1,5 s, Space Grotesk, off-white) → CTA-plattan hålls 3,6 s | | Plattans ljud | `reference-pack/assets/brand/CTA-platta.mp4` |

Total: ~25 s med plattan. Valfri knorr (0 kr): innan plattan tittar han in en sista gång från hallen; Matte utan att vända sig, VO: **"Lägg dig."**

## Repliker (Benji tills riktig röst finns; namn aldrig i tal)
1. I bild: "Ditt jobb, ja." — paus — "Gå och lägg dig."
2. VO: "Fakturorna. Kalendern. Offerterna. Telefonen."
3. VO: "Du säger ja i morgon."
4. Valfri VO: "Lägg dig."

## Pipeline (fabriksreglerna efter Knappen V16)
1. Hero-stills: hantverkare (2 kandidater) → skåpbil A + kök B med vald hantverkare och Matte-porträttet som referenser (2 kandidater var). ~15 kr.
2. Tagning 1 (kök, 2.5) i 720p, 2 kandidater → välj → 1080p.
3. Hero-still C ur tagning 1 → tagning 2 (2.0 + Element) → Sync.
4. Tagning 3 (teamet) i 720p, 2 kandidater → 1080p. Kassera vid fel garderob/ansiktsblandning.
5. Skåpbil (2.0 från still A), 4 s.
6. Produktbevis i inspelningsläge.
7. Färgmatchning av hoodien mot tagning 1, etiketter, text, platta → V01 → Andreas → Topaz på låsta tagningar.

Budget: ~330 kr (720p-utkast + 1080p på de låsta). Saldo 2026-08-29: 384.

## Sanningsgrind
- "Tar natten" = bordet och kvällen. Beviset slutar i kort som väntar på ja.
- Lisa läser telefonen, svarar inte. Ingen ringsignal.
- Inga läsbara belopp/kunder i AI-bilder. Allt i produktbeviset från demokontot.
- Hantverkaren gör inget fel och blir inte förlöjligad. Han blir hjälpt.
