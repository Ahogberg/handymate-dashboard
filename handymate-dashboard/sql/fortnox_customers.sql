-- =========================================
-- HANDYMATE - FORTNOX KUNDSYNK
-- Kolumner för att spåra Fortnox-synk
-- =========================================

-- Lägg till Fortnox-kolumner i customer-tabellen
ALTER TABLE customer ADD COLUMN IF NOT EXISTS fortnox_customer_number TEXT;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS fortnox_synced_at TIMESTAMPTZ;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS fortnox_sync_error TEXT;

-- Index för att hitta osynkade kunder snabbt
CREATE INDEX IF NOT EXISTS idx_customer_fortnox_sync ON customer(business_id, fortnox_customer_number)
WHERE fortnox_customer_number IS NULL;

-- Index för att matcha på Fortnox-kundnummer
CREATE INDEX IF NOT EXISTS idx_customer_fortnox_number ON customer(fortnox_customer_number)
WHERE fortnox_customer_number IS NOT NULL;

SELECT 'Fortnox customer sync columns added successfully' as status;
