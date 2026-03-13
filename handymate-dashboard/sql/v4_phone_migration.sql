-- ============================================================
-- V4: Lägg till personal_phone, public_phone, call_handling_mode
-- Run in Supabase SQL Editor
-- ============================================================

-- personal_phone = hantverkarens privata mobilnummer (för vidarekoppling)
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS personal_phone TEXT;

-- public_phone = Handymate-numret (alias för assigned_phone_number)
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS public_phone TEXT;

-- Migrera: om assigned_phone_number finns, kopiera till public_phone
UPDATE business_config
SET public_phone = assigned_phone_number
WHERE assigned_phone_number IS NOT NULL
  AND public_phone IS NULL;

-- Migrera: om forward_phone_number finns, kopiera till personal_phone
UPDATE business_config
SET personal_phone = forward_phone_number
WHERE forward_phone_number IS NOT NULL
  AND personal_phone IS NULL;

-- call_handling_mode i v3_automation_settings
ALTER TABLE v3_automation_settings
ADD COLUMN IF NOT EXISTS call_handling_mode TEXT DEFAULT 'agent_with_transfer';
