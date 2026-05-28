-- v58: invoice.fortnox_sync_status — explicit state-tracking för Fortnox-sync
-- så retry inte skapar dubblett-fakturor.
--
-- Bakgrund: pilot-fix-plan Steg 4 / audit 1 B3. Tidigare sattes
-- invoice.status='sent' även när Fortnox-anropet failade, men API
-- returnerade success=false. Användaren tryckte "skicka igen" →
-- nytt POST mot Fortnox → DUBBLETT i bokföring.
--
-- Ny modell:
--   NULL eller 'failed' → retry tillåts
--   'pending'           → in-flight, blocka retry under X sekunder
--   'synced'            → klar, blocka retry helt (idempotent)
--
-- invoice.status sätts till 'sent' BARA när sync_status='synced'.
-- Vid 'failed' behåller invoice sitt tidigare status (draft/sent) så
-- användaren kan retry utan att se "skickad" felaktigt.

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS fortnox_sync_status TEXT
  CHECK (fortnox_sync_status IS NULL OR fortnox_sync_status IN ('pending', 'synced', 'failed'));

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS fortnox_sync_attempted_at TIMESTAMPTZ;

-- Index för retry-lookups (filtrera failed invoices för admin-vyer)
CREATE INDEX IF NOT EXISTS idx_invoice_fortnox_sync_failed
  ON invoice(business_id, fortnox_sync_status)
  WHERE fortnox_sync_status = 'failed';

COMMENT ON COLUMN invoice.fortnox_sync_status IS
  'State för Fortnox-sync: NULL=ej försökt, pending=in-flight, synced=klar (blockerar retry), failed=tillåt retry. Se v58_invoice_fortnox_sync_status.sql för retry-logik.';

COMMENT ON COLUMN invoice.fortnox_sync_attempted_at IS
  'Timestamp för senaste sync-försök. Används för pending-timeout (om sync_status=pending men attempted_at > 5 min sedan, antag in-flight-dödad → tillåt retry).';
