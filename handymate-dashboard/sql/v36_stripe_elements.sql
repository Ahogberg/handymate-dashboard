-- V36: Stripe Elements + onboarding-steg
-- Kör manuellt i Supabase SQL Editor

-- Pilot-flagga
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS is_pilot BOOLEAN DEFAULT false;

-- Sätt pilot-status på befintliga kunder
UPDATE business_config SET is_pilot = true
WHERE business_id IN ('biz_6wunctak49', 'elexperten_sthlm', 'biz_al7pjuu5smi');

-- Default subscription status
ALTER TABLE business_config
  ALTER COLUMN subscription_status SET DEFAULT 'inactive';

NOTIFY pgrst, 'reload schema';
