# V10 T4 — Fordonsrapportering

## Status: ✅ Klart

## SQL Migration
- [sql/v10_vehicles.sql](../sql/v10_vehicles.sql) — `vehicles` + `vehicle_reports` tabeller
- Alla FK:er använder TEXT (matchar befintlig DB-konvention)
- `vehicles.business_id` → `business_config(business_id)`
- `vehicle_reports.project_id` → `project(project_id)`
- `vehicle_reports.lead_id` → `leads(lead_id)`
- RLS aktiverat med öppna policies
- **Kör manuellt i Supabase SQL Editor**

## API-routes

### `/api/vehicles` (route.ts)
- **GET** — Lista fordon (filtrerar inaktiva om `show_inactive` ej satt)
- **POST** — Skapa fordon (namn, reg_number, billing_type, rate)
- **PATCH** — Uppdatera fordon (namn, rate, is_active etc)
- **DELETE** — Ta bort fordon

### `/api/vehicle-reports` (route.ts)
- **GET** — Lista körrapporter med relationer (vehicle, project, business_user). Filtrering: `start_date`, `end_date`, `vehicle_id`, `project_id`
- **POST** — Skapa körrapport (fordon, projekt, adresser, avstånd, belopp etc)
- **PATCH** — Uppdatera rapport
- **DELETE** — Ta bort rapport

### `/api/vehicle-reports/calculate-distance` (route.ts)
- **POST** — Beräkna avstånd via Google Maps Distance Matrix API
- Kräver `GOOGLE_MAPS_API_KEY` i env
- Returnerar `distance_km`, `duration_minutes`, `google_maps_url`
- Graceful fallback om API-nyckel saknas (flaggar `manual: true`)

## UI — `/dashboard/vehicles`
- Veckovy med dag-för-dag-rapporter
- Veckonavigation (föregående/nästa/idag)
- Fordonsfilter (dropdown)
- Summering: sträcka, totalt belopp, fakturerbart
- **Ny rapport-modal**: fordon, projekt, datum, typ (körsträcka/timmar/dagar), adresser, Google Maps-beräkning, fakturerbar, anteckning, beloppspreview
- **Hantera fordon-modal**: lista, aktivera/inaktivera, redigera, ta bort
- **Fordonsmodal**: namn, reg.nr, faktureringstyp (km/mil/tim/dag), pris

## Sidebar
- "Fordon" tillagd under Planering-gruppen i `components/Sidebar.tsx`

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build

## Miljövariabel
Lägg till i `.env.local` och Vercel:
```
GOOGLE_MAPS_API_KEY=din-nyckel-här
```
