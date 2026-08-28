# HM_F04_KNAPPEN_V2 — promptlogg V01

Film: F04 v2 · "Knappen" (Andreas idé 2026-08-28: trött gubbe i bygghjälm trycker på knapp som en robot, Matte rullar ut honom och talar)
Master: `docs/marketing/recordings/knappen-v2/HM_F04_KNAPPEN_V2_MASTER_V01_9x16_SE.mp4` (28,1 s, 1080×1920)
Hooks: A (text "Så här jobbar ett affärssystem.") — B/C ej producerade ännu
Sanningsgrind godkänd av: — (väntar på Andreas)
Produktbevis: F07 beat 4 (Mattes riktiga ÄTA-svar, demokontot, inspelningsläget 2026-08-28), caption "Matte. Din chefsagent."

## Elements
- `char_matte` (b6bc4b68) — porträttet ur referenspaketet
- `char_gubben` (8159d0f5) — skapad ur image_job `cfdd83ed` (Nano Banana, 1:1, "tired Swedish man ~60, plain white hard hat, plain yellow hi-vis vest, no text")

## Genereringar

| # | Scen | Modell | Referenser | Längd | Resultat | Syntetiskt? | Beslut |
|---|---|---|---|---|---|---|---|
| 1 | Gubbe-porträtt ×2 | nano_banana_pro | – | – | #1 vald: tom blick, ingen text | Ja | ✅ |
| 2 | Replik "Det gamla sättet är förbi. Välkommen till framtiden — där ditt digitala team arbetar för dig." | seed_audio, röst Harrison | – | 7,6 s | job `8c7ead50` | Ja (TTS) | ✅ (Andreas lyssnar) |
| 3 | A — gubben trycker ×3 | seedance_2_0 std 720p comedy, audio on | Element gubben | 5 s | job `a00e7427`; identitet ✓, knapp ✓, ingen text | Ja | ✅ |
| 4 | B — Matte rullar ut stolen | seedance_2_0, start_image = A sista bildruta | Elements matte+gubben | 6 s | job `7bb71e32`; ren hoodie, samma rum, gubben ut höger | Ja | ✅ |
| 5 | C — Matte talar, gubben tillbaka | seedance_2_0, start_image = B sista bildruta, audio_references = #2, generate_audio off | Elements matte+gubben | 8 s | job `feff3d8a`; läppsynk mot repliken, gubben in/ut, ren hoodie. Videon saknade ljudspår → wav mixad in vid ihopsättning | Ja | ✅ |

## Ihopsättning (Higgsfield-sandbox, ffmpeg)
seg1 A + hook-text (Space Grotesk, off-white platta) · seg2 B · seg3 C + line.wav · seg4 F07-beat zoompan 4 s + caption · seg5 slutkort ("Inte ännu en knapp." / "Ett digitalt team." / handymate.se, teal logga) · concat 25 fps, x264 crf 19, aac.

## Klipp som är syntetiska i mastern
00:00–19:00 (scen A, B, C) — märk "AI-genererad visualisering" i bild före publicering.

## Klipp som är riktiga
19:00–23:00 produktbevis (skärm från demokontot) · 23:00–25:6 slutkort (post).

## Rättigheter
- VO: syntetisk (Higgsfield preset "Harrison") — inget avtal krävs; byt till riktig röst om det ska publiceras brett
- Musik: ingen
- Personer: Matte och gubben är produktkaraktärer, inga riktiga personer

## Avvikelser mot produktionskortet
- Bibelns F04 hade en hand + knapp; v2 är Andreas nya gag med två karaktärer. Skiss och sanningsgrind uppdaterade i chatten 2026-08-28.
- Kängan riktas mot kategorin (hjälm + väst = "systemet som klär ut sig"), ingen konkurrent nämns.

## Kostnad
Porträtt ×2 + TTS + tre Seedance-scener = **90,2 krediter** (balance 1000 → 909,8).

## V02 och V03 (2026-08-28, senare samma dag)

Beslut Andreas: AI-märkning görs på plattformen (Meta/TikTok/YouTube), inte i bild. Röst: Benji (ElevenLabs-motorn) efter röstbank med sex presets — Harrison (Seed-motorn) hade engelsk brytning. Lugna läsningen vald tills vidare; två energiskare Benji-läsningar (A/B) finns i rostbank/.

| # | Scen | Modell | Referenser | Längd | Resultat | Beslut |
|---|---|---|---|---|---|---|
| 6 | Benji-replik (lugn) | text2speech_v2 elevenlabs | – | 7,5 s | job 64e497e1 | vald |
| 7 | C2 — Matte talar (Benji) | seedance_2_0, start = B sista bildruta, audio_ref #6 | Elements matte+gubben | 8 s | job 19a65c47 — samma gag, ren hoodie | V02 |
| 8 | B2 — HÅRD: Matte stormar in, slungar stolen | seedance_2_5 omni_reference, start = A sista bildruta | porträtt som image_references (2.5 stöder inte Elements-placeholder) | 6 s | job 9a1f0700 — rörelseoskärpa, papper i luften, borstar händerna, blick i kameran | V03 |
| 9 | C3 — HÅRD: Matte talar, gubben tillbaka, hård utskjutning | seedance_2_5 omni_reference, start = B2 sista bildruta, audio_ref #6 | porträtt som image_references | 8 s | job 6ba186c0 — gubben in, trycker, ut | V03 |

Masters: HM_F04_KNAPPEN_V2_MASTER_V02_9x16_SE.mp4 (mjuk, 2.0 + Benji) · HM_F04_KNAPPEN_V2_HARD_MASTER_V03_9x16_SE.mp4 (hård, 2.5 + Benji).
Kostnad V02+V03 inkl. röstbank: 130 krediter (909,8 → 779,65). Totalt Knappen v2 hittills: 220 krediter.

Lärdomar: Seedance 2.5 tar porträtten direkt som image_references och höll identiteten lika bra som 2.0 + Elements. Ingen av modellerna levererar ljudspår när audio_references används — repliken mixas in vid ihopsättningen. Kvalitetshöjning: Topaz/ByteDance-uppskalning av godkända klipp går inte att preflighta; 1080p-omgenerering kostar 72 kr/8 s i både 2.0 och 2.5.

## V04 (2026-08-28) — fix av dubbelklipp + riktig läppsynk

Andreas fynd på V03: (1) B2 börjar från A:s sista bildruta -> första sekunden dubblerar A:s slut i annan kvalitet och utan text; (2) läppsynken i C3 helt off (Seedance audio_references styr munnen bara löst).

| # | Steg | Verktyg | Resultat |
|---|---|---|---|
| 10 | C3 -> Sync Lipsync 3 | model sync_so, input_video = job 6ba186c0, input_audio = job 64e497e1 (Benji), sync_mode silence | job 8e4e71bc, 8 s, levererar ljudspår (aac) med repliken inbakad |
| 11 | Ihopsättning V04 | ffmpeg: B2 trimmad -ss 1.2 (stormningen börjar direkt efter A), C3-sync trimmad -ss 0.3, ljudet från sync-klippet | HM_F04_KNAPPEN_V2_HARD_MASTER_V04_9x16_SE.mp4, 26,6 s |

Regel framåt: scener som startar från föregående scens sista bildruta ska ALLTID trimmas i huvudet vid ihopsättning (0,3–1,2 s beroende på när handlingen börjar). Talande scener: generera tyst med audio_references för timing, kör sedan Sync Lipsync 3 på klippet innan ihopsättning.
