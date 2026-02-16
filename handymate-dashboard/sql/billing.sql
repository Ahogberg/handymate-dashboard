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
  ('starter', 'Starter', 1995,
   '{"sms_per_month": 200, "call_minutes_per_month": 75, "ai_requests_per_month": 100, "team_members": 1, "storage_gb": 2}',
   '["AI-offertgenerering", "SMS & samtal", "Kundregister", "Tidrapportering", "Fakturering"]',
   1),
  ('professional', 'Professional', 4995,
   '{"sms_per_month": 600, "call_minutes_per_month": 250, "ai_requests_per_month": 500, "team_members": 5, "storage_gb": 10}',
   '["Allt i Starter", "Pipeline/CRM", "Automatiseringar", "Google Calendar-sync", "Fortnox-integration", "Kundportal"]',
   2),
  ('business', 'Business', 9995,
   '{"sms_per_month": 2000, "call_minutes_per_month": 800, "ai_requests_per_month": 2000, "team_members": 20, "storage_gb": 50}',
   '["Allt i Professional", "Obegränsade team-medlemmar", "Prioriterad support", "Anpassade automatiseringar", "API-åtkomst"]',
   3)
ON CONFLICT (plan_id) DO NOTHING;
