-- v11_arbetsorder.sql
-- Arbetsorder (Work Orders) — interna dokument till personal
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(project_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  order_number TEXT NOT NULL,       -- "AO-001", auto-genereras per projekt
  title TEXT NOT NULL,

  -- Jobbinformation
  scheduled_date DATE,
  scheduled_start TIME,
  scheduled_end TIME,
  address TEXT,
  access_info TEXT,                 -- "Portkod: 1234, ring på Andersson"

  -- Kontakt
  contact_name TEXT,
  contact_phone TEXT,

  -- Instruktioner
  description TEXT,                 -- vad som ska göras
  materials_needed TEXT,            -- ta med detta
  tools_needed TEXT,                -- verktyg som behövs
  notes TEXT,                       -- övrigt

  -- Status
  status TEXT DEFAULT 'draft',      -- 'draft' | 'sent' | 'completed'
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Tilldelning / SMS
  assigned_to TEXT,                 -- namn på personal
  assigned_phone TEXT               -- telefonnummer för SMS-utskick
);

CREATE INDEX IF NOT EXISTS idx_work_orders_project ON work_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_business ON work_orders(business_id, status);

-- RLS
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_orders_policy ON work_orders
  FOR ALL USING (true) WITH CHECK (true);
