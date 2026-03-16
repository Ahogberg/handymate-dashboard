-- v14: Lead-källor (lead sources) för leverantörsportaler
-- Kör manuellt i Supabase SQL Editor

-- Lead-källor per företag
CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  portal_code TEXT UNIQUE NOT NULL
    DEFAULT 'ls-' || replace(gen_random_uuid()::text, '-', ''),
  api_key TEXT UNIQUE NOT NULL
    DEFAULT 'HM-' || replace(gen_random_uuid()::text, '-', ''),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Source-tagging på leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_source_id UUID REFERENCES lead_sources(id),
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- Index
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads(lead_source_id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_business ON lead_sources(business_id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_portal_code ON lead_sources(portal_code);

-- RLS
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owns lead sources"
  ON lead_sources FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_config
    WHERE user_id = auth.uid()
  ));

-- Service role behöver full åtkomst (för portal API)
CREATE POLICY "Service role full access on lead_sources"
  ON lead_sources FOR ALL
  USING (true)
  WITH CHECK (true);

-- Ge service_role behörighet att läsa lead_sources utan RLS
ALTER POLICY "Service role full access on lead_sources" ON lead_sources
  TO service_role;
