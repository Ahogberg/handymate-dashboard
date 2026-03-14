# V11 T4 — Leverantörsfaktura kopplad till projekt

## Status: ✅ Klart

## SQL Migration
- [sql/v11_supplier_invoices.sql](../sql/v11_supplier_invoices.sql) — `supplier_invoices` tabell
- Alla FK:er använder TEXT (matchar befintlig DB-konvention)
- `supplier_invoices.business_id` → `business_config(business_id)`
- `supplier_invoices.project_id` → `project(project_id)`
- Belopp: NUMERIC(12,2) — matchar befintlig konvention
- Index på `project_id` och `(business_id, status)`
- RLS aktiverat med öppna policies
- **Kör manuellt i Supabase SQL Editor**

## API-route

### `/api/supplier-invoices` (route.ts)
- **GET** — Lista leverantörsfakturor (filtrering: `project_id`)
- **POST** — Skapa faktura (auto-beräknat totalt = exkl. moms + moms)
- **PATCH** — Uppdatera faktura (auto-sätter `paid_at` vid status='paid')
- **DELETE** — Ta bort faktura

## UI — Flik "Leverantörer" i projektvyn

### Sammanfattning (4 kort)
- Totalt inköp, Påslag (genomsnitt %), Debiterbart, Ej betalt

### Fakturalista
- Kort per faktura: leverantör, fakturanr, belopp, status-badge
- Detaljer: datum, förfall, påslag → kundpris
- Knappar: Markera betald, Redigera, Ta bort

### SupplierInvoiceModal
- Leverantör, fakturanr, datum/förfall
- Belopp exkl. moms + moms → beräknat totalt (live)
- Påslag % → beräknat kundpris (live)
- Checkboxar: debiterbar till kund, visa i kundportalen
- Anteckning

## Ekonomi-flik
- Leverantörsfakturor visas som extra kostnadsrad under "Kostnader" i projektekonomi-översikten

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build
