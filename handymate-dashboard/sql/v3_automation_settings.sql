-- ============================================================
-- V3: Automation Engine — Globala inställningar
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS v3_automation_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL UNIQUE,

  -- Arbetstider
  work_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  work_start TIME DEFAULT '07:00',
  work_end TIME DEFAULT '17:00',

  -- Nattspärr
  night_mode_enabled BOOLEAN DEFAULT true,
  night_queue_messages BOOLEAN DEFAULT true,

  -- Jobbregler
  min_job_value_sek INTEGER DEFAULT 0,
  max_distance_km INTEGER,
  auto_reject_below_minimum BOOLEAN DEFAULT false,

  -- Godkännandekrav (globalt)
  require_approval_send_quote BOOLEAN DEFAULT true,
  require_approval_send_invoice BOOLEAN DEFAULT true,
  require_approval_send_sms BOOLEAN DEFAULT false,
  require_approval_create_booking BOOLEAN DEFAULT false,

  -- Responstider
  lead_response_target_minutes INTEGER DEFAULT 30,
  quote_followup_days INTEGER DEFAULT 5,
  invoice_reminder_days INTEGER DEFAULT 7,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE v3_automation_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v3_automation_settings_policy ON v3_automation_settings;
CREATE POLICY v3_automation_settings_policy ON v3_automation_settings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Skapa default-rad för alla befintliga företag
-- ============================================================
INSERT INTO v3_automation_settings (business_id)
SELECT business_id FROM business_config
ON CONFLICT (business_id) DO NOTHING;
