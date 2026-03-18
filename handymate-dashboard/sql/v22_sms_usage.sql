-- V22: SMS-volymsspårning + kvothantering
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS sms_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  month TEXT NOT NULL,              -- 'YYYY-MM'
  sms_sent INTEGER DEFAULT 0,
  sms_quota INTEGER DEFAULT 50,    -- beror på plan
  extra_sms_sent INTEGER DEFAULT 0,
  extra_sms_cost_sek DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, month)
);

CREATE INDEX IF NOT EXISTS idx_sms_usage_business
  ON sms_usage(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_usage_month
  ON sms_usage(month);

ALTER TABLE sms_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owns sms_usage"
  ON sms_usage FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_config
    WHERE user_id = auth.uid()
  ));

-- Publik insert/update för server-side tracking
CREATE POLICY "Service can manage sms_usage"
  ON sms_usage FOR ALL
  TO service_role
  USING (true);
