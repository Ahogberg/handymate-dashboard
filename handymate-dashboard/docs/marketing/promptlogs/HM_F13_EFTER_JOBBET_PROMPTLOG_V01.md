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

## Steg 4 — Andreas feedback på V02 → V03 (0 kr utom TTS)

Andreas: (a) Mattes replik obegriplig ("På 10 år?") — orsak: utkastet använde Seedance inbakade ljud (modellens egen förvrängda version av referensen), inte Benjis mp3. Regel: **inbakat ljud från audio_references används ALDRIG, inte ens i utkast** — lägg alltid originalfilen över (och Sync i final). (b) "Kl 16:03" stort och centrerat, inte i hörnet. (c) Partnern som röst: "Kommer du och lägger dig?" + snyggare bubbla. (d) Namnkort med porträttrutor animerade in en i taget på VO:n. (e) Slutrad "Du godkänner i morgon, så utför vi jobbet" i stället för "Du säger ja i morgon".

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 20 | TTS: partner ×3 (Isla 87466644, Maeve bb07f798, Faye a067e42a) · slutrad ×2 Benji (54 "Så utför vi jobbet" bfa234ca, 55 "Vi gör resten" 5103fdec) · fem-ords-VO "Fakturorna. Kalendern. Offerterna. Telefonen. Kunderna." (639efe3d) så Hanna får ett ord | text2speech_v2 | ~2 kr | rostbank/51–56 |
| 21 | Ordgränser ur VO:n (silencedetect −32 dB) → kortens in-tider; tystnaderna komprimerade till 0,55 s | ffmpeg | 0 | vo5.wav 5,7 s |
| 22 | Grafik i PIL (2x render → nedskalning): fem namnkort 560×120 (porträtt i cirkel, ring-färg per agent, Space Grotesk Bold namn, roll), platta "Kl 16:03" 460×130, pratbubbla med svans | python3 PIL i sandbox | 0 | qa-grafik-v1.png |
| 23 | Ihopsättning V03: platta fade in/ut centrerad · bubbla fade + lyft 12 px vid 1,4 s med partnerröst (51) · Benji l31 rakt över Matte-tagningen (inbakat ljud borttaget) · kort glider in från höger (0,3 s) på varje ord, ett i taget vid y=1040 · produktbevis + slutrad 54 · text · platta | ffmpeg | 0 | HM_F13_EFTER_JOBBET_UTKAST_V03_720p_9x16_SE.mp4, 35,9 s |

## Steg 5 — ljudsystemet in (2026-08-29, 0 kr)

Andreas levererade Handymate-ljudsystemet från Claude Design till `reference-pack/assets/audio/` (26 WAV + regelblad): stems bas/trummor/elpiano/atmosfär i 88/120/140, bädd "Teamet tar över" (20 s), signatur, godkänn-snäpp, notis, klart, fel, klocka-loop/-stopp, rumsljud kök/kontor/garage, övergångspuls, stopp, outro.

| # | Steg | Verktyg | Resultat |
|---|---|---|---|
| 24 | Analys: 48 kHz/16-bit stereo, stems exakt 8 takter (16,000 / 21,818 / 13,714 s), loop-skarvar rena (Δ<0,001), elpiano hetast (−14,3 LUFS), rum-kök −35 LUFS | ffprobe/ebur128/numpy | Kittet är tekniskt korrekt byggt |
| 25 | **Full-mix** ur stems (elpiano −4 dB, övriga 0) → tvåpass loudnorm −16 LUFS / TP −1,5 → `handymate-tema-{120,88,140}-fullmix.wav` (24-bit). Uppmätt −16,3 / −1,5, loop-skarv ren | ffmpeg + python | Standardspåret för socialt innehåll = 120-mixen |
| 26 | Klocka-stopp: sista ticket vid 4,01 s, tyst därefter → startas vid 1,0 s i köksscenen så tickandet slutar exakt 5,0 s när Matte lyfter blicken | silencedetect | |
| 27 | V04 = V03 med ljudsystemet: rum-kök under kök/Matte (×1,6), klocka-stopp, partnerröst över tickandet, ingen musik förrän teamet syns (regel 1), bädden in vid 2,4 s i teamscenen (0,5 under VO → 0,8), fortsätter under produktbeviset med duck under slutrepliken, godkänn-snäpp vid 3,9 s, outron på slutraden (3,4 s), signaturen ENSAM på plattan (plattans eget ljud bortplockat, regel 2). Integrerad ljudnivå −17,0 LUFS | ffmpeg | HM_F13_EFTER_JOBBET_UTKAST_V04_720p_9x16_SE.mp4, 37,7 s |

## Steg 6 — feedback på V04 → V05 (2026-08-29, ~1 kr TTS)

Andreas: läppsynk av (väntat — Sync körs på 1080p-tagningen när repliken är låst); partnern låter som om hon står vid mikrofonen; Mattes replik kommer från ingenstans; vita slutplattan ska vara teal i CTA-familjen med större bold text som övergår i plattan.

| # | Steg | Verktyg | Resultat |
|---|---|---|---|
| 28 | Ny replik ×3 (Benji): 61 "Ja, gå och lägg dig. Vi tar över härifrån." · 62 "Gå och lägg dig, du. Vi tar det härifrån." · 63 "Ja. Gå och lägg dig. Vi tar över härifrån." | text2speech_v2 | rostbank/61–63; 61 i utkastet |
| 29 | Partnern "i andra rummet": highpass 300 Hz, lowpass 2,8 kHz, aecho 38/71 ms, −10 dB | ffmpeg | |
| 30 | Slutrad på teal-platta (#103129 sampla ur CTA-plattan, knappteal #1B967E på rad 2), Space Grotesk Bold 60, text tonar in + lyfter 20 px, xfade 0,6 s in i CTA-plattan; outro under texten, signaturen vid 3,3 s | PIL + ffmpeg | HM_F13_EFTER_JOBBET_UTKAST_V05_720p_9x16_SE.mp4, 37,1 s |
