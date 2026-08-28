# 04 · Ljus och miljö

## Två ljusreferenser (ladda som bildreferens)

| Fil i `assets/light/` | Vad | Använd för |
|---|---|---|
| `worksite-morning-source.png` | Svensk verkstad/byggplats i kallt morgonljus, slate + trä, teal som diskret accent | F01, F03, F04, F07, F12 — allt som utspelar sig i arbetsmiljön |
| `van-morning-source.png` | Omärkt skåpbil i morgonljus | F02, F05, F10, F12 — bilen som återkommande scen |

**Saknas:** en referens för *vardagligt skandinaviskt hem* (F02 köksbord, F06 kök, F08 under diskbänken, F09 kund i kök). Tills en finns: använd stilprefixet nedan och välj det första godkända hemklippet som referens för alla följande — annars driver hemmen mellan filmerna.

## Gemensamt stilprefix (klistra först i varje B-roll-prompt)

> Photorealistic Swedish/Nordic documentary commercial, not an American construction site. Real Swedish trades environment: slate, natural wood, warm off-white walls, cool natural morning light or warm evening practical light, Handymate teal only as a discreet accent in fabric or paint. Unbranded workwear, realistic tools with real weight, correct hands. The camera observes — no posing, no advertising smiles, no hero angles. Leave clean negative space for Swedish typography added in post.

## Negativt suffix (klistra sist i varje prompt)

> No readable software, screens, text, subtitles, logos, brands, money, invoices, charts, robots, holograms, glowing interfaces, floating UI, neon, purple or pink light. No exaggerated reactions, no testimonial delivery, no caricature. Consistent actor, wardrobe and lighting across shots.

## Tre ljussituationer och hur de beskrivs

| Situation | Prompt-formulering | Färgtemperatur i post |
|---|---|---|
| Verkstad, morgon | "cool natural morning light through high workshop windows, soft shadows" | ~5600 K, lätt kall |
| Hem, kväll | "warm evening practical light from a single kitchen pendant, window going blue" | ~3200 K, varm |
| Blå timmen, ute | "blue hour, practical lights switching off, calm evening sky" | ~4000 K, teal-lutning tillåten i glas/metall |

Kontor-2006 (F01, F04): "cool fluorescent light" — får övergå till "clean natural teal-accented light" när Handymate visas. Det är den enda tillåtna ljusförändringen som bär betydelse.

## Kamera

- Långsamma, kontrollerade rörelser: lateral glid, 3 % push-in, kontrollerad pull-back. Aldrig handhållet skak, aldrig drönare, aldrig whip-pan.
- Statisk kamera för komik (F04) — timingen bor i klippet, inte i kameran.
- 9:16 primärt; komponera med 16:9-säkert centrum när handboken kräver derivat.
- 2–5 sekunder per generering. Längre klipp driver.
