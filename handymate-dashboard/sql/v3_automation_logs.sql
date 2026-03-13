-- ============================================================
-- V3: Automation Engine — Aktivitetslogg
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS v3_automation_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  rule_id TEXT,
  rule_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  -- 'success' | 'pending_approval' | 'rejected' | 'skipped' | 'failed'
  context JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  error_message TEXT,
  approval_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v3_automation_logs_business ON v3_automation_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v3_automation_logs_rule ON v3_automation_logs(rule_id, created_at DESC);

ALTER TABLE v3_automation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v3_automation_logs_policy ON v3_automation_logs;
CREATE POLICY v3_automation_logs_policy ON v3_automation_logs FOR ALL USING (true) WITH CHECK (true);
