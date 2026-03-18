-- V19: Handymate Leads — Outbound-modulen
-- Kör manuellt i Supabase SQL Editor

-- 1. Outbound-leads per företag
CREATE TABLE IF NOT EXISTS leads_outbound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  property_address TEXT NOT NULL,
  property_type TEXT,
  built_year INTEGER,
  energy_class TEXT,
  purchase_date DATE,
  owner_name TEXT,
  letter_content TEXT,
  letter_edited BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','sent','delivered')),
  sent_at TIMESTAMPTZ,
  cost_sek NUMERIC(10,2),
  postnord_tracking_id TEXT,
  converted BOOLEAN DEFAULT false,
  batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Månatlig användning / kvota
CREATE TABLE IF NOT EXISTS leads_monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  month TEXT NOT NULL,
  letters_sent INTEGER DEFAULT 0,
  letters_quota INTEGER DEFAULT 20,
  extra_letters INTEGER DEFAULT 0,
  extra_cost_sek NUMERIC(10,2) DEFAULT 0,
  UNIQUE(business_id, month)
);

-- 3. Kolumner på business_config
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS leads_addon BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS leads_addon_tier TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_leads_outbound_business ON leads_outbound(business_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_outbound_batch ON leads_outbound(business_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_leads_monthly_business ON leads_monthly_usage(business_id, month);

-- 5. RLS
ALTER TABLE leads_outbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_monthly_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service leads_outbound" ON leads_outbound FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service leads_monthly_usage" ON leads_monthly_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "User leads_outbound" ON leads_outbound FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User leads_monthly_usage" ON leads_monthly_usage FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
