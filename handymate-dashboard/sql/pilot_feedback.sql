-- Pilot feedback table
CREATE TABLE IF NOT EXISTS pilot_feedback (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  business_name TEXT,
  type TEXT DEFAULT 'general',
  message TEXT NOT NULL,
  page TEXT,
  rating INTEGER,
  status TEXT DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pilot_feedback_business ON pilot_feedback(business_id);
CREATE INDEX IF NOT EXISTS idx_pilot_feedback_status ON pilot_feedback(status);
