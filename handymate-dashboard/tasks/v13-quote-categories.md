# V13: Produktkategorier för offertrader

## Status: KLAR

## Vad som byggts

### Databas
- [x] `sql/v13_quote_categories.sql` — Migration med `quote_categories` (12 systemkategorier), `custom_quote_categories` (per företag), och `category_slug` kolumn på `quote_items`

### Typer & logik
- [x] `lib/constants/categories.ts` — SYSTEM_CATEGORIES, getCategoryLabel, getCategoryRotRut, getAllCategories
- [x] `lib/types/quote.ts` — `category_slug?: string` tillagd i QuoteItem
- [x] `lib/quote-calculations.ts` — `category_slug: undefined` i createDefaultItem

### Offerteditor (ny offert)
- [x] Kategori-dropdown per rad med optgroup (Arbete/Material/Övrigt)
- [x] Smart auto-detection: välj kategori → ROT/RUT sätts automatiskt
- [x] Inline-skapande av egna kategorier via "+ Ny kategori"
- [x] Custom categories laddas från DB vid mount
- [x] Desktop: 6-kolumns grid (Beskrivning, Kategori, Antal, Enhet, Pris/enhet, ×)
- [x] Mobil: Kategori + Avdrag dropdown på samma rad

### Offerteditor (redigera offert)
- [x] Samma kategori-dropdown i edit-vyn
- [x] Auto-detection och custom categories

### Offertförhandsvisning (QuotePreview)
- [x] Valfri kategori-gruppering med delsummor per kategori
- [x] Toggle "Visa delsummor per kategori" i visningsinställningar
- [x] showCategorySubtotals + customCategories props

### API
- [x] `app/api/quote-categories/route.ts` — CRUD (GET, POST, PUT, DELETE)
- [x] `app/api/quotes/route.ts` — category_slug sparas vid POST/PUT

### Inställnings-UI
- [x] `app/dashboard/settings/quote-categories/page.tsx`
- [x] Visa systemkategorier (read-only)
- [x] Skapa/redigera/ta bort egna kategorier med ROT/RUT-flaggor
- [x] Länk från inställningssidan

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build (ENOSPC-problem var diskutrymme, ej kod)
