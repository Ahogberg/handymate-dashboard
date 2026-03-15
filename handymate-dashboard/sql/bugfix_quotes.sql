-- bugfix_quotes.sql
-- Lägg till kolumner som saknas för manuell offertacceptans
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS accepted_manually BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
