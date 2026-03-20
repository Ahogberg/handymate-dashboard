-- V23: Toggle för bekräftelsemail vid signerad offert
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE v3_automation_settings
  ADD COLUMN IF NOT EXISTS quote_signed_email_enabled BOOLEAN DEFAULT true;
