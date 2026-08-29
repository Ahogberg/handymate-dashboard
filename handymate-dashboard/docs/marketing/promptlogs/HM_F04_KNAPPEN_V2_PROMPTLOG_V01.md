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

## V05 (2026-08-28) — skarven knuff -> replik

Andreas fynd på V04: synligt skifte i ljus/skärpa/hållning mellan B2:s slut och C3:s början (modelldrift i Seedance 2.5 trots start_image; jämförelsebild qa-skarv-b2-c3.png). Fix utan krediter: B2 klipps -to 5.7 (i rörelsen, direkt efter att han borstat händerna), C3 startar -ss 0.5, xfade 0.4 s + acrossfade. HM_F04_KNAPPEN_V2_HARD_MASTER_V05_9x16_SE.mp4, 25,7 s.
Regel: scenskarvar mellan två genereringar får alltid 0,3–0,5 s övertoning och klipps i rörelse, aldrig i stillhet.

## V06 (2026-08-28) — skarvfri: B+C som EN tagning

Andreas: skarven knuff -> replik syntes fortfarande trots övertoning (V05). Fix: ta bort skarven i stället för att gömma den.

| # | Steg | Verktyg | Resultat |
|---|---|---|---|
| 12 | Paddat ljud: 6 s tystnad + Benji-repliken | ffmpeg i sandbox -> media 1d83ebeb (mp3, 13,2 s) | talet landar efter knuffen |
| 13 | B+C som en 14 s-tagning från A:s sista bildruta | seedance_2_5 omni_reference, start_image a-last, porträtt som image_references, audio_references = #12 | job e5a692ea: gubben sitter ~4,5 s, storm + knuff ~4,5–6, replik från 6 s, gubben tillbaka ~13 s |
| 14 | Sync Lipsync 3 på hela tagningen | sync_so, input_audio = #12 | job 854ebabf, ljudspår inbakat |
| 15 | Ihopsättning V06 | A -> xfade 0,3 s -> tagningen från 3,8 s (huvudet med stilla gubbe bortklippt) -> bevis -> slutkort | HM_F04_KNAPPEN_V2_HARD_MASTER_V06_9x16_SE.mp4, 24,0 s |

Regel: när två beats ska hänga ihop utan synlig skarv — generera dem som EN tagning (Seedance 2.5 klarar 14 s med två karaktärer) och styr talets timing med paddat ljud. Skarvar mellan genereringar läggs bara där bilden är stilla.

## V07 (2026-08-28) — 1080p, två tagningar med motiverat klipp

Andreas: fortfarande "lite orealistiskt", A-klippet kvar, läppsynken inte perfekt. Orsak: 720p + helbild (ansikten ~150 px). Fix: 1080p och en NÄRBILD för repliken.

| # | Steg | Verktyg | Resultat |
|---|---|---|---|
| 16 | Tagning 1 (helbild): tryck x3 -> Matte stormar in -> knuff -> borstar händer -> blick | seedance_2_5 omni_reference 1080p, 9 s, refs: rum (a-last) + gubbe + Matte, generate_audio on | job bf565fec — ersätter A+B, ingen skarv |
| 17 | Tagning 2 (halvnära på Matte): repliken; gubben in vid knappen, skjuts ut | seedance_2_5 omni_reference 1080p, 9 s, audio_ref Benji | job 0d7f18c5 — hud/ögon/mun i full skärpa |
| 18 | Sync Lipsync 3 på tagning 2 | sync_so | job 7f0e6a5f |
| 19 | Ihopsättning V07 | tagning 1 (text 0–3,2 s) -> hårt klipp -> tagning 2 (ljud inbakat) -> bevis -> slutkort, crf 18 | HM_F04_KNAPPEN_V2_HARD_MASTER_V07_1080p_9x16_SE.mp4, 27,1 s |

Kostnad V07: ~195 krediter (609 -> 414,6). Totalt Knappen v2: ~585.
Regler: (1) talande scener görs i halvnära/närbild — läppsynk och realism följer ansiktets pixelstorlek; (2) klipp mellan tagningar ska vara MOTIVERADE (byte av bildstorlek), aldrig samma bild två gånger; (3) iterera i 720p, slutrendera i 1080p.

## V08 (2026-08-28) — 4K-leverans

Andreas frågade om uppskalning är svaret. Svar: skärpa ja, läppsynk nej (uppskalning lägger till pixlar, inte information; läppsynk följer NATIV upplösning per ansikte). Native 4K i Seedance 2.0 preflightat: 198 kr per 9 s — inte vägen.

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 20 | Närbild 1080p -> 4K | upscale_video provider topaz 2160p | 8 kr | job 16997f01, 2160x3840, finare hår/kanter, inget påhittat |
| 21 | Helbild 1080p -> 4K | topaz 2160p | 8 kr | job 315c6f13 |
| 22 | Ihopsättning 4K | ffmpeg i sandbox (bakgrundsjobb), text/slutkort renderade i 2160x3840, crf 18 | 0 | HM_F04_KNAPPEN_V2_HARD_MASTER_V08_4K_9x16_SE.mp4, 26,7 s, 33 MB |

Saldo efter: 398,6. Totalt Knappen v2: ~600 krediter över 8 versioner.
Regel: Topaz-uppskalning till 4K kostar ~1 kr/s och är standard sista steg för leverans — men aldrig ett substitut för rätt bildstorlek i genereringen.

V08b: omkodad crf 22 -> 21 MB för leverans under 30 MiB-gränsen (V08 33 MB arkiverad).

## V09 (2026-08-29) — närbilden bunden till helbilden

