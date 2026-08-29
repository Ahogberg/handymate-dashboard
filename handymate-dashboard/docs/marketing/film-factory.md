# Filmfabriken — automatiserat flöde från film-ID till färdig master

Ett kommando till Claude ("kör F06") ersätter allt fram-och-tillbaka. Bevisat end-to-end 2026-08-28 med F04 "AI-knappen": **11 krediter, ~10 minuter, färdig master 14,8 s.**

## Kedjan (körs av Claude i en session, utan bollande)

| Steg | Verktyg | Vad | Kostnad |
|---|---|---|---|
| 1. Produktbevis | `npx playwright test --project=filming tests/filming/fXX-*.spec.ts` | Demokontot sätts i filmens exakta tillstånd, video + skarpa beat-stillbilder + sanningsfil | 0 |
| 2. B-roll | Higgsfield MCP `generate_video_batch` (headless) | Handbokens produktionskort + referenspaketets stilprefix/negativa suffix. Kostnadspreflight (`get_cost: true`) FÖRE varje generering | se modelltabell |
| 3. QA av B-roll | `show_generation_by_ids` + nedladdning + bildgranskning | Negativa listan (`reference-pack/05`) — kassera och regenerera vid behov | 0 (granskningen) |
| 4. Ihopsättning | Higgsfield `sandbox_exec` (ffmpeg, förinstallerat) | Hook-text (Space Grotesk hämtas i sandboxen), captions, slutkort med teal-loggan, concat → MP4, PUT till Higgsfield-media | 0 |
| 5. QA av master | Frame-extraktion i sandboxen → bildgranskning | Textytor, logga, skärpa | 0 |
| 6. Leverans | Nedladdning till `docs/marketing/recordings/<film>/` + fil till Andreas | Arkivnamn enligt handboken §5 | 0 |

## Modellkostnader (uppmätta 2026-08-28, per klipp)

| Modell | Kostnad | När |
|---|---|---|
| Kling 3.0 (std, 5 s, utan ljud) | 7,5 kr | Utkast/seed-test |
| **Veo 3.1 fast (4 s, med ljud)** | **11 kr** | **Standard för skarpa B-roll-scener** — F04-pilotens val, mycket bra svensk miljö och händer |
| Seedance 2.5 (5 s, 720p) | 32,5 kr | När omni-referens behövs (Matte-identitet i scen, nivå 2) — handbokens prompter är skrivna för den |

Saldo styr ambitionen: kolla `balance` först. En hel film = 1–5 scener × 1–3 seeds → budgetera innan start och säg totalen till Andreas när den överstiger ~50 kr.

## Regler (från piloten)

1. **Preflighta alltid kostnaden** (`get_cost: true`) och rapportera per generering.
2. **Produktbevis i rörelse = uppskalad viewport-video; stillastående produktbevis = skarp beat-PNG med långsam zoompan.** Playwright skalar aldrig upp video (V01-fyndet).
3. **Loggan i slutkortet är `public/logo.png` (teal).** `handymate-mark-transparent.png` är VIT — osynlig på off-white (V01-fyndet). Skaffa en riktigt frilagd teal-SVG före hero-filmerna: dagens PNG har en svagt ljusgrå platta som syns mot off-white.
4. **Typsnitt i sandboxen:** Space Grotesk hämtas från Google Fonts-repot per körning (variabel TTF fungerar i drawtext); captions i Montserrat (förinstallerad) som stand-in för DM Sans — byt i den riktiga posten om det ska publiceras brett.
5. **Text läggs alltid i ihopsättningen, aldrig i genereringen** (handbokens regel — och det är därför texten blir knivskarp).
6. **Allt arkiveras** i `docs/marketing/recordings/<film>/` med sanningsfil; promptlogg enligt `reference-pack/06`.
7. Higgsfields färdiga workflows (`get_workflow_instructions`): `video-editing` (higgsedit) för avancerade klipp med grafik/undertexter, `subtitles` för inbrända captions från VO, `ad-multiplier` för varianter av en färdig master, `virality_predictor` för hook-testning före publicering. Använd dem när enkel ffmpeg inte räcker.

## Kvar att bygga vid behov

- VO-spår: riktig svensk röst (handbokens krav) — spela in, eller `create_voice` med samtycke/avtal; läggs på i steg 4.
- Hook-varianter A/B/C: samma master, tre olika seg1-texter — tre ffmpeg-körningar, 0 extra krediter.
- Matte nivå 2 i scen: Seedance 2.5 omni-referens med `assets/agents/matte.png` — kör identitets-QA per klipp (`reference-pack/03`).

## Tillägg 2026-08-28 (efter Knappen v2, åtta versioner)

| Lärdom | Regel |
|---|---|
| 720p helbild ger ~150 px ansikte — läppsynk och hud blir aldrig bra | Talande scener i halvnära/närbild. Iterera i 720p, slutrendera i 1080p. |
| Varje skarv mellan två genereringar syns (drift), övertoning gömmer den inte | Klipp bara mellan OLIKA bildstorlekar (hel -> nära). Beats som ska hänga ihop = en tagning. |
| Seedance audio_references styr munnen bara löst | Alltid Sync Lipsync 3 (sync_so) på talklipp — levererar ljudspår inbakat. ~30 kr. |
| Ingen modell levererar ljud när audio_references används | Mixa repliken vid ihopsättning eller ta ljudet från Sync-klippet. |
| Seedance 2.5 tar porträtt direkt som image_references (inga Elements) och håller identiteten | Använd 2.5 för tvåkaraktärsscener; 2.0 + Elements fungerar lika bra i 720p. |
| Topaz 4K-uppskalning ~1 kr/s | Standard leveranssteg. Native 4K (2.0) kostar 198 kr/9 s — undvik. |
| Timing av tal i en lång tagning | Padda ljudfilen med tystnad före repliken och ge den som audio_references. |
| Preset-varning från generate_video ("IN THE DARK") | Skicka om med declined_preset_id — inget debiteras av varningen. |
| Närbild och helbild blir två olika "tolkningar" av samma porträtt (V07-fyndet) | Klipp startbilden till närbilden UR helbildens 4K-fil (crop -> 1080x1920) och ge den som start_image + Element. Då är det bevisligen samma person i båda bildstorlekarna (V09). |
| Slutplattan är en färdig video (`reference-pack/assets/brand/CTA-platta.mp4`, 2,6 s, eget ljud) | Sista segmentet = plattan, skalad till masterns fps, sista bildrutan hålls +1 s (tpad clone) så CTA-knappen hinner läsas. Ingen egen slutkortsrendering längre. |
| Syntetisk röst snubblar på svenska namn ("Karin") och låter stel | Inga egennamn i tal — namn som text i bild. Röst kan bytas i efterhand för ~40 kr/film (Sync + ihopsättning), tagningarna görs alltid utan inbakad röst. |
| Videomodellens första bildruta saknar hudtextur ("AI-ren") — och allt efter ärver den | **Hero-still först** för talande tagningar: nano_banana_pro 2k med startbildruta + porträtt som image_references, "recreate as a real photograph, same composition, calm deadpan expression", 2–3 kandidater (~3 kr/st), välj, ge som start_image utan uppskalning. Bevisat i Knappen V13. Skriv aldrig "enhance" (drar in porträttets leende); Soul 2.0 är fel verktyg när kompositionen ska bevaras. |
