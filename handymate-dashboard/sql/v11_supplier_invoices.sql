-- V11 T4: Leverantörsfakturor kopplade till projekt
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  project_id TEXT REFERENCES project(project_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  supplier_name TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,

  amount_excl_vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  markup_percent NUMERIC(5,2) DEFAULT 0,
  billable_to_customer BOOLEAN DEFAULT true,
  show_to_customer BOOLEAN DEFAULT false,

  status TEXT DEFAULT 'unpaid',
  -- 'unpaid' | 'paid' | 'invoiced'
  paid_at TIMESTAMPTZ,

  receipt_url TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_project
  ON supplier_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_business
  ON supplier_invoices(business_id, status);

-- RLS
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_invoices_all" ON supplier_invoices
  FOR ALL USING (true) WITH CHECK (true);
