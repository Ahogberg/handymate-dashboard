-- V14: Partner portal improvements — webhook, API-nyckel, events-tabell
-- Kör manuellt i Supabase SQL Editor

-- 1. Utöka partners-tabellen med webhook + API-nyckel
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT
    DEFAULT 'whsec-' || replace(gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE
    DEFAULT 'PARTNER-' || replace(gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS total_referred INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_converted INTEGER DEFAULT 0;

-- 2. Referral-events för historik och tidslinje
CREATE TABLE IF NOT EXISTS partner_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
  business_id UUID,
  event_type TEXT NOT NULL,
  -- 'referral_clicked', 'trial_started', 'converted',
  -- 'plan_upgraded', 'provision_earned', 'provision_paid', 'churned'
  amount_sek INTEGER,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_events_partner
  ON partner_events(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_events_type
  ON partner_events(event_type);

-- RLS
ALTER TABLE partner_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_events_policy ON partner_events;
CREATE POLICY partner_events_policy ON partner_events FOR ALL USING (true) WITH CHECK (true);

-- 3. Webhook event preferences (kolumn på partners)
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS webhook_events JSONB DEFAULT '["trial_started","converted","plan_upgraded","churned"]'::jsonb;
