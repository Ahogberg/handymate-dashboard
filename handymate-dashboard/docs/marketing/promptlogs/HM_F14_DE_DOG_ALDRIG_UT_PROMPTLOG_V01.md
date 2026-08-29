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
