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

## Steg 2 — tagningar i 720p

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 7 | QA tagning 1 kök (720p) | kontaktark | 0 | qa-tagning1-kok-720p.png — hantverkaren sänker handen, öppnar laptopen; Matte andas, lyfter blicken 4–5,9 s. Identiteter håller. Godkänd som utkast. |
| 8 | QA skåpbil (720p) | kontaktark | 0 | qa-skapbil-720p.png — dörren igen 0–2,1 s, vänder sig mot kameran 3,5–3,9 s. Godkänd som utkast. |
| 9 | Replik 1 nya lydelsen: "Ditt jobb, ja. Gå och lägg dig." (2 läsningar: punkt / ellips) | text2speech_v2 elevenlabs Benji | ~1 kr | jobs 31ae9285 (punkt, 2,6 s), d3bf8eb6 (ellips, ~4 s). rostbank/benji-31, -32 |
| 10 | Hero-still C: halvnära Matte vid laptopen, refs B2 + Matte-porträtt, 2 kandidater | nano_banana_pro 2k | ~5 kr | jobs 194e4fb8 (C1), 7957de6d (C2). hero-stills/still-C1, C2 |
| 11 | Fem agentporträtt (reference-pack/assets/agents) upp till Higgsfield inför teamtagningen | media_upload | 0 | media karin f99785a6 · lars 50c3d508 · daniel b66ed224 · hanna 67317a86 · lisa 57db69a3 |
| 12 | Val hero-still C: **C1** (hand på halvstängd laptop, blick i kameran, mikrovågsklockan bakom). C2 = hand mot öppen skärm, hantverkaren gnuggar ögonen — bra alternativ om vi vill ha "avbrottet" tydligare. | | | |
| 13 | Sista bildrutan ur tagning 1 (720p) som startbild för teamtagningen | ffmpeg -sseof | 0 | media 8ae55d41 |
| 14 | Tagning 2 (720p-utkast): start_image = C1, Element char_matte, audio_ref läsning 31, stänger locket → repliken | seedance_2_0 std 720p 6 s | 27 kr | job 8b6c57bc |
| 15 | Tagning 3 (720p-utkast): teamet kliver in. image_references = tagning 1 sista bild + fem agentporträtt, `mode: omni_reference` (utan mode → 422 "t2v does not accept reference media") | seedance_2_5 720p 9 s | 58,5 kr | job 9dc906b5 |
| 16 | QA tagning 2 (720p) | kontaktark | 0 | qa-tagning2-matte-720p.png — locket stängs 0–1,4 s, repliken 1,4–4 s, deadpan, identitet håller. **Fel: Apple-logga på laptoplocket** (negativa listan). Till 1080p: "plain grey laptop, no logo on the lid"; om den återkommer → delogo-mask i post (statisk kamera). |
| 17 | QA tagning 3 (720p) | kontaktark | 0 | qa-tagning3-teamet-720p.png — hantverkaren går ut vänster 0–4 s; alla fem in med rätt garderob (Karin marinblå kavaj sätter sig, Lars kalendern, Daniel ljusblå skjorta offerterna, Hanna telefon + mönstrad topp, Lisa läser hans mobil), Matte bakom. **Avvikelse mot storyboard: Karin sätter sig på hantverkarens stol** (storyboard: stolen tom). Beslut Andreas. |
| 18 | Ihopsättning UTKAST V01 (720p): skåpbil + "16:03" · kök + "Kommer du?" · Matte-replik (inbakat ljud, ingen Sync i utkastet) · teamet + VO 21 + namnetiketter · platshållare för produktbevis + VO "Du säger ja i morgon" · slutrad · CTA-platta | ffmpeg | 0 | HM_F13_EFTER_JOBBET_UTKAST_V01_720p_9x16_SE.mp4, 34,5 s |

Kostnad hittills F13: ~150 kr (stills 23 + tagningar 27+18+27+58,5). Saldo ~234.

## Steg 3 — produktbevis (inspelningsläge, 0 kr)

`tests/filming/f13-lagg-dig.spec.ts` (1 passed, 1,5 min; facit 15/15; tsc 0). Demokontot, kund "Lena Nyström" (harnessets kontaktuppgifter). Tre riktiga kort av produktens egna byggare: **Karin** `invoice_reminder` (faktura FV-2026-028, skickad på riktigt, förfallodag backdaterad 12 d, `createInvoiceReminderCard`) · **Daniel** `send_sms` (offert "Fasadmålning, Björkvägen 12", skickad, `sent_at` −6 d, `createQuoteFollowUpCard`) · **Lars** `checklist_forslag` (projekt "Garage och carport, Tallstigen 3", `suggestChecklistForProject`). Filer: `HM_F13_LAGG_DIG_BEAT-01_tre-kort_1080x1920.png`, `BEAT-02_karin-kort`, `BEAT-03_daniel-lars-kort`, `HM_F13_LAGG_DIG_PRODUKTBEVIS_9x16.webm`, `HM_F13_LAGG_DIG_SANNING.json`.

Fynd att hantera:
- Kön visar **5** (två äldre `create_quote_draft`-kort på demokontot, inga testrester). Antingen låt räknaren vara, eller rensa dem — Andreas beslut. Textremsan "tre ja" stryks tills vidare; VO bär raden.
- **Mobil-UI:** hamburgerknappen ligger över rubriken "Det här behöver dig idag"; Matte-FAB + "+"-knapp täcker kortens nedre vänstra hörn. För filmen: dölj via injicerad CSS i specen (som presenter-baren). Är det ett riktigt UI-fel även för kunder? (kolla på riktig mobil).
- **Produktbugg (Vercel):** `POST /api/projects` skriver checklistförslaget fire-and-forget efter svaret — på Vercel fryses funktionen och kortet skapas aldrig för `status: planning`. Sannolikt samma klass i create-from-quote/lead/booking. → Reality Week-avvikelse.
- Cronen hade inte skapat Karins kort (auto_reminder_enabled=false på demokontot) — byggaren anropas direkt.

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 19 | Ihopsättning UTKAST V02: platshållaren ersatt med BEAT-01 (långsam zoompan nedåt över Karin → Daniel) + VO "Du säger ja i morgon" | ffmpeg | 0 | HM_F13_EFTER_JOBBET_UTKAST_V02_720p_9x16_SE.mp4, 35,5 s |
