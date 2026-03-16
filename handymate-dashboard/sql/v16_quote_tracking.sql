-- V16: Live offert-tracking — visningar och nudge-automation
-- Kör manuellt i Supabase SQL Editor

-- 1. Tracking-events per offert
CREATE TABLE IF NOT EXISTS quote_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT,
  duration_seconds INTEGER,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_tracking_quote ON quote_tracking_events(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_tracking_created ON quote_tracking_events(created_at);

ALTER TABLE quote_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service quote_tracking" ON quote_tracking_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "User quote_tracking" ON quote_tracking_events FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);

-- 2. Sammanfattningskolumner på quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_view_seconds INTEGER DEFAULT 0;
