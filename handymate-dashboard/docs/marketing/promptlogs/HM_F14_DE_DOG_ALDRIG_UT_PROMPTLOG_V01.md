# HM_F14_DE_DOG_ALDRIG_UT — promptlogg V01

Paket: `video-creative-bible/F14-de-dog-aldrig-ut-produktionspaket.md`. Regler: `film-factory.md`. Saldo vid start 2026-08-29: 70.

## Beslut (Andreas 2026-08-29)
1. Arten: **Ankylosaurus** — internt namn **Adminsaurus**.
2. Matte: två repliker i bild (B7, B8) + viskande VO.
3. Hantverkaren: samma som F13 (röd tråd).
4. Pass A (kandidatsvep 720p) körs på **webben** med Unlimited där modellerna tillåter; MCP för pass B/C.
5. Två röster: riktig svensk **berättarröst** (mörk dokumentär) för öppningsraderna + produktdelen; **Matte** (Benji tills klonad) för VO i expeditionen + replikerna.

## Grind 1 — Adminsaurus (hero-frame)

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 1 | Tre kandidater: (71) helkropp i kontorslandskapet, (72) trekvart bakom skrivbordet "övervakar", (73) huvud i närbild 85 mm | nano_banana_pro 2k 3:4 | ~9 kr | jobs 7ce77ede, ce808384, 5b2c7c6c |
| 2 | Jämförelseark till Andreas | ffmpeg | 0 | recordings/f14-de-dog-aldrig-ut/hero-stills/qa-adminsaurus-1-2-3.png |
| 3 | **Design godkänd** ("Adminsaurus är underbar"). Referenspaket 8 bilder med 71/72/73 som image_references: profil, framifrån i dörröppning, siluett genom fönster utifrån (skog/dimma), äter pärmar bakom museiband, sover vid skrivaren, bakom stolen lågt, öga makro, bakifrån med klubban | nano_banana_pro 2k 3:4 | ~24 kr | jobs 3f83e546 (profil), 4fc43297 (dörr), bc04ca40 (siluett/skog), 15901c99 (äter/museiband), 115117be (sover), 006dfcb3 (bakom stolen), 08714bd5 (öga), 864db310 (bakifrån). recordings/f14-de-dog-aldrig-ut/hero-stills/adminsaurus-ref-*.png + qa-adminsaurus-referenspaket.png. Paket: Adminsaurus-Element-Referenspaket.zip (11 bilder) → Andreas skapar Element på webben. |

Element skapat av Andreas på webben: **`char_adminsaurus`** (namn = ID). Saldo påfyllt: 1 048.

## Grind 2 — hantverkaren i 2006-kontoret + B3/B4 (hero-frames)

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 4 | Berättarröst-test: öppningsraden med Higgsfields mörkaste presets Grady (e2a2d2e6), Barrett (d603a8cd), Gideon (1ad38ba4) | text2speech_v2 elevenlabs | ~1 kr | jobs 4cbc81e4, e95ab50a, 7b58e133 |
| 5 | Hero-frames: (101) B4 hantverkaren vid skrivbordet, djuret bakom över axeln · (102) B4-variant, blick mot kameran, djuret ett steg bak · (103) B3 från korridoren, djuret som skugga bakom glasväggen. Refs: F13-hantverkaren (f602ee51) + Adminsaurus-ref | nano_banana_pro 2k 9:16 | ~9 kr | jobs ea342082, 719f9aaf, a3e4af5e |
| 6 | Bedömning 101/102/103. Alla tre: hantverkaren = F13-hantverkaren (identitet håller), inga läsbara texter/logotyper, 2006-känsla (CRT, pärmar, lysrör) sitter. 101: djuret tätt bakom över axeln, klubban uppe i bild — bästa B4. 102: samma rum, blick i kameran, djuret helt i profil — B4-variant/insert. 103: korridor genom glasväggen, djuret synligt (mer än skugga) på väg bort i kontorslandskapet — bästa B3. **Avvikelse:** djuret i 103 är mörkare/brunare än Adminsaurus-designen (101/102 är ljus gråbeige som referenspaketet) → vid videogenerering av B3 måste Element `char_adminsaurus` bära färgen; annars ny B3-still med starkare referensvikt. Lokalt: hero-stills/B4-1-…, B4-2-…, B3-1-…. Inget QA-ark (lokal python saknas, sandboxen har bara 103:s URL) — de tre PNG:erna granskas direkt. Upload-slot 952da749 oanvänd. | PIL lokalt | 0 | Väntar på Andreas: godkänn 101 (B4) + 103 (B3)? |
| 7 | **Godkänt av Andreas:** 101 = hero-frame **B4** (B4-1-hantverkare-djur-over-axeln.png), 103 = hero-frame **B3** (B3-1-korridor-skugga-glasvagg.png). Färgkrav: djuret ska behålla Adminsaurus-färgen (ljus gråbeige) i alla tagningar. Berättarröst: **Grady (91)** vald — önskemål: lite mer entusiasm och något mörkare om möjligt, annars bra som den är. | – | 0 | Grind 2 stängd |

