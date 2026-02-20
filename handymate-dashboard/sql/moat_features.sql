-- Moat Features: Google Reviews + Lead Sources
-- Run in Supabase SQL Editor

-- Google Reviews settings on business_config
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS google_review_url TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS review_request_enabled BOOLEAN DEFAULT true;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS review_request_delay_days INTEGER DEFAULT 3;

-- Lead sources - platform integrations for automatic lead import
CREATE TABLE IF NOT EXISTS lead_source (
  id TEXT PRIMARY KEY DEFAULT 'lsrc_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'offerta', 'servicefinder', 'byggahus', 'email', 'website', 'manual'
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  inbound_email TEXT, -- unique email for this source
  leads_imported INTEGER DEFAULT 0,
  last_import_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_source_business ON lead_source(business_id);
CREATE INDEX IF NOT EXISTS idx_lead_source_email ON lead_source(inbound_email);

-- Extend deal table for lead source tracking
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_source_id TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_source_platform TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS external_lead_id TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_score INTEGER;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_temperature TEXT CHECK (lead_temperature IN ('hot', 'warm', 'cold'));

-- Review request tracking
CREATE TABLE IF NOT EXISTS review_request (
  id TEXT PRIMARY KEY DEFAULT 'rr_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  deal_id TEXT,
  sent_via TEXT NOT NULL, -- 'sms', 'email', 'both'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  clicked_at TIMESTAMPTZ,
  review_received BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_review_request_business ON review_request(business_id);
CREATE INDEX IF NOT EXISTS idx_review_request_customer ON review_request(customer_id);

-- RLS
ALTER TABLE lead_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_request ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lead_source_policy' AND tablename = 'lead_source') THEN
    CREATE POLICY lead_source_policy ON lead_source
      FOR ALL USING (business_id IN (
        SELECT business_id FROM business_config WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'review_request_policy' AND tablename = 'review_request') THEN
    CREATE POLICY review_request_policy ON review_request
      FOR ALL USING (business_id IN (
        SELECT business_id FROM business_config WHERE user_id = auth.uid()
      ));
  END IF;
END $$;
