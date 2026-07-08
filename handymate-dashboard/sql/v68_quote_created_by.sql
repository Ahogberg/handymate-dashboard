-- v68_quote_created_by.sql — Spåra vem som SKAPADE offerten.
--
-- Körs manuellt i Supabase SQL Editor (Handymate-projektet).
-- Idempotent + additiv + nullable → noll påverkan på befintliga offerter.
--
-- Bakgrund (tasks/offert-identitet-spec.md): kundoffisar visar idag kontoägarens
-- (business_config) namn/tel/mail även när en anställd skapar offerten, eftersom
-- offerten aldrig lagrar vem som gjorde den. created_by kopplar offerten till
-- business_users-posten så avsändaridentiteten kan visa rätt person. Gamla
-- offerter (created_by NULL) faller tillbaka på ägaren precis som förr.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES business_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_created_by
  ON quotes(created_by) WHERE created_by IS NOT NULL;

-- Verifiering efter körning:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'quotes' AND column_name = 'created_by';
