-- V12 Produktregister
-- Kör manuellt i Supabase SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'material',   -- 'material' | 'arbete' | 'hyra' | 'övrigt'
  sku TEXT,                           -- artikelnummer (valfritt)

  unit TEXT NOT NULL DEFAULT 'st',
  -- 'st' | 'tim' | 'm²' | 'm' | 'kg' | 'l' | 'dag'

  purchase_price NUMERIC,             -- inköpspris (valfritt)
  sales_price NUMERIC NOT NULL,       -- försäljningspris
  markup_percent NUMERIC,             -- påslag % (beräknas om purchase_price finns)

  rot_eligible BOOLEAN DEFAULT false,
  rut_eligible BOOLEAN DEFAULT false,
  vat_rate NUMERIC DEFAULT 0.25,

  is_active BOOLEAN DEFAULT true,
  is_favorite BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin (to_tsvector('simple', name));

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_all" ON products;
CREATE POLICY "products_all" ON products FOR ALL USING (true) WITH CHECK (true);
