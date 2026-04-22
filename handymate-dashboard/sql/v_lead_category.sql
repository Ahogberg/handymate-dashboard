-- Lead-kategori — default per källa + per lead
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE lead_sources
  ADD COLUMN IF NOT EXISTS default_category TEXT;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_category
  ON leads(business_id, category) WHERE category IS NOT NULL;
