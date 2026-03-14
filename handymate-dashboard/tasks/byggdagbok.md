# T3 — Byggdagbok (Construction Diary)

## Status: ✅ Klart

## Ändringar

### SQL-migration
- `sql/v10_byggdagbok.sql` — Lägger till `workers_present`, `deviations`, `signed_by_customer`, `customer_signed_at`, `photos` på `project_log` + index
- **Kör manuellt i Supabase SQL Editor**

### API-routes
- `app/api/projects/[id]/logs/route.ts` — POST hanterar `workers_present` och `deviations`
- `app/api/projects/[id]/logs/[logId]/route.ts` — PATCH tillåter `workers_present` och `deviations`
- `app/api/projects/[id]/logs/pdf/route.ts` — **NY** PDF-export med jsPDF

### UI (app/dashboard/projects/[id]/page.tsx)
- Flik omdöpt: "Dagbok" → "Byggdagbok"
- **LogModal** omskriven:
  - Väder som emoji-knappar (☀️ ⛅ 🌧️ ❄️)
  - Antal arbetare (number input)
  - Avvikelser (textarea)
  - Konsekvent styling
- **Loglista** uppgraderad:
  - Fullständigt datum med veckodag på svenska
  - Väder-emojis + temperatur
  - Arbetarantal med ikon
  - Avvikelser i gul varningsruta
  - Fotothumbnails
  - "Exportera PDF"-knapp

### PDF-export
- Professionell layout med företagsinfo + "BYGGDAGBOK"-rubrik
- Kronologiskt sorterade poster med datum, väder, arbetare, beskrivning, material, avvikelser, anteckningar
- Sidfot med sidnumrering

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build
