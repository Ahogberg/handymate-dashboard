# Handymate Reference Pack — för Higgsfield (V1, 2026-08-28)

Det här är paketet som laddas i **varje** Higgsfield-körning. Det kompletterar `docs/marketing/video-creative-bible/` (12 filmer) och ersätter ingenting där. Regeln från handboken gäller: Higgsfield är en scenmotor för B-roll och kontrollerad porträttrörelse — **aldrig** för UI, text, logotyp, belopp eller Andreas.

## Innehåll

| Fil | Vad | Används när |
|---|---|---|
| `01-brand-kit.md` | Logotyp, palett, typsnitt, agentfärger, förbud | Efterbearbetning (text/logo i post) + Higgsfields brand kit |
| `02-agenter.md` | Identitetslås per agent (det som faktiskt syns i porträtten) + porträttprompt | Varje generering med en agent |
| `03-matte-huvudperson.md` | Karaktärsplansch för Matte som levande huvudperson, tre nivåer med sanningsgrind | F03, F04, F05, F11 och alla nya Matte-filmer |
| `04-ljus-och-miljo.md` | Två ljusreferenser, gemensamt stilprefix och negativt suffix att klistra in | Varje B-roll-generering |
| `05-negativ-lista.md` | Kassationslistan | QA av varje klipp |
| `06-promptlogg-mall.md` | Loggmall per produktion (handbokens §5 kräver den) | Varje film |
| `assets/` | Filerna: mark (transparent), porträtt ×6, ljusreferenser ×2, typsnitt | Ladda upp i Higgsfield |

`assets/` byggs av `node scripts/marketing/build-reference-pack.mjs` från källorna i `public/` — kopiera aldrig för hand, kör scriptet.

## Så laddas paketet i Higgsfield per körning

1. **Brand kit** (en gång per projekt): `assets/brand/handymate-mark-transparent.png`, paletten ur `01-brand-kit.md`, typsnitten. Brand kit används för *efterbearbetning och konsekvens* — inte för att modellen ska rita logotypen.
2. **Ljusreferens** (varje B-roll): `assets/light/worksite-morning-source.png` (verkstad, morgon) eller `assets/light/van-morning-source.png` (bil, morgon). Hemmiljön har ingen egen bildreferens ännu — använd stilprefixet i `04-ljus-och-miljo.md` tills en finns.
3. **Agentporträtt** (varje agentklipp): exakt en agent per körning, porträttet som strikt identitets-, garderobs- och ljusreferens. Aldrig två agenter i samma generering.
4. **Prompt** = stilprefix + scenbeskrivning från handbokens produktionskort + negativt suffix. Byt aldrig ut handbokens scen mot en egen improvisation utan att uppdatera produktionskortet.
5. **Kassera** enligt `05-negativ-lista.md`. Behåll ungefär 1 av 5.
6. **Logga** i `06-promptlogg-mall.md` innan klippet går till klipp.

## Sanningsjusteringar som gäller från 2026-08-28

- **Lisa svarar inte på samtal.** Hon fångar missade samtal (SMS) samt webb- och mejlförfrågningar. All copy som antyder ett fört telefonsamtal stryks — det gäller F08 ("hemsidan eller mejlen" → "hemsidan" tills mejlinflödet är bevisat) och F11:s Lisa-rad.
- **Matte får bli levande huvudperson** — men i den nivåtrappa som `03-matte-huvudperson.md` beskriver. Nivå 3 (talande Matte) kräver ett explicit beslut av Andreas per film.
- Handbokens språklås "du godkänner innan viktiga handlingar eller kundutskick" är ett produktlöfte. Fyra automationer i produkten saknar i dag grind (se `docs/reality-week/pass2-block-a-2026-08-28.md` §F). Filma inte F03/F12 med den repliken förrän punkt 8-beslutet är taget.
