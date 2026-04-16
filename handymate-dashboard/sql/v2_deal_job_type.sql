-- Lägg till job_type på deal-tabellen
-- Körs manuellt i Supabase SQL Editor.
ALTER TABLE deal ADD COLUMN IF NOT EXISTS job_type TEXT;
