# HM_F13_EFTER_JOBBET — promptlogg V01

Storyboard: `video-creative-bible/F13-lagg-dig-storyboard.md` (V02). Regler: `film-factory.md` efter Knappen V16. Saldo vid start 2026-08-29: 384.

## Steg 1 — hero-stills (2026-08-29)

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 1 | Hantverkaren, två kandidater (~42, sympatisk, omärkt bil, sen eftermiddag) | nano_banana_pro 2k 3:4 | ~5 kr | jobs 1aaa0986 (1), f602ee51 (2). **1 kasserad**: "TRANSIT"-emblem, Snickers-logga, läsbar regskylt. **2 vald**: ren, grön t-shirt, ingen text. hero-stills/hantverkare-1.png, -2.png |
| 2 | Still A skåpbil (2 kand.), still B kök med Matte (2 kand.), ref = hantverkare 2 (+ Matte-porträtt för B) | nano_banana_pro 2k 9:16 | ~10 kr | jobs 6a8fa430 (A1), 2afc6a0f (A2), 1895920e (B1), 4dacdbd0 (B2) |
| 3 | Jämförelsetest kök: GPT Image 2 (2k, high) med samma prompt och refs som B1/B2 | gpt_image_2 | ~3 kr | job 8d528d66 (B3). Bedömning: både Nano (B2) och GPT (B3) håller hantverkarens och Mattes identitet och scenen; Nano ger skarpare ansikten och svalare, mer "svensk" ton; GPT varmare och mjukare. Nano förblir standard för hero-stills; GPT som andra åsikt när Nano driver. |
| 4 | Val: hantverkare 2 · skåpbil A2 (tittar mot kameran, lättnad) · kök B2 (Matte bakom stolen, blick i kameran, mikrovågsklockan synlig). qa-stills-A1-A2-B2-B3.png | | | |
| 5 | Tagning 1 kök (720p-utkast): start_image = B2, Element char_matte, hantverkaren öppnar laptopen, Matte andas/blinkar/lyfter blicken | seedance_2_0 std 720p 6 s | 27 kr | job 7548806b |
| 6 | Skåpbil (720p-utkast): start_image = A2, dörren skjuts igen, axlarna sjunker, blick mot kameran | seedance_2_0 std 720p 4 s | 18 kr | job ccd87a9f |

Regel bekräftad: karaktärsreferensen görs FÖRE scenstillsen, annars blir det olika personer per scen. Negativa listan gäller stillbilder också — bilmärken och regskyltar dyker upp oombedda.
