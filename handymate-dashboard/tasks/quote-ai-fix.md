# Quote AI Fix — Injicera prislista och standardrader

## Problem
Offert-AI:n gissade priser eftersom den inte hade tillgång till hantverkarens faktiska prislista. Resultatet varierade varje körning.

## Lösning
Injicera hantverkarens prislista, standardrader och preferenser i varje offert-generering. Agenten får aldrig gissa pris — den använder prislistan eller markerar priset som saknat.

## Ändrade filer

### lib/ai-quote-generator.ts
- [x] Ny `buildPriceContext()` helper — bygger strukturerad prisliste-kontext grupperad per kategori
- [x] Ny `PriceListItem`, `QuoteTemplate` interfaces
- [x] `GeneratedQuoteItem` utökad med `note?: string` och `fromPriceList?: boolean`
- [x] `GeneratedQuote` utökad med `priceListEmpty: boolean` och `missingPriceCount: number`
- [x] `generateQuoteFromInput()` — helt omskriven system-prompt med strikta prisregler:
  - Använd ENBART priser från prislistan
  - Saknade priser → `unit_price: 0` + `note: "PRIS SAKNAS — fyll i manuellt"`
  - Gissa ALDRIG ett pris
  - Max 8 rader
- [x] Stöd för `templates` i input (offertmallar som referens)

### app/api/quotes/generate/route.ts
- [x] Importerar `buildPriceContext` från lib
- [x] System-prompt omskriven med samma strikta prisregler
- [x] Returnerar `priceListEmpty` och `missingPriceCount` i response

### app/api/quotes/ai-generate/route.ts
- [x] Hämtar `quote_templates` parallellt med `price_list`
- [x] Skickar templates till `generateQuoteFromInput()`
- [x] Returnerar `priceWarning` objekt med:
  - `warning: true`
  - `message` (beskriver vad som saknas)
  - `link` till `/dashboard/settings/pricing`

### lib/agent/agents/shared.ts
- [x] `BusinessContext` utökad med `priceList` fält
- [x] `fetchBusinessContext()` hämtar `price_list` från Supabase

### lib/agent/agents/ekonomi-agent.ts
- [x] `buildEkonomiPrompt()` injicerar fullständig prislista grupperad per kategori
- [x] Strikta regler: använd prislistan exakt, 0 kr om pris saknas
- [x] Om tom prislista: tydlig markering att alla materialpriser ska vara 0

### app/dashboard/quotes/[id]/edit/page.tsx (bonus-fix)
- [x] Fixade pre-existerande `RotRutType` type error som blockerade build

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build

## Testscenarier
1. **Med prislista ifylld:** "badrumsrenovering 10 kvm" → rader matchar prislistan exakt
2. **Utan prislista:** Varningsruta med länk till Inställningar → Prislista, offert genereras med "PRIS SAKNAS"-markeringar
3. **Delvis prislista:** Kända priser fylls i korrekt, okända rader markeras med 0 kr och varning
