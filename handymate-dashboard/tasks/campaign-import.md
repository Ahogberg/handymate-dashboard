# CSV Import → Kampanj-flöde

## Status: Klar ✅

## Vad som byggdes

### 1. Förbättrad CSV-import med dubbletthantering
**Fil:** `app/dashboard/customers/import/page.tsx`

- Dubblettdetektering i Steg 3 (förhandsgranskning): batch-query mot `customer`-tabellen via telefonnummer
- Toggle-knappar: "Uppdatera befintliga" / "Hoppa över dubletter"
- Visar antal dubletter tydligt i gränssnittet
- `handleImport()` spårar importerade kund-ID:n i `importedIds`

### 2. Kampanj-CTA efter import
**Fil:** `app/dashboard/customers/import/page.tsx` (Steg 4)

- Prominent knapp: "Skicka reaktiverings-SMS till dessa X kunder"
- Sparar importerade kund-ID:n i `sessionStorage`
- Navigerar till `/dashboard/campaigns/new?source=import`

### 3. "Importerade kunder"-segment i kampanjguiden
**Fil:** `app/dashboard/campaigns/new/page.tsx`

- Ny `FilterType`: `'imported'`
- 5:e filterkort "Importerade kunder" (visas bara om det finns importerade kunder)
- Läser `?source=import` URL-param + `sessionStorage` vid mount
- Pre-fill vid import-flöde:
  - Kampanjnamn: "Reaktivering [datum]"
  - Syfte: "reactivation"
  - Meddelande: reaktiveringstext med företagsnamn
  - Filter: "imported" (visar bara importerade kunder)
- `Suspense`-boundary för `useSearchParams()`

## Verifiering

- `npx tsc --noEmit` — 0 fel ✅
- `npx next build` — ren build ✅
