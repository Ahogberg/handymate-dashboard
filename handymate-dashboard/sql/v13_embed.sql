-- v13_embed.sql
-- Lägg till website_api_key på business_config för embed-widget
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS website_api_key TEXT UNIQUE;

-- Generera nycklar för alla befintliga företag som saknar
UPDATE business_config
SET website_api_key = 'HM-' || replace(gen_random_uuid()::text, '-', '')
WHERE website_api_key IS NULL;

-- Sätt default för nya företag
ALTER TABLE business_config
  ALTER COLUMN website_api_key SET DEFAULT 'HM-' || replace(gen_random_uuid()::text, '-', '');
