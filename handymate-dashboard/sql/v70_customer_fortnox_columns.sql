-- v70_customer_fortnox_columns.sql
-- Kör manuellt i Supabase SQL Editor (Handymate-projektet). Idempotent + additiv.
--
-- UPPTÄCKT 2026-07-09 (onboarding-import-bygget): koden skriver/läser
-- customer.fortnox_customer_number + customer.fortnox_synced_at på flera ställen
-- men kolumnerna FINNS INTE i prod → varje Fortnox-kundimport/-synk har tyst
-- rullats tillbaka (BYGGT ≠ LIVE). Dessa kolumner är hård förutsättning för hela
-- "Hämta in din verksamhet"-steget: de länkar Fortnox-kunder till lokala kunder
-- OCH låter faktura-importen koppla öppna fakturor till rätt kund.
--
-- Berör: app/api/fortnox/import/customers/route.ts (skriver båda),
-- app/api/fortnox/import/invoices/route.ts (läser fortnox_customer_number för
-- kund-länkning), lib/fortnox.ts syncCustomerToFortnox (skriver fortnox_customer_number).

ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS fortnox_customer_number TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_synced_at TIMESTAMPTZ;

-- Index för länknings-lookupen (invoice-import matchar Fortnox CustomerNumber hit).
CREATE INDEX IF NOT EXISTS idx_customer_fortnox_number
  ON customer (business_id, fortnox_customer_number)
  WHERE fortnox_customer_number IS NOT NULL;

-- Verifiering efter körning:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'customer'
--       AND column_name IN ('fortnox_customer_number','fortnox_synced_at');
