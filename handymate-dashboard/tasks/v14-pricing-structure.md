# V14 — Prisstruktur: Segment, Avtalsformer, Prislistor

## Status: ✅ Klar

## Vad som byggts

### Del 1 — SQL Migration (`sql/v14_pricing_structure.sql`)
- `customer_segments` — kundtyper (Privatperson, BRF, Fastighetsbolag, etc.)
- `contract_types` — avtalsformer (Fast pris, Löpande, Ramavtal, Försäkring)
- `price_lists_v2` — prislistor med timpriser (normal/OB1/OB2/jour), materialpåslag, startavgift
- `price_list_items_v2` — specifika rader per prislista (namn, enhet, pris, ROT/RUT)
- Segment/avtalsform/prislista-kolumner tillagda på `customer`-tabellen
- Index + RLS (service_role + auth.uid()-baserade policies)
- Tabeller namngivna `_v2` för att inte krocka med befintlig `price_list`

### Del 2+3 — Inställningar → Prisstruktur (`app/dashboard/settings/pricing/page.tsx`)
- Tre flikar: **Kundtyper**, **Avtalsformer**, **Prislistor**
- **Kundtyper**: Lista med färgprickar, lägg till/redigera/ta bort, standardmarkering
- **Avtalsformer**: Lista med typ (fast/löpande/ramavtal/försäkring), CRUD
- **Prislistor**: Kort-vy med segment/avtalsform-koppling, timpriser, materialpåslag
- Kopiera prislista-funktion (inkl. rader)
- **Prisliste-editor (modal)**:
  - Namn, segment-koppling, avtalsform-koppling
  - Timpriser: normal, OB1, OB2, jour
  - Materialpåslag %
  - Startavgift kr
  - Specifika rader: namn, enhet, pris, ROT-checkbox

### Del 4 — Kund → Segment + Avtalsform + Prislista
- Customer modal utökad med 3 nya dropdowns (efter befintliga fält)
- Auto-föreslår prislista baserat på valt segment
- Sparas via `/api/actions` (create_customer + update_customer)
- Visas vid redigering av befintlig kund

### Del 5 — Offert → Auto-fyll prislista
- Info-banner visas under kundval: "📋 Prislista: BRF-priser · BRF · Ramavtal"
- Hämtar prisliste-data från API när kund med `price_list_id` väljs

### Del 6 — AI-offert vet vilken prislista som gäller
- `CustomerPriceList` interface tillagt i `lib/ai-quote-generator.ts`
- `buildPriceContext()` injicerar kundens prislista med alla timpriser, materialpåslag, specifika rader
- AI:n får explicit instruktion: "Använd ALLTID dessa priser"
- `approve-actions.ts` hämtar kundens prislista från DB och skickar till AI

### Del 7 — API Routes
- `GET/POST /api/pricing/segments` — lista/skapa segment
- `PUT/DELETE /api/pricing/segments/[id]` — uppdatera/ta bort
- `GET/POST /api/pricing/contract-types` — lista/skapa avtalsformer
- `PUT/DELETE /api/pricing/contract-types/[id]` — uppdatera/ta bort
- `GET/POST /api/pricing/price-lists` — lista/skapa prislistor (med segment/contract_type joins)
- `GET/PUT/DELETE /api/pricing/price-lists/[id]` — hämta/uppdatera/ta bort
- `POST/PUT /api/pricing/price-lists/[id]/items` — hantera rader (bulk update)
- Alla routes använder `getAuthenticatedBusiness()`

### Del 8 — Sidebar-länk
- "Prisstruktur" tillagd under Inställningar i `components/Sidebar.tsx`

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build

## Filer
- `sql/v14_pricing_structure.sql` (ny)
- `app/dashboard/settings/pricing/page.tsx` (ny)
- `app/api/pricing/segments/route.ts` (ny)
- `app/api/pricing/segments/[id]/route.ts` (ny)
- `app/api/pricing/contract-types/route.ts` (ny)
- `app/api/pricing/contract-types/[id]/route.ts` (ny)
- `app/api/pricing/price-lists/route.ts` (ny)
- `app/api/pricing/price-lists/[id]/route.ts` (ny)
- `app/api/pricing/price-lists/[id]/items/route.ts` (ny)
- `app/dashboard/customers/page.tsx` (ändrad — pricing fields i modal)
- `app/api/actions/route.ts` (ändrad — segment/contract/pricelist i CRUD)
- `app/dashboard/quotes/new/page.tsx` (ändrad — price list info banner)
- `lib/ai-quote-generator.ts` (ändrad — CustomerPriceList support)
- `lib/approve-actions.ts` (ändrad — hämtar kundens prislista)
- `components/Sidebar.tsx` (ändrad — Prisstruktur-länk)
