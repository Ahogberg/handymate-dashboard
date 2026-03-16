-- v14: Konsolidera plan-kolumner i business_config
-- Kör manuellt i Supabase SQL Editor
-- VIKTIGT: Kör steg för steg och verifiera mellan varje steg

-- Steg 1: Säkerställ att subscription_plan har rätt data
UPDATE business_config
SET subscription_plan = COALESCE(
  NULLIF(subscription_plan, ''),
  NULLIF(plan, ''),
  NULLIF(billing_plan, ''),
  'starter'
)
WHERE subscription_plan IS NULL
   OR subscription_plan = '';

-- Steg 2: Ta bort de duplicerade kolumnerna
ALTER TABLE business_config
  DROP COLUMN IF EXISTS plan,
  DROP COLUMN IF EXISTS billing_plan;

-- Steg 3: Konsolidera subscription_status
UPDATE business_config
SET subscription_status = COALESCE(
  NULLIF(subscription_status, ''),
  NULLIF(billing_status, ''),
  'trial'
)
WHERE subscription_status IS NULL
   OR subscription_status = '';

ALTER TABLE business_config
  DROP COLUMN IF EXISTS billing_status;
