-- v162: Leverantörsfakturor — Fortnox pull-synk
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Fortnox SupplierInvoice-resursen har aldrig rörts av integrationen
-- tidigare (bara Invoice/Customer). Se docs/superpowers/specs/
-- 2026-08-19-leverantorsfakturor-design.md, Lager 2.
--
-- VIKTIGT: kräver att befintliga Fortnox-anslutna konton ÅTERANSLUTER
-- (nytt OAuth-scope, "supplierinvoice", saknas i dagens beviljade scope
-- "invoice customer companyinformation"). Import-rutten känner igen och
-- svarar tydligt på scope-fel — se app/api/integrations/fortnox/import/
-- supplier-invoices/route.ts.
--
-- NUMRERING: döpt om från v161 till v162 vid mergen mot main — Etapp 1
-- (länkningen) hade redan tagit v161 i sin egen parallella worktree.

BEGIN;

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS fortnox_supplier_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_supplier_number TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_fortnox_number
  ON supplier_invoices(business_id, fortnox_supplier_invoice_number)
  WHERE fortnox_supplier_invoice_number IS NOT NULL;

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'supplier_invoices'
--   AND column_name LIKE 'fortnox_%';
