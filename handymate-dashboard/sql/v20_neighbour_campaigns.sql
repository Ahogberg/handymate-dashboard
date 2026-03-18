-- V20: Granneffekten — neighbour campaigns
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS leads_neighbour_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  job_id TEXT,                        -- project_id eller booking_id
  job_type TEXT,                      -- "Badrum", "El", "VVS", etc.
  source_address TEXT NOT NULL,       -- adressen där jobbet utfördes
  neighbour_addresses JSONB DEFAULT '[]'::jsonb,
  neighbour_count INTEGER DEFAULT 0,
  letter_content TEXT,
  letter_edited BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft',        -- 'draft' | 'approved' | 'sent'
  sent_at TIMESTAMPTZ,
  cost_sek DECIMAL(10,2) DEFAULT 0,
  quota_used INTEGER DEFAULT 0,
  extra_cost_sek DECIMAL(10,2) DEFAULT 0,
  converted_count INTEGER DEFAULT 0,
  revenue_generated DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_neighbour_campaigns_biz ON leads_neighbour_campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_neighbour_campaigns_status ON leads_neighbour_campaigns(status);

ALTER TABLE leads_neighbour_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service neighbour_campaigns" ON leads_neighbour_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "User neighbour_campaigns" ON leads_neighbour_campaigns FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
