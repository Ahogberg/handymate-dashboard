-- ============================================================
-- V3: Automation Engine — Regler
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS v3_automation_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,

  -- Trigger
  trigger_type TEXT NOT NULL,
  -- 'cron' | 'event' | 'threshold' | 'manual'
  trigger_config JSONB NOT NULL DEFAULT '{}',
  -- cron: { "schedule": "0 7 * * mon-fri" }
  -- event: { "event_name": "lead_created" }
  -- threshold: { "entity": "invoice", "field": "days_overdue", "operator": ">=", "value": 7 }

  -- Action
  action_type TEXT NOT NULL,
  -- 'send_sms' | 'send_email' | 'create_approval' | 'update_status'
  -- 'generate_quote' | 'reject_lead' | 'run_agent' | 'notify_owner'
  -- 'create_booking' | 'schedule_followup'
  action_config JSONB NOT NULL DEFAULT '{}',

  -- Styrning
  requires_approval BOOLEAN DEFAULT false,
  respects_work_hours BOOLEAN DEFAULT true,
  respects_night_mode BOOLEAN DEFAULT true,

  -- Statistik
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v3_automation_rules_business ON v3_automation_rules(business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_v3_automation_rules_trigger ON v3_automation_rules(business_id, trigger_type) WHERE is_active = true;

ALTER TABLE v3_automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v3_automation_rules_policy ON v3_automation_rules;
CREATE POLICY v3_automation_rules_policy ON v3_automation_rules FOR ALL USING (true) WITH CHECK (true);