Andreas: "Matte ser lite annorlunda ut i närbilden, det var ganska snyggt utzoomat." Orsak: tagning 2 (2.5, omni-reference från porträttet) och tagning 1 är två olika tolkningar av samma porträtt. Fix: klipp Mattes ansikte ur 4K-helbilden (bild 8,5 s, crop 864x1536 -> 1080x1920) och använd som START-bild för närbilden, så att närbilden börjar med exakt den Matte som helbilden visar.

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 23 | Kontaktark 5,0–8,9 s ur helbild 4K (uppladdad som media 1305b624) | ffmpeg i sandbox | 0 | qa-t1-frames-5-9s.png — 8,5 s vald (armar nere, blick i kameran) |
| 24 | Startbild: crop 864x1536 @ (605,240) -> 1080x1920, lanczos + lätt unsharp | ffmpeg | 0 | media 6a8e9794, tagning3-startbild-ur-helbild.png |
| 25 | Tagning 3 (halvnära): start_image = #24, Element char_matte, audio_ref Benji (64e497e1), 8 s 1080p | seedance_2_0 std | 72 kr | job 66206fd3 |
| 26 | QA tagning 3 | kontaktark 0–7,9 s | 0 | qa-tagning3-narbild-bunden.png — identitet = helbilden i alla rutor, ren hoodie, gubben in/ut 4–5 s. Klippet hade eget ljudspår (aac) — 2.0 med audio_references + start_image levererar ljud |
| 27 | Sync Lipsync 3 på tagning 3 | sync_so, input_audio Benji, silence | ~30 kr | job 29b774af |
| 28 | Ihopsättning V09 (V07-receptet, tagning 2 -> tagning 3) | ffmpeg i sandbox, crf 18 | 0 | HM_F04_KNAPPEN_V2_HARD_MASTER_V09_1080p_9x16_SE.mp4, 26,1 s, 7,5 MB |

Regel (ny): när en talande närbild ska matcha en helbild — klipp startbilden UR helbilden (4K-versionen) i stället för att generera om från porträttet. Startbilden låser identitet, ljus och kläder; Elementet håller den genom tagningen.

## V10 (2026-08-29) — ny slutplatta

Andreas levererade `CTA-platta.mp4` (1080x1920, 30 fps, 2,6 s, eget ljud: mörk teal, vitt H-märke, "Ett AI-team för hantverksföretag.", knapp "Boka demo på handymate.se"). Arkiverad i `reference-pack/assets/brand/`, Higgsfield-media ebf2353b.

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 29 | Slutkort -> CTA-plattan, sista bildrutan hålls +1,0 s (tpad clone) så knappen hinner läsas | ffmpeg | 0 | seg5 3,6 s |
| 30 | Ihopsättning V10 (= V09 + ny platta) | ffmpeg, crf 18 | 0 | HM_F04_KNAPPEN_V2_HARD_MASTER_V10_1080p_9x16_SE.mp4, 27,1 s |

Röstbeslut (Andreas): Benji låter "stel och AI" och uttalar Karin fel. Åtgärd: inga agentnamn i tal — namnen sätts som text i bild. Uttals-/motortester (Kaarin/Karrin/pauser/MiniMax) finns i `recordings/f13-lagg-dig/rostbank/`. Röstbyte i efterhand kostar ~40 kr per film (bara Sync + ihopsättning), inte en ny film.

## V11 (2026-08-29) — tillbaka till halvnära tagning 2

Andreas: den bundna närbilden (tagning 3) tappar gag:en — gubben "glider in konstigt". Tagning 2 (job 0d7f18c5, Sync 7f0e6a5f) är vidare och visar gubben rulla in på kontorsstolen och skjutas ut. V11 = V10 med tagning 2 i stället för tagning 3. 28,1 s, 0 kr. Kvarstående skillnad: Matte i tagning 2 är 2.5:s tolkning av porträttet, inte identisk med helbilden (V09-fyndet). Om det stör: gör om tagning 2:s bildstorlek med startbild ur helbilden (72 + 30 kr).

## V12 (2026-08-29) — halvnära bunden till helbilden

Andreas: gag:en från tagning 2 (gubben rullar in) men ljus och Matte identiska med helbilden — "viktigt för realismen". Metod: V09-metoden i tagning 2:s bildstorlek.

| # | Steg | Verktyg | Kostnad | Resultat |
|---|---|---|---|---|
| 31 | Startbild: 1080x1920 @ (497,200) direkt ur helbild 4K bild 8,5 s — ingen skalning | ffmpeg | 0 | media 23e5bcba, tagning4-startbild-halvnara-ur-helbild.png |
| 32 | Tagning 4 (halvnära, huvud–midja): start_image #31, Element char_matte, audio_ref Benji, gubbe rullar in nere höger och skjuts ut | seedance_2_0 std 1080p 8 s | 72 kr | job 3c64ebe0 |
| 33 | QA tagning 4 | kontaktark 0–7,9 s | 0 | qa-tagning4-halvnara-bunden.png — ansikte/ljus = helbilden, gubben in 4 s, hand på axeln 5 s, ute 6 s |
| 34 | Sync Lipsync 3 på tagning 4 | sync_so, Benji, silence | ~30 kr | job 05298b71 |
| 35 | Ihopsättning V12 (= V10-receptet, tagning 4 i stället för 3) | ffmpeg, crf 18 | 0 | HM_F04_KNAPPEN_V2_HARD_MASTER_V12_1080p_9x16_SE.mp4, 27,1 s |

Kostnad V12: ~102 kr. Regel bekräftad: startbild ur helbilden fungerar i alla bildstorlekar — välj beskärning efter vad gag:en behöver (halvnära för gubben på stolen).
