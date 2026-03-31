-- V41: Nummerstrategi i onboarding
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS number_strategy TEXT DEFAULT 'new';

NOTIFY pgrst, 'reload schema';
