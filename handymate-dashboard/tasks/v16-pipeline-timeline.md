# V16 — Pipeline Tidslinje-vy

## Status: ✅ Klar

## Vad som byggts

### Toggle i pipeline-headern
- [Kanban] [Tidslinje] segmented control i headern (dold på mobil)
- State: `pipelineView: 'kanban' | 'timeline'`
- Kanban-logiken orörd — wrappades i conditional

### TimelineView-komponent (`components/pipeline/TimelineView.tsx`)
- 14-dagars horisontell tidslinje
- Dag-headers med veckodag + datum, idag markerad med teal
- Per lead-rad med:
  - Titel + kundnamn
  - Stale-badge: "Xd i [stegnamn]" med färgkodning
  - Värde-badge (kompakt format)
  - Horisontella staplar i stegets färg
- Klick på lead → öppnar deal-modal (befintlig)

### Färgkodning
- Grön: < 24h i steget
- Gul: 24-48h i steget
- Röd: > 48h utan åtgärd + 🔴-ikon
- Staplarnas opacity ökar med ålder

### Stale lead-varning
- Röd banner i botten: "X leads utan aktivitet i 48+ timmar"
- Sorteras stale-first så inaktiva leads syns överst

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build

## Filer
- `components/pipeline/TimelineView.tsx` (ny)
- `app/dashboard/pipeline/page.tsx` (ändrad — toggle + import)
