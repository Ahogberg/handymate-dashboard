-- V37: Golden Path — koppla lead ↔ deal ↔ quote
-- Kör manuellt i Supabase SQL Editor

-- 1. lead_id på quotes (spåra vilken lead en offert tillhör)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lead_id TEXT;
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id) WHERE lead_id IS NOT NULL;

-- 2. lead_id på deal (koppla deal till sitt ursprungslead)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_id TEXT;
CREATE INDEX IF NOT EXISTS idx_deal_lead ON deal(lead_id) WHERE lead_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
