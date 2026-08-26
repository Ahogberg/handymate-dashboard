-- v171: Deterministisk projektmatchning av leverantorsfakturor fran Fortnox
-- (2026-08-26, Andreas: "finns det nagot smart satt att veta vilket projekt
-- en leverantorsfaktura ska tillhora redan fran Fortnox?")
--
-- Listvyn (GET /supplierinvoices) saknar projekt. Enskild faktura bar
-- Project (Fortnox projektregister), CostCenter, YourReference/OurReference
-- (leverantorens markning = littrat) och rader med eget Project. Importen
-- hamtar detaljen for varje NY faktura och kopplar automatiskt nar
-- kopplingen ar saker (lib/fortnox/match-supplier-invoice.ts):
--   fortnox_project  konterad pa projektet i Fortnox
--   row_project      alla rader pa samma projekt
--   reference        littrat "P-1042" i referens/kommentar (exakt ett projekt)
-- Allt annat gar till Karins matchningsko som idag (match_source NULL).
--
-- Additivt. Inga befintliga rader rors; svepet i 2h-cronen fyller pa
-- detaljen for redan importerade okopplade rader (fortnox_rows IS NULL).

ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS fortnox_project_number TEXT;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS fortnox_cost_center   TEXT;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS fortnox_reference      TEXT;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS fortnox_rows           JSONB;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS match_source           TEXT;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS matched_at             TIMESTAMPTZ;

COMMENT ON COLUMN supplier_invoices.fortnox_project_number IS
  'Fortnox SupplierInvoice.Project (projektnummer i Fortnox projektregister) vid import/svep.';
COMMENT ON COLUMN supplier_invoices.fortnox_cost_center IS
  'Fortnox SupplierInvoice.CostCenter.';
COMMENT ON COLUMN supplier_invoices.fortnox_reference IS
  'YourReference | OurReference | Comments fran Fortnox - leverantorens markning (littrat).';
COMMENT ON COLUMN supplier_invoices.fortnox_rows IS
  'SupplierInvoiceRows fran Fortnox (Project/CostCenter/Total per rad) - underlag for framtida radvis allokering.';
COMMENT ON COLUMN supplier_invoices.match_source IS
  'Hur project_id sattes: fortnox_project | row_project | reference (automatiskt, lib/fortnox/match-supplier-invoice.ts) | manual (Karins ko/UI). NULL = ej kopplad eller kopplad fore v171.';
COMMENT ON COLUMN supplier_invoices.matched_at IS
  'Nar project_id sattes automatiskt.';

-- Facit-verifiering EFTER:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='supplier_invoices'
--     AND column_name IN ('fortnox_project_number','fortnox_cost_center','fortnox_reference','fortnox_rows','match_source','matched_at');
--     -> 6 rader
