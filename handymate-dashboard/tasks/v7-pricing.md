# V7 T2 — Prissättningsintelligens — Progress

## Status: Klar (väntar på SQL-migration)

## Vad som byggts

### SQL: sql/v7_pricing.sql
- [x] `pricing_intelligence` tabell med UNIQUE(business_id, job_type)
- [x] Nya kolumner på `quotes`: job_type, outcome, outcome_at, outcome_reason
- [x] RLS-policies

### lib/agent/pricing-engine.ts
- [x] `updatePricingIntelligence(businessId)` — nattlig aggregering
- [x] `classifyJobTypes()` — Claude Haiku-baserad jobbklassificering
- [x] `getPricingSuggestion(businessId, jobType)` — prisförslag med win rate och trend
- [x] Auto-klassificering av outcome: accepted→won, rejected/expired→lost
- [x] Pristrend: jämför senaste 30% mot äldsta 30%

### Agent-tool: get_pricing_suggestion
- [x] Tool-definition i tool-definitions.ts
- [x] Tool-router case med dynamic import
- [x] Ekonomi-agenten har tillgång till verktyget
- [x] Prompt-instruktioner: "använd INNAN du sätter pris"

### Morgonrapport
- [x] Prisinsikter i SMS: stigande priser + låg vinstfrekvens

### Nattlig cron
- [x] `updatePricingIntelligence()` körs efter `updateBusinessPreferences()`
- [x] Loggas i cron-resultat

## Aktivering

1. Kör `sql/v7_pricing.sql` i Supabase SQL Editor
2. Prisdata fylls automatiskt vid nästa nattliga cron-körning (05:00 UTC)
3. Ekonomi-agenten börjar använda `get_pricing_suggestion` direkt
