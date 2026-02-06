-- =========================================
-- HANDYMATE - FORTNOX INTEGRATION
-- OAuth tokens och koppling
-- =========================================

-- Lägg till Fortnox-kolumner i business_config
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS fortnox_access_token TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS fortnox_refresh_token TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS fortnox_token_expires_at TIMESTAMPTZ;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS fortnox_connected_at TIMESTAMPTZ;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS fortnox_company_name TEXT;

-- Index för att snabbt hitta kopplade företag
CREATE INDEX IF NOT EXISTS idx_business_config_fortnox ON business_config(fortnox_connected_at)
WHERE fortnox_connected_at IS NOT NULL;

SELECT 'Fortnox columns added successfully' as status;
