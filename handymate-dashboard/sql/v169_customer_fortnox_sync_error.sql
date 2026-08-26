-- v169: customer.fortnox_sync_error saknas i prod (2026-08-26)
--
-- VERKLIGT FYND (verifierat mot information_schema): sql/v70 la bara till
-- fortnox_customer_number + fortnox_synced_at. Kolumnen fortnox_sync_error
-- fanns bara i sql/fortnox_customers.sql som aldrig kördes i prod.
--
-- KONSEKVENS (lib/fortnox.ts syncCustomerToFortnox, rad ~553-566): efter
-- att kunden skapats i Fortnox skrivs { fortnox_customer_number,
-- fortnox_synced_at, fortnox_sync_error: null } i EN UPDATE. PostgREST
-- avvisar hela satsen när en kolumn saknas -> Fortnox-numret sparas ALDRIG,
-- felet bara console.error:as, och funktionen returnerar success:true anda.
-- Nasta fakturasynk hittar inget nummer -> skapar kunden PA NYTT i Fortnox.
-- Dubblettkunder i bokforingen vid varje faktura. Aldrig observerat eftersom
-- Fortnox-vagen ar licensblockerad/obevisad (Pass 3 / I2).
--
-- Samma fantomskrivning i app/api/integrations/fortnox/sync/customers/route.ts.
--
-- Schema-verifiering FORE (forvantat: 0 rader):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='customer' AND column_name='fortnox_sync_error';

ALTER TABLE customer ADD COLUMN IF NOT EXISTS fortnox_sync_error TEXT;

COMMENT ON COLUMN customer.fortnox_sync_error IS
  'Senaste felet fran Fortnox-kundsynken (NULL = senaste forsoket lyckades). Skrivs av lib/fortnox.ts syncCustomerToFortnox.';

-- Facit-verifiering EFTER (forvantat: 1 rad):
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='customer' AND column_name='fortnox_sync_error';
