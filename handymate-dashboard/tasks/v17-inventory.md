# V17 — Lagerhantering — Servicebil-lager

## Status: Klar (build OK, tsc OK)

## Vad som byggdes

### Nya filer
- [x] `sql/v17_inventory.sql` — 3 tabeller: inventory_locations, inventory_items, inventory_movements + RLS + from_inventory på project_material
- [x] `app/api/inventory/locations/route.ts` — GET/POST lagerplatser
- [x] `app/api/inventory/items/route.ts` — GET/POST artiklar
- [x] `app/api/inventory/items/[id]/route.ts` — PUT/DELETE enskild artikel
- [x] `app/api/inventory/movements/route.ts` — GET/POST rörelser (påfyllning, inventering)
- [x] `app/api/inventory/movements/withdraw/route.ts` — POST uttag med projektkoppling + lågt-lager-alert
- [x] `app/dashboard/settings/inventory/page.tsx` — Lagerplatser + artikelhantering med modaler
- [x] `app/dashboard/planning/inventory/page.tsx` — Daglig lagervy med progress bars, uttag + påfyllning

### Ändrade filer
- [x] `components/Sidebar.tsx` — "Lager" under Planering + "Lager & Material" pekar på /dashboard/settings/inventory
- [x] `app/dashboard/approvals/page.tsx` — `low_stock_alert` typ i TYPE_CONFIG

## Funktioner
- **Lagerplatser**: Servicebilen, Förrådet etc. med ikon-logik (bil/hus)
- **Artiklar**: Namn, enhet, inköps/försäljningspris, min-stock varning
- **Uttag**: Multi-artikel modal med projektkoppling → skapar project_material poster
- **Påfyllning**: Snabb-modal från lågstock-kort
- **Lågstock-alert**: Automatisk pending_approval vid uttag under min_stock
- **Progress bars**: Visuell saldoindikator per artikel
- **Sök + platsfilter**: Snabb navigering i lagerlistan

## Verifiering
- `npx tsc --noEmit` — 0 fel
- `npx next build` — ren build
- **Kör sql/v17_inventory.sql i Supabase innan test!**
