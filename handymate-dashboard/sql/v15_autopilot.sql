-- v15: Zero-Touch Deal-to-Delivery — Autopilot
-- Kör manuellt i Supabase SQL Editor

-- Säkerställ att pending_approvals finns (om v2 aldrig körts)
CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  agent_run_id TEXT,
  approval_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  risk_level TEXT DEFAULT 'high',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

ALTER TABLE pending_approvals ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'high';
CREATE INDEX IF NOT EXISTS idx_pending_approvals_business ON pending_approvals(business_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires ON pending_approvals(expires_at) WHERE status = 'pending';
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pending_approvals_policy ON pending_approvals;
CREATE POLICY pending_approvals_policy ON pending_approvals FOR ALL USING (true) WITH CHECK (true);

-- Autopilot-inställningar per företag
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS autopilot_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS autopilot_auto_book BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS autopilot_auto_sms BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS autopilot_auto_materials BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS autopilot_booking_buffer_days INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS autopilot_default_duration_hours INTEGER DEFAULT 4;

-- Paket-stöd i approvals
ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS package_id TEXT,
  ADD COLUMN IF NOT EXISTS package_type TEXT,
  ADD COLUMN IF NOT EXISTS package_data JSONB;

CREATE INDEX IF NOT EXISTS idx_pending_approvals_package
  ON pending_approvals(package_id) WHERE package_id IS NOT NULL;
