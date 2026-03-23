-- V29: Ekonomi-inställningar i business_preferences
-- Kör manuellt i Supabase SQL Editor

-- Seeda ekonomi-nycklar för alla befintliga företag
INSERT INTO business_preferences (business_id, key, value)
SELECT business_id, 'overhead_monthly_sek', '0'
FROM business_config
WHERE business_id NOT IN (
  SELECT business_id FROM business_preferences WHERE key = 'overhead_monthly_sek'
);

INSERT INTO business_preferences (business_id, key, value)
SELECT business_id, 'hourly_cost_sek', '450'
FROM business_config
WHERE business_id NOT IN (
  SELECT business_id FROM business_preferences WHERE key = 'hourly_cost_sek'
);

INSERT INTO business_preferences (business_id, key, value)
SELECT business_id, 'margin_target_percent', '50'
FROM business_config
WHERE business_id NOT IN (
  SELECT business_id FROM business_preferences WHERE key = 'margin_target_percent'
);
