-- v62_rot_payment_request.sql
-- ROT/RUT-utbetalningsbegäran till Skatteverket (XML-fil schema v6 + beslutsfil-import).
-- OBS: belopp i HELA KRONOR (Skatteverkets schema v6 använder kronor, INTE öre).
-- Körs manuellt i Supabase SQL Editor.

-- ── Batch-begäran (en rad per genererad fil) ───────────────────────────────
CREATE TABLE IF NOT EXISTS rot_payment_request (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  request_type TEXT NOT NULL,                 -- 'rot' | 'rut' (aldrig blandat)
  tax_year INT NOT NULL,
  invoice_count INT NOT NULL DEFAULT 0,
  total_requested_kr BIGINT NOT NULL DEFAULT 0,
  file_name TEXT NOT NULL,
  xml_content TEXT,                           -- sparas för revision/återhämtning
  generated_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'generated',   -- generated|uploaded_to_skv|partially_approved|rejected|paid
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rot_payment_request_business
  ON rot_payment_request(business_id, created_at DESC);

ALTER TABLE rot_payment_request ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rot_payment_request_policy ON rot_payment_request;
CREATE POLICY rot_payment_request_policy ON rot_payment_request FOR ALL USING (true) WITH CHECK (true);

-- ── invoice: koppling + datalucke-fält + beslutsfält ───────────────────────
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_payment_request_id TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_work_category TEXT;        -- XSD-kategorikod (El/Vvs/Bygg...)
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_hours NUMERIC(8,2);        -- antal arbetade timmar
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_material_cost NUMERIC(12,2); -- materialkostnad (kr)
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_property_type TEXT;        -- 'smahus' | 'bostadsratt'
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_brf_org_number TEXT;       -- BRF org-nr (bostadsrätt)
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_apartment_number TEXT;     -- 4-siffrigt lägenhetsnummer
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_decision_status TEXT;      -- approved|rejected|partial
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_decision_amount_kr BIGINT; -- beviljat belopp (kr)
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_decision_at TIMESTAMPTZ;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_decision_message TEXT;

CREATE INDEX IF NOT EXISTS idx_invoice_rot_application_status
  ON invoice(business_id, rot_application_status);

-- ── business_config: default ROT-kategori (override-bar per faktura) ───────
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS default_rot_work_category TEXT;
