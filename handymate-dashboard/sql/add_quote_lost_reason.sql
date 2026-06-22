-- add_quote_lost_reason.sql
-- Lägger till kolumnen lost_reason på quotes så att kundens avböjningsorsak
-- (från publika offert-portalen) kan sparas. Koden fungerar även utan denna
-- (orsaken hoppas då tyst över), men kör denna för att fånga orsakerna.
-- Körs manuellt i Supabase SQL Editor.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lost_reason TEXT;
