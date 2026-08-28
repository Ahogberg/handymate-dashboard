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
