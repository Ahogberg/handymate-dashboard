-- V16: Säsongsintelligens — insights + kampanjer
-- Kör manuellt i Supabase SQL Editor

-- 1. Säsongsinsikter per månad per företag
CREATE TABLE IF NOT EXISTS seasonality_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  avg_revenue DECIMAL(10,2) DEFAULT 0,
  avg_job_count INTEGER DEFAULT 0,
  is_slow_month BOOLEAN DEFAULT false,
  is_peak_month BOOLEAN DEFAULT false,
  last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, month)
);

-- 2. Genererade säsongskampanjer (max 1 per månad per företag)
CREATE TABLE IF NOT EXISTS seasonal_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  theme TEXT NOT NULL,
  branch TEXT,
  approval_id TEXT,
  customer_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'generated', -- 'generated' | 'approved' | 'rejected' | 'expired'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, year, month)
);

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_seasonality_insights_biz ON seasonality_insights(business_id);
CREATE INDEX IF NOT EXISTS idx_seasonal_campaigns_biz ON seasonal_campaigns(business_id);

-- 4. RLS
ALTER TABLE seasonality_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service seasonality_insights" ON seasonality_insights FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service seasonal_campaigns" ON seasonal_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "User seasonality_insights" ON seasonality_insights FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User seasonal_campaigns" ON seasonal_campaigns FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
