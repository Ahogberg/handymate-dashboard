-- ============================================================
-- V2: Pending Approvals — In-app agent approval flow
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  agent_run_id TEXT,
  approval_type TEXT NOT NULL,  -- 'send_quote', 'send_sms', 'create_booking', 'send_invoice', etc.
  title TEXT NOT NULL,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'expired', 'auto_approved'
  risk_level TEXT DEFAULT 'high',  -- 'low', 'medium', 'high'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

-- Add risk_level if table already exists (idempotent)
ALTER TABLE pending_approvals ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'high';

CREATE INDEX IF NOT EXISTS idx_pending_approvals_business ON pending_approvals(business_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires ON pending_approvals(expires_at) WHERE status = 'pending';

ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pending_approvals_policy ON pending_approvals;
CREATE POLICY pending_approvals_policy ON pending_approvals FOR ALL USING (true) WITH CHECK (true);
