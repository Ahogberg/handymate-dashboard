-- Quote System Overhaul: Grouped items, standard texts, templates, payment plans, ROT/RUT per rad
-- Run in Supabase SQL Editor

-- =============================================
-- 1. ALTER TABLE quotes – nya kolumner
-- =============================================

-- Standardtexter per offert
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS introduction_text TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS conclusion_text TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS not_included TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ata_terms TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_terms_text TEXT;

-- Betalningsplan
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan JSONB DEFAULT '[]';

-- Referensfält
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reference_person TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_reference TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS project_address TEXT;

-- Visningsinställningar
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS detail_level TEXT DEFAULT 'detailed'
  CHECK (detail_level IN ('detailed', 'subtotals_only', 'total_only'));
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS show_unit_prices BOOLEAN DEFAULT true;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS show_quantities BOOLEAN DEFAULT true;

-- ROT/RUT uppdelat
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rot_work_cost NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rot_deduction NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rot_customer_pays NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rut_work_cost NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rut_deduction NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rut_customer_pays NUMERIC;

-- Bilagor
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- =============================================
-- 2. CREATE TABLE quote_items
-- =============================================

CREATE TABLE IF NOT EXISTS quote_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(quote_id) ON DELETE CASCADE,
  business_id TEXT,
  item_type TEXT DEFAULT 'item' CHECK (item_type IN ('item', 'heading', 'text', 'subtotal', 'discount')),
  group_name TEXT,
  description TEXT,
  quantity NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'st',
  unit_price NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  cost_price NUMERIC,
  article_number TEXT,
  is_rot_eligible BOOLEAN DEFAULT false,
  is_rut_eligible BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_sort ON quote_items(quote_id, sort_order);

-- =============================================
-- 3. CREATE TABLE quote_templates
-- =============================================

CREATE TABLE IF NOT EXISTS quote_templates (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES business_config(business_id),
  name TEXT NOT NULL,
  description TEXT,
  branch TEXT,
  category TEXT,
  introduction_text TEXT,
  conclusion_text TEXT,
  not_included TEXT,
  ata_terms TEXT,
  payment_terms_text TEXT,
  default_items JSONB DEFAULT '[]',
  default_payment_plan JSONB DEFAULT '[]',
  detail_level TEXT DEFAULT 'detailed' CHECK (detail_level IN ('detailed', 'subtotals_only', 'total_only')),
  show_unit_prices BOOLEAN DEFAULT true,
  show_quantities BOOLEAN DEFAULT true,
  rot_enabled BOOLEAN DEFAULT false,
  rut_enabled BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_templates_business ON quote_templates(business_id);

-- =============================================
-- 4. CREATE TABLE quote_standard_texts
-- =============================================

CREATE TABLE IF NOT EXISTS quote_standard_texts (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES business_config(business_id),
  text_type TEXT NOT NULL CHECK (text_type IN ('introduction', 'conclusion', 'not_included', 'ata_terms', 'payment_terms')),
  name TEXT NOT NULL,
  content TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_standard_texts_biz_type ON quote_standard_texts(business_id, text_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_standard_texts_unique ON quote_standard_texts(business_id, text_type, name);

-- =============================================
-- 5. Migration: kopiera JSONB items → quote_items
-- =============================================

CREATE OR REPLACE FUNCTION migrate_quote_items_from_jsonb()
RETURNS void AS $$
DECLARE
  q RECORD;
  item JSONB;
  idx INTEGER;
  item_id TEXT;
BEGIN
  FOR q IN
    SELECT quote_id, business_id, items, rot_rut_type
    FROM quotes
    WHERE items IS NOT NULL AND jsonb_array_length(items) > 0
    AND NOT EXISTS (SELECT 1 FROM quote_items qi WHERE qi.quote_id = quotes.quote_id LIMIT 1)
  LOOP
    idx := 0;
    FOR item IN SELECT * FROM jsonb_array_elements(q.items)
    LOOP
      item_id := 'qi_' || substr(md5(random()::text), 1, 12);
      INSERT INTO quote_items (id, quote_id, business_id, item_type, description, quantity, unit, unit_price, total, is_rot_eligible, is_rut_eligible, sort_order)
      VALUES (
        item_id,
        q.quote_id,
        q.business_id,
        'item',
        COALESCE(item->>'name', item->>'description', ''),
        COALESCE((item->>'quantity')::numeric, 0),
        COALESCE(item->>'unit', 'st'),
        COALESCE((item->>'unit_price')::numeric, 0),
        COALESCE((item->>'total')::numeric, 0),
        CASE WHEN q.rot_rut_type = 'rot' AND COALESCE(item->>'type', '') = 'labor' THEN true ELSE false END,
        CASE WHEN q.rot_rut_type = 'rut' AND COALESCE(item->>'type', '') = 'labor' THEN true ELSE false END,
        idx
      );
      idx := idx + 1;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Kör migrationen
SELECT migrate_quote_items_from_jsonb();
