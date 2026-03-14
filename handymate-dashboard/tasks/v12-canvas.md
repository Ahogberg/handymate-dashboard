# V12 Rityta / Canvas

## Status: KLAR

## Vad som byggdes

### SQL Migration
- `sql/v12_canvas.sql` — `project_canvas` tabell med JSONB canvas_data, UNIQUE per projekt

### API
- `app/api/projects/[id]/canvas/route.ts`
  - GET: Hämta canvas-data (returnerar tom canvas om ingen finns)
  - PUT: Upsert canvas-data (skapar eller uppdaterar)

### Canvas-komponent
- `components/project/ProjectCanvas.tsx` — Fabric.js v6 canvas med:
  - Frihandsteckning (penna) med valbara färger och tjocklekar
  - Textverktyg (Textbox, redigerbar)
  - Bilduppladdning (placeras på canvas, skalas ned automatiskt)
  - Former: rektangel och cirkel
  - Raderingsverktyg (vit penna)
  - Ångra/gör om (historik)
  - Auto-spara var 30:e sekund
  - Manuell spara-knapp med tidsstämpel
  - Touch-stöd (touchAction: none)
  - Responsiv bredd vid resize

### Projektvy-integration
- Ny flik "Rityta" i projektvyns tabbar
- Dynamisk import med `next/dynamic` (ssr: false) — Fabric.js laddas bara client-side
- Loading-spinner under laddning

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build
