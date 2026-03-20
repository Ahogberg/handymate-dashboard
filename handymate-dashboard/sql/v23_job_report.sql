-- V23: Jobbrapport-automation toggle
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE v3_automation_settings
  ADD COLUMN IF NOT EXISTS job_report_enabled BOOLEAN DEFAULT true;
