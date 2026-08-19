-- v161: Leverantörsfakturor — länkning mot material + underentreprenörer
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- supplier_invoices och project_material kan idag registrera samma inköp
-- två gånger (lib/efterkalkyl/freeze-outcome.ts har en aktiv spärr,
-- material_source_overlap_free, som blockerar ekonomisk inlärning när båda
-- har rader på samma projekt). Se docs/superpowers/specs/
-- 2026-08-19-leverantorsfakturor-design.md, Lager 1.
--
-- BESLUT
-- project_material.supplier_invoice_id länkar en materialrad till den
-- faktura den kom ifrån (TD-79:s egen skiss, tasks/tech-debt.md).
-- supplier_invoices.subcontractor_id ger en riktig koppling mot en
-- registrerad underentreprenör — supplier_name förblir fritext för
-- materialleverantörer (Bauhaus, Beijer) som aldrig registreras.

BEGIN;

ALTER TABLE project_material
  ADD COLUMN IF NOT EXISTS supplier_invoice_id TEXT
    REFERENCES supplier_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_material_supplier_invoice
  ON project_material(supplier_invoice_id);

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS subcontractor_id TEXT
    REFERENCES subcontractor(subcontractor_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_subcontractor
  ON supplier_invoices(subcontractor_id);

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'project_material' AND column_name = 'supplier_invoice_id';
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'supplier_invoices' AND column_name = 'subcontractor_id';
