-- Billing tables for Stripe integration
-- Hanterar prenumerationer, användningsspårning och fakturahändelser

-- Plan definitions (seed data)
CREATE TABLE IF NOT EXISTS billing_plan (
  plan_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_sek INTEGER NOT NULL,
  stripe_price_id TEXT,
  limits JSONB NOT NULL DEFAULT '{}',
  features JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER DEFAULT 0
);

-- Business subscription tracking
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS billing_plan TEXT DEFAULT 'starter';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'trialing';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ;

-- Usage tracking per billing period
CREATE TABLE IF NOT EXISTS usage_record (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  sms_count INTEGER DEFAULT 0,
  call_minutes INTEGER DEFAULT 0,
  ai_requests INTEGER DEFAULT 0,
  storage_mb INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_record_business ON usage_record(business_id);
CREATE INDEX IF NOT EXISTS idx_usage_record_period ON usage_record(business_id, period_start);

-- Billing events log
CREATE TABLE IF NOT EXISTS billing_event (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_event_business ON billing_event(business_id);

-- Seed plans
INSERT INTO billing_plan (plan_id, name, price_sek, limits, features, sort_order)
VALUES
  ('starter', 'Starter', 2495,
   '{"sms_per_month": 200, "call_minutes_per_month": 100, "ai_requests_per_month": 500, "team_members": 1, "storage_gb": 5}',
   '["AI-telefonassistent", "Offerter & fakturor", "Kundhantering", "Pipeline", "Tidrapportering", "Google Calendar-sync"]',
   1),
  ('professional', 'Professional', 5995,
   '{"sms_per_month": 600, "call_minutes_per_month": 400, "ai_requests_per_month": 2000, "team_members": 5, "storage_gb": 25}',
   '["Allt i Starter", "Uppfoljningssekvenser", "Lead-generering", "AI auto-pilot", "Google Reviews", "Fortnox", "CSV-export"]',
   2),
  ('business', 'Business', 11995,
   '{"sms_per_month": 2000, "call_minutes_per_month": 999999, "ai_requests_per_month": 10000, "team_members": 999, "storage_gb": 100}',
   '["Allt i Professional", "Obegransade samtal", "Obegransade anvandare", "Anpassad AI-rost", "Dedikerad support"]',
   3)
ON CONFLICT (plan_id) DO NOTHING;
