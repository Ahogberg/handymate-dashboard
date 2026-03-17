-- V17: GPS Check-in + Attestering
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS time_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  project_id TEXT,
  project_name TEXT,
  checked_in_at TIMESTAMPTZ NOT NULL,
  checked_out_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  lat_in DECIMAL(10, 7),
  lng_in DECIMAL(10, 7),
  lat_out DECIMAL(10, 7),
  lng_out DECIMAL(10, 7),
  address_in TEXT,
  status TEXT DEFAULT 'active',
  -- 'active' | 'completed' | 'approved' | 'rejected'
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_business ON time_checkins(business_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON time_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_status ON time_checkins(status);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON time_checkins(checked_in_at);

ALTER TABLE time_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service time_checkins" ON time_checkins FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "User time_checkins" ON time_checkins FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
