# Pipeline V2 — Självgående säljtratt

## SQL-filer (kör i Supabase SQL Editor i denna ordning)

1. `sql/v4_pipeline_stages.sql` — Skapar `pipeline_stages`-tabell + lägger till `pipeline_stage_key` på `leads`
2. `sql/v4_seed_pipeline_stages.sql` — Seedar 8 systemsteg per företag + migrerar befintliga leads
3. `sql/v4_seed_pipeline_rules.sql` — Seedar 8+1 automationsregler per företag (kräver att `v3_automation_rules` finns)

## Implementerade ändringar

### Steg 1: Databas
- `sql/v4_pipeline_stages.sql` — NY tabell `pipeline_stages` med RLS
- `sql/v4_seed_pipeline_stages.sql` — Seed-funktion + migrering
- `lib/pipeline-stages.ts` — Helper-lib: `getLeadPipelineStages()`, `getLeadStageByKey()`, `moveLeadToStage()`

### Steg 2: Event hooks
- `app/api/quotes/send/route.ts` — `fireEvent('quote_sent', ...)`
- `app/api/sms/send/route.ts` — `fireEvent('contacted', ...)`
- Fixat: `await fireEvent()` i tool-router, invoices/route, fortnox/sync/payments

### Steg 3: Automation engine
- `lib/automation-engine.ts` — `handleUpdateStatus()` stödjer `stage_key` i action_config
- Bakåtskydd: automation kan inte flytta lead bakåt i sort_order (utom till 'lost')

### Steg 4: Automationsregler
- `sql/v4_seed_pipeline_rules.sql` — 8 pipeline-regler + 1 push-notis (quote_opened)

### Steg 5: Agent system prompt
- `app/api/agent/trigger/system-prompt.ts` — Injicerar pipeline_stage_key + label
- `app/api/agent/trigger/route.ts` — Hämtar pipeline-kontext per lead

### Steg 6: Kanban + UI
- `app/api/leads/pipeline-stages/route.ts` — NY API: GET stages, PATCH label
- `app/api/leads/route.ts` — Stödjer `pipeline_stage_key` i PATCH + stats
- `app/dashboard/agent/page.tsx` — Dynamiska kolumner från pipeline_stages-tabellen

## Noteringar
- `lib/pipeline.ts` (deals) och `lib/pipeline-stages.ts` (leads) är separata system
- Hardkodade strängar i deals-pipeline (settings, analytics, seed-defaults) lämnas orörda
