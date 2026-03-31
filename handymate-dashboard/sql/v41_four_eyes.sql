-- V41: Dubbelt godkännande (4-eyes) för offerter och projektstängning
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS four_eyes_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS four_eyes_threshold_sek INTEGER DEFAULT 50000;

NOTIFY pgrst, 'reload schema';
