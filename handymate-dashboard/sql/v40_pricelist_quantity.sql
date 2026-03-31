-- V40: Standardantal i prislistan
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE price_list ADD COLUMN IF NOT EXISTS default_quantity NUMERIC DEFAULT 1;

NOTIFY pgrst, 'reload schema';
