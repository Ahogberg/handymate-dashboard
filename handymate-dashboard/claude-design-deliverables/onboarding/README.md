# Claude Design — Onboarding Deliverables

Visuell design + interaktion för onboarding-flödet. Levererat 2026-04-26.

Filerna är **referens-material** — den faktiska implementationen ligger i:
- `app/onboarding/onboarding.css` (portad CSS)
- `app/onboarding/components/Step{1-6}*.tsx` (portade komponenter)
- `app/onboarding/page.tsx` (refaktorerad orchestrator)

## Avvikelser från Claude Designs leverans

1. **Step2 utökad** — Claude Designs Step2 hade bara företagsdata (logo, namn, bransch, org-nr, F-skatt, område). Eftersom Stripe i Step5 kräver inloggad användare har vi lagt till en kontosektion (kontakt-namn, e-post, lösenord) längst ner i samma steg. Detta bibehåller 5-stegs-flödet.

2. **Custom Icon → lucide-react** — Claude Designs custom SVG-ikonkomponent ersatt med `lucide-react` (samma visuella resultat, redan installerat).

3. **Avatar-URLs** — placeholders `assets/team/{id}.png` ersatta med verkliga signerade URLs från `lib/agents/team.ts`.

## Filer

- `index.html` — interaktiv demo med mobile + desktop frames
- `onboarding.css` — full CSS-spec (designsystem)
- `ob-shared.jsx` — Icon + Header
- `ob-screen{1-6}.jsx` — varje skärm
