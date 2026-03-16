# V16 — Kundportal: Projekt-tracker

## Status: ✅ Klar

## Vad som byggts

### Del 1 — SQL Migration (`sql/v16_project_tracker.sql`)
- `project_stages` — steg per projekt (quote_accepted, material, work_started, inspection, done)
  - UNIQUE constraint på (project_id, stage) för upsert
  - completed_at, completed_by, note
- `project_photos` — foton per projekt (before/progress/after)
- RLS + index + realtime publication

### Del 2 — Projekt-tracker i kundportalen
- `ProjectTracker`-komponent i portal/[token]/page.tsx
- 5 steg med vertikal connector-linje + progress-animation
- Visar:
  - Avklarat steg: teal bakgrund + ✓-ikon
  - Pågående steg: pulsande border + "Pågår nu..."
  - Framtida steg: grå border
  - Datum + anteckning per steg
- Foto-galleri i grid med "Klart"/"Före"-badges

### Del 3 — Realtidsuppdatering
- 30s polling när kunden har ett projekt öppet i portalen
- fetchTabData('projects') körs automatiskt

### Del 5 — API route (`app/api/projects/[id]/stages/route.ts`)
- GET — hämta alla steg
- POST — upsert steg + SMS till kund
- SMS-mallar:
  - `work_started`: "Vi har nu påbörjat arbetet med {project}"
  - `done`: "{project} är nu klart. Tack för förtroendet!"
- SMS via 46elks, non-blocking (catch errors)

### Portal API uppdaterad
- `app/api/portal/[token]/projects/route.ts` returnerar nu:
  - `tracker_stages[]` — steg med completed_at, note
  - `photos[]` — foton med url, caption, type

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build

## Filer
- `sql/v16_project_tracker.sql` (ny)
- `app/api/projects/[id]/stages/route.ts` (ny)
- `app/api/portal/[token]/projects/route.ts` (ändrad)
- `app/portal/[token]/page.tsx` (ändrad — tracker + polling)
