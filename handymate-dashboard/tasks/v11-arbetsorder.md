# V11 T1 — Arbetsorder

## Status: ✅ Klart

## SQL Migration
- [sql/v11_arbetsorder.sql](../sql/v11_arbetsorder.sql) — `work_orders` tabell
- Alla FK:er använder TEXT (matchar befintlig DB-konvention)
- `work_orders.business_id` → `business_config(business_id)`
- `work_orders.project_id` → `project(project_id)`
- RLS aktiverat med öppna policies
- **Kör manuellt i Supabase SQL Editor**

## API-routes

### `/api/work-orders` (route.ts)
- **GET** — Lista arbetsorder (filtrering: `project_id`)
- **POST** — Skapa arbetsorder (auto-genererat ordernummer AO-001, AO-002...)
- **PATCH** — Uppdatera arbetsorder (tillåtna fält)
- **DELETE** — Ta bort arbetsorder

### `/api/work-orders/[id]/send` (route.ts)
- **POST** — Skicka SMS via 46elks med formaterat meddelande
- Sätter status till 'sent', uppdaterar sent_at
- Triggar fireEvent('work_order_sent')

### `/api/work-orders/[id]/complete` (route.ts)
- **POST** — Markera som slutförd (status='completed', completed_at)

### `/api/work-orders/[id]/pdf` (route.ts)
- **GET** — Generera PDF med jsPDF (stor text, fältsektioner)

## UI — Projektsida tab "Arbetsorder"
- Listvyn med kort: ordernummer, titel, status, datum, adress, tilldelad, SMS-knapp
- Detaljvy med alla fält, skriv ut / redigera / slutför-knappar
- **WorkOrderModal**: skapa/redigera med alla fält
  - Titel, datum, tid start–slut, adress, tillträde/portkod
  - Kontaktperson (namn+tel), beskrivning, material, verktyg
  - Tilldela till (namn+telefon), övrigt
  - [Spara utkast] och [Spara & skicka SMS] (visas om telefonnr finns)

## Orchestrator
- `work_order_sent: 'lead'` tillagd i EVENT_ROUTING i `lib/agent/orchestrator.ts`

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build
