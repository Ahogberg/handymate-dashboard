-- V29: Ekonomi-inställningar i custom_preferences (JSONB)
-- Kör manuellt i Supabase SQL Editor

-- Uppdatera befintliga rader med ekonomi-nycklar
UPDATE business_preferences
SET custom_preferences = COALESCE(custom_preferences, '{}'::jsonb) ||
  jsonb_build_object(
    'overhead_monthly_sek', 0,
    'hourly_cost_sek', 450,
    'margin_target_percent', 50
  )
WHERE business_id IN (SELECT business_id FROM business_config)
AND (
  custom_preferences IS NULL
  OR NOT custom_preferences ? 'overhead_monthly_sek'
);

-- Skapa rader för företag som saknar business_preferences
INSERT INTO business_preferences (business_id, custom_preferences)
SELECT business_id, jsonb_build_object(
  'overhead_monthly_sek', 0,
  'hourly_cost_sek', 450,
  'margin_target_percent', 50
)
FROM business_config
WHERE business_id NOT IN (SELECT business_id FROM business_preferences)
ON CONFLICT (business_id) DO NOTHING;
