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
