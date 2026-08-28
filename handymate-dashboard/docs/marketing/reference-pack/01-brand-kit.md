# 01 · Brand kit

Källa: `docs/HANDYMATE_DESIGN_SYSTEM.md` (enda sanningen för visuell design), `tailwind.config.ts`, `app/layout.tsx`, `docs/marketing/content-library-v1/render.html`.

## Logotyp

| Fil i `assets/brand/` | Ursprung | Använd till |
|---|---|---|
| `handymate-mark-transparent.png` (1080×1080, RGBA) | `public/marketing/content-library-v1/profile/profile-04-transparent.png` | **Slutkort, compositing, all video.** Enda logotypfilen som får läggas på film. |
| `logo-612.png` (612×612, RGBA) | `public/logo.png` | Reserv; appens favicon/PWA-ikon. |

Det finns **ingen vektorlogotyp och ingen ordmärkesfil**. "Handymate" som ordmärke sätts alltid live i Space Grotesk 600–700, `letter-spacing: -0.045em`, intill H-märket. Beställ en SVG innan hero-filmerna (F12) mastras — PNG räcker för 1080p men inte för 4K-upskalning av slutkortet.

Logotypen får **aldrig** genereras, beskrivas eller "förbättras" av modellen. Prompterna säger uttryckligen *no logos*.

## Palett

### Kärna (app + film)

| Roll | Hex | Not |
|---|---|---|
| Primär teal | `#0F766E` | Chrome, knappar, accent i miljö |
| Teal hover | `#0D9488` | |
| Teal ljus/accent | `#14B8A6` | Sparsamt |
| Mörk teal | `#134E4A` | |
| Mörk hero-gradient | `#0F2E2A → #134E4A` (135°) | Slutkort, mörka ytor |
| Brand-CTA-gradient | `#0F766E → #14B8A6` (135°) | CTA-knapp i slutkort |
| Navy / bläck | `#0F172A` (primär text), `#1E293B` (sekundär) | All text på ljus yta |
| Off-white / bakgrund | `#F8FAFC` | Appens bakgrund |
| Varm off-white (marknad) | `#F7F8F6` | Studio-bakgrund för agentporträtt-klipp |
| Mint | `#DFF4EF` | Ljusa paneler i grafik |
| Slate (sekundär text) | `#475569` | |
| Linje | `#DBE3E1` | |

### Marknadsrenderingens mörka ytor
`#073F3B` (teal-dark), `#052F2C` (teal-deep), `#78D1C0` / `#8DD7C9` (ljus teal-text på mörkt), `#CFEAE5`.

Obs: H-märkets faktiska pixelfärg i `logo.png` mäter ≈ `#128284` — något ljusare/blåare än `#0F766E`. Färgkorrigera aldrig märket; låt det vara.

### Agentfärger — bara på avataren

| Agent | Hex |
|---|---|
| Matte | `#0F766E` |
| Karin | `#2563EB` |
| Daniel | `#D97706` |
| Lars | `#059669` |
| Hanna | `#9333EA` |
| Lisa | `#0EA5E9` |

Regel (`components/agents/AgentAvatar.tsx`): agentfärgen lever **enbart** som ring/prick på avataren. Max två accentfärger per bild. Ett teamslutkort med sex färgade paneler är fel — sex avatarer med varsin ring på off-white är rätt.

### Förbjudet
Fuchsia, rosa, violett, indigo som ytfärg. Mörkt tema. Neon-AI, hologram, glödande UI.

## Typsnitt

| Variabel | Familj | Vikter | Användning |
|---|---|---|---|
| `--font-heading` | **Space Grotesk** | 500/600/700 | Rubriker, slutrader, kr-belopp (`tabular-nums`) |
| `--font-body` | **DM Sans** | 400/500/600/700 | Brödtext, textning |
| `--font-mono` | JetBrains Mono | 400/500 | Bara stora hero-siffror, aldrig brödtext |

Lokala woff2 för offline-post: `assets/fonts/space-grotesk-latin.woff2`, `assets/fonts/dm-sans-latin.woff2`. **Inter används aldrig.**

Textning: DM Sans 500, vit på 60 % `#0F172A`-platta eller navy på off-white, inom centrala säkra 80 % (9:16). Rubrik i post: Space Grotesk 700, `-0.045em`.

## Slutkortet (alla filmer)

Off-white `#F7F8F6` eller mörk hero-gradient. H-märket 18–22 % av bildbredden, ordmärke i Space Grotesk, en slutrad, en CTA. 1,5 sekunder i korta format, 2,5 i 16:9. Inget annat.
