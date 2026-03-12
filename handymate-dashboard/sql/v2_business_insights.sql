-- ============================================================
-- V2: Business Insights — Predictive intelligence
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS business_insights (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,
  -- Types: 'revenue_forecast','churn_risk','upsell_opportunity','seasonal_tip',
  --        'booking_gap','follow_up','workload_warning'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',  -- 'low', 'medium', 'high'
  data JSONB DEFAULT '{}',
  feedback TEXT,  -- 'helpful', 'not_helpful'
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_business_insights_business ON business_insights(business_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_insights_active ON business_insights(business_id, expires_at) WHERE feedback IS NULL;

ALTER TABLE business_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_insights_policy ON business_insights;
CREATE POLICY business_insights_policy ON business_insights FOR ALL USING (true) WITH CHECK (true);
