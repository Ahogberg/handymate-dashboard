-- V18: Morgonrapport — SMS-flagga i automation_settings
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE v3_automation_settings
  ADD COLUMN IF NOT EXISTS morning_report_sms_enabled BOOLEAN DEFAULT false;

-- PostgREST schema reload (kör om pending_approvals saknas i cache)
NOTIFY pgrst, 'reload schema';
