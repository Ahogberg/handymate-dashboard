# V16 — Snabbknappar på lead-kort i pipeline

## Status: Klar (build OK, tsc OK)

## Vad som byggdes

### Ändrade filer
- [x] `app/dashboard/pipeline/page.tsx`
  - `DealCard` utökad med 4 snabbknappar (hover desktop, alltid synliga mobil)
  - **Ring** — `tel:` länk direkt till kundens nummer
  - **SMS** — öppnar inline SMS-modal med 320-teckensgräns
  - **Offert** — navigerar till `/dashboard/quotes/new?customer=X`
  - **Vunnen** — flyttar deal till is_won-steget direkt
  - Quick SMS modal med skicka-knapp, teckenbegränsning, auth-token
  - `handleQuickSms()` + `handleQuickWon()` callbacks
  - `DealCardProps` utökad med `onQuickSms` + `onQuickWon`

## Verifiering
- `npx tsc --noEmit` — 0 fel
- `npx next build` — ren build
