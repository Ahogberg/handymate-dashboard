-- ============================================================
-- V2: Business Preferences — Agent learning store
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS business_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT DEFAULT 'agent',  -- 'agent', 'user', 'onboarding'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, key)
);

CREATE INDEX IF NOT EXISTS idx_business_preferences_business ON business_preferences(business_id);

ALTER TABLE business_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_preferences_policy ON business_preferences;
CREATE POLICY business_preferences_policy ON business_preferences FOR ALL USING (true) WITH CHECK (true);
