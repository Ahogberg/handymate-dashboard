-- V29b: Ekonomi-kolumner på business_config (ersätter custom_preferences)
-- Kör manuellt i Supabase SQL Editor

-- Lägg till de två kolumner som saknas
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS overhead_monthly_sek NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_target_percent NUMERIC DEFAULT 50;

-- Timpris finns redan i pricing_settings->>'hourly_rate'
-- Ingen ny kolumn behövs för det

NOTIFY pgrst, 'reload schema';