## Grind 3 — berättarröst Grady + B1 (skog/kontorshus)

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 8 | Grady (e2a2d2e6) igen: (94) öppningsraden med paus "Några… blev affärssystem." · (95) produktdelens VO ("Teamet samordnar" i stället för "Matte samordnar" — namn aldrig i tal). ElevenLabs-presetet har inga stabilitets-/stilreglage via MCP → entusiasm styrs med interpunktion, mörkning görs i efterbehandling (rubberband −1/−2 halvtoner) | text2speech_v2 elevenlabs | ~0.6 kr | jobs c8bbb794, 133dfdf9 |
| 9 | B1 hero-frame, 2 kandidater: (111) 28 mm, kontorshus i tallskog/dimma, siluett bakom bottenvåningsfönster · (112) 35 mm närmare, djuret går förbi innanför ett stort fönster. Refs: adminsaurus-ref-3 (bc04ca40) + helkropp (7ce77ede). Andreas svarade inte på B1-frågan → antagande: ref-3-stämningen är rätt riktning | nano_banana_pro 2k 9:16 | ~6 kr | jobs 66d543ea, e239e1f2 |
| 10 | Grady mörkad i sandboxen (rubberband, tempo oförändrat, loudnorm −18 LUFS): m1 = −1 halvton, m2 = −2 halvtoner. Lokalt: rostbank/94-…-oppning{,-m1,-m2}.mp3 · 95-…-produkt{,-m1,-m2}.mp3. Media: 94-m1 c13d3bcc · 94-m2 5ed78bec · 95-m1 dc1b0ce1 · 95-m2 82916157 | ffmpeg | 0 | Väntar på Andreas: original, −1 eller −2? |
| 11 | Bedömning B1: **111** (B1-1-skog-kontorshus-siluett.png) — röd 70-talstegel i dimmig tallskog, djuret bara som siluett bakom frostat glas med lysrörsljus, exakt "något stort rör sig bakom ett fönster"; färgen syns inte (siluett) så ingen färgrisk. **112** (B1-2-skog-kontorshus-fonster.png) — djuret helt synligt i rätt gråbeige, men det blir ett akvarium: avslöjar för mycket innan B3, och byggnaden är ljusare/nyare. Rekommendation: 111 som B1-hero (B2 Matte-bilden byggs mot samma fasad). | – | 0 | Väntar på Andreas |
| 12 | **Godkänt av Andreas:** Grady **original** (ingen pitch-shift; 94/95 som de är) · **B1-1** = hero-frame B1 (job 66d543ea). | – | 0 | Grind 3 stängd |

## Grind 4 — Matte-bilderna B2/B7/B8 + B9

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 13 | Hero-frames: (121) B2 Matte bakifrån trekvart på grusvägen, stannat, tittar mot det upplysta fönstret (refs: B1-1 66d543ea + Matte-porträtt ce4f063d) · (122) B7 halvnära Matte i dörröppningen till 2006-kontoret, djuret oskarpt bakom (refs: B4 ea342082 + Matte + helkropp 7ce77ede) · (123) B8 museigaggen: djuret äter pärmar bakom sammetsrep, Matte halvnära i förgrunden, flera meter emellan (refs: B4 + äter/museiband 15901c99 + Matte) · (124) B9 hantverkaren ut ur tegelhuset med verktygslåda, dagsljus, omärkt vit skåpbil (refs: B1-1 + B4) | nano_banana_pro 2k 9:16 | ~12 kr | jobs ad2c4696, 709150d4, 824592bc, 33fc0c87 |
| 14 | Bedömning 122 (B7-1-matte-dorroppning.png): Matte = porträttet, ren teal hoodie utan tryck, händer i fickan, deadpan, klubban och taggarna oskarpa bakom honom, samma rum som B4. Godkänd kandidat för B7 (startbild för Sync-tagningen). 124 (B9-1-hantverkare-ut-till-bilen.png): samma hantverkare, verktygslåda, omärkt vit skåpbil utan skylt, samma tegelhus som B1-1, lätt lättat leende. Godkänd kandidat för B9. Notering: skåpbilens spegling syns i fönstret bakom honom — ofarligt. | – | 0 | Väntar på Andreas |
| 15 | Bedömning 121 (B2-1-matte-mot-fasaden.png): exakt samma fasad, dimma och grusväg som B1-1 (B1→B2 hänger ihop), Matte bakifrån trekvart i ren teal hoodie, siluetten i fönstret bevarad. Godkänd kandidat för B2; B7:s startbild kan sedan klippas ur B2-tagningens sista bild enligt paketet. | – | 0 | Väntar på Andreas |
