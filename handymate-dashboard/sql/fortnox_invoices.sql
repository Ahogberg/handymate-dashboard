-- =========================================
-- HANDYMATE - FORTNOX FAKTURASYNK
-- Kolumner för att spåra Fortnox-synk
-- =========================================

-- Lägg till Fortnox-kolumner i invoice-tabellen
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS fortnox_invoice_number TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS fortnox_document_number TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS fortnox_synced_at TIMESTAMPTZ;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS fortnox_sync_error TEXT;

-- Index för att hitta osynkade fakturor snabbt
CREATE INDEX IF NOT EXISTS idx_invoice_fortnox_sync ON invoice(business_id, fortnox_invoice_number)
WHERE fortnox_invoice_number IS NULL;

-- Index för att matcha på Fortnox-dokumentnummer
CREATE INDEX IF NOT EXISTS idx_invoice_fortnox_docnum ON invoice(fortnox_document_number)
WHERE fortnox_document_number IS NOT NULL;

-- Auto-sync toggle i business_config
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS fortnox_auto_sync_invoices BOOLEAN DEFAULT false;

SELECT 'Fortnox invoice sync columns added successfully' as status;
