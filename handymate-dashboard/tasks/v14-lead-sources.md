# V14 — Lead-leverantörsportal (Webolia-flödet)

## Status: Klar (build OK, tsc OK)

## Vad som byggdes

### Del 1 — SQL Migration
- [x] `sql/v14_lead_sources.sql` — `lead_sources` tabell med portal_code, api_key, RLS
- [x] Nya kolumner på `leads`: `lead_source_id`, `source_ref`
- **OBS: Kör manuellt i Supabase SQL Editor innan test!**

### Del 2 — Inställningar → Lead-källor
- [x] `app/dashboard/settings/lead-sources/page.tsx`
- CRUD: skapa, visa, toggla aktiv/inaktiv, ta bort
- Portal-länk med kopiera + "Skicka via mail" (mailto)
- API-nyckel visning (delvis dold, kopierbar)
- Statistik: leads, vunna, konverteringsgrad
- [x] API: `app/api/settings/lead-sources/route.ts` (GET/POST/PUT/DELETE)
- [x] Sidebar-länk under Inställningar → "Lead-källor"

### Del 3 — Extern portal
- [x] `app/lead-portal/[code]/page.tsx` — publik sida, ingen inloggning
- Header med företagslogga + leverantörsnamn
- "Skicka nytt lead"-formulär med alla fält (namn, telefon, e-post, tjänst, beskrivning, adress, värde, datum, referens-nr)
- Leads-lista med statusbadges (Ny, Kontaktad, Kvalificerad, Offert skickad, Vunnen, Ej intresse)
- Statistik-footer (Skickade / Kontaktade / Vunna)
- 30s polling för statusuppdateringar
- [x] API: `app/api/lead-portal/[code]/route.ts` (GET + POST)

### Del 4 — Intake-uppdatering
- [x] `app/api/leads/intake/route.ts` — stöd för `portal_code` + `api_key` från lead_sources
- Fallback till befintlig `website_api_key`-autentisering
- Sätter `lead_source_id` + `source_ref` på skapade leads
- SMS-notis visar källnamn

### Del 5 — Pipeline-badge
- [x] `app/dashboard/pipeline/page.tsx` — "via {source}"-badge på deal-kort
- Visas bara för icke-standard-källor (inte manual/ai/call/website_form etc.)

## Noteringar

- Portal-URL: `/lead-portal/[code]` (inte `/portal/[code]` pga slug-konflikt med befintlig kundportal)
- Befintlig `lead_source` (singular) tabell/API rördes inte — ny `lead_sources` (plural) tabell
- Realtid i portalen: polling var 30s (ingen Supabase auth på publik sida)

## Verifiering
- `npx tsc --noEmit` — 0 fel
- `npx next build` — ren build
