# Handymate Content Library V1

Ett publiceringsklart innehållsbibliotek för Handymates lanseringsposition:

> Det digitala teamet för hantverksföretag.

Biblioteket bygger vidare på kampanj 01 men visar en större del av produkten än
Uppdrag. Materialet förklarar teamet, skillnaden mot traditionella system och
de konkreta arbetskedjor som sparar tid, skyddar intäkter och förbättrar
kundkontakten.

## Kampanjfamiljer

### 01 — Hälsa på ditt team

Åtta 4:5-bilder: omslag, Matte, Karin, Daniel, Lars, Hanna, Lisa och avslutning.
Profilerna återanvänder de riktiga agentporträtten samt ärlighetsgranskade
exempel från onboardingens `Step1MeetTheTeam`.

### 02 — 2006 → 2026

Sex 4:5-bilder som skiljer ett registrerande affärssystem från ett arbetande
digitalt team. Inga konkurrenter namnges och inga påståenden görs om enskilda
produkter.

### 03 — Så arbetar teamet åt dig

Åtta 4:5-bilder som konkretiserar offertuppföljning, faktureringsberedskap,
projektblockerare, kundportal, reaktivering och kontrollgränsen före handling.

### Fristående och video

Fyra fristående 4:5-inlägg och tre 9:16-omslag för Reels/Stories.

## Filer

- `messaging-playbook.md` — budskapshierarki, ordval och innehållspelare
- `campaign-copy.md` — captions, bildtexter, alt-texter och Reel-manus
- `render.html` — deterministiska originalytor för samtliga bilder
- `public/marketing/content-library-v1/` — färdiga PNG-filer
- `public/marketing/handymate-content-library-v1.zip` — nedladdningspaket

När sajten körs kan hela biblioteket hämtas direkt från:

`/marketing/handymate-content-library-v1.zip`

## Publiceringsprincip

Varje automation förklaras som:

1. något händer,
2. rätt agent upptäcker det,
3. Handymate föreslår eller förbereder nästa steg,
4. hantverkaren behåller kontrollen där det krävs,
5. resultatet redovisas utan att överdrivas.

Agentporträtten gör teamet mänskligt och lätt att förstå. De får aldrig användas
som låtsaskunder, testimonials eller bevis för resultat som inte har inträffat.

## Återskapa bilderna

Kör från repo-roten:

```powershell
node scripts/render-content-library.mjs
```

Renderaren använder lokal logotyp, lokala typsnitt och lokala agentporträtt.
Ingen extern bildtjänst eller nätverksåtkomst krävs efter första leveransen.
