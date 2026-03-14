-- V10 ÄTA-hantering — Uppgraderat ÄTA-system med signering och radbaserade poster
-- Kör manuellt i Supabase SQL Editor
-- =============================================================================

-- 1. UPPGRADERA project_change med nya kolumner
-- =============================================================================

-- ÄTA-nummer (löpnummer per projekt, t.ex. ÄTA-1, ÄTA-2)
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS ata_number INTEGER;

-- Strukturerade radobjekt (samma format som offert-rader)
-- Varje rad: { name, description, quantity, unit, unit_price, rot_rut_type }
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::JSONB;

-- Totalsumma beräknad från items (ersätter/kompletterar amount)
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;

-- Signeringsflöde (samma mönster som offert-signering)
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS sign_token TEXT;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS sent_to_email TEXT;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS sent_to_phone TEXT;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS signed_by_name TEXT;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS signed_by_ip TEXT;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS signature_data TEXT;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS declined_reason TEXT;

-- Koppling till offert och faktura
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS quote_id TEXT;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;

-- Anteckningar/kommentarer
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS notes TEXT;

-- Kund-ID (direkt koppling, behöver inte alltid gå via projekt)
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS customer_id TEXT;

-- Index för sign_token (publikt åtkomst)
CREATE UNIQUE INDEX IF NOT EXISTS idx_change_sign_token ON project_change(sign_token) WHERE sign_token IS NOT NULL;

-- Index för ata_number unikt per projekt
CREATE UNIQUE INDEX IF NOT EXISTS idx_change_ata_number ON project_change(project_id, ata_number) WHERE ata_number IS NOT NULL;

-- 2. FUNKTION: Auto-generera ata_number per projekt
-- =============================================================================
CREATE OR REPLACE FUNCTION set_ata_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ata_number IS NULL THEN
    SELECT COALESCE(MAX(ata_number), 0) + 1
    INTO NEW.ata_number
    FROM project_change
    WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_ata_number ON project_change;
CREATE TRIGGER trg_set_ata_number
  BEFORE INSERT ON project_change
  FOR EACH ROW
  EXECUTE FUNCTION set_ata_number();
