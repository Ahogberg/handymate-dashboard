-- V46: Komplettera Fortnox-integration
--
-- Befintlig Fortnox-stub (sql/fortnox_integration.sql + lib/fortnox.ts) har
-- OAuth-tokens och customer/invoice sync-fält. Det här lägger till:
--   - boolean shortcut `fortnox_connected` (UI använder den för enkel rendering)
--   - `fortnox_last_synced_at` på business_config (för "senast synkad"-text)
--   - ROT-status, manuell betalmarkering på invoice
--   - `fortnox_api_log`-tabell för debugging av alla API-anrop

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS fortnox_connected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fortnox_last_synced_at TIMESTAMPTZ;

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS rot_application_status TEXT,
  ADD COLUMN IF NOT EXISTS manual_paid_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_paid_by_user_id TEXT;

-- API-logg: en rad per Fortnox-anrop. Behåll i 30 dagar (städas av maintenance-cron).
CREATE TABLE IF NOT EXISTS fortnox_api_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fortnox_log_business ON fortnox_api_log(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fortnox_log_errors ON fortnox_api_log(business_id, created_at DESC) WHERE error_message IS NOT NULL;
