-- V20: Leverantörsintelligens — prisspårning + bevaka
-- Kör manuellt i Supabase SQL Editor

-- 1. Lägg till normal_price och watch_price på grossist_product
ALTER TABLE grossist_product
  ADD COLUMN IF NOT EXISTS normal_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS watch_price BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_history JSONB DEFAULT '[]'::jsonb;

-- 2. Manuella leverantörer (komplement till API-kopplade)
CREATE TABLE IF NOT EXISTS manual_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manual_supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES manual_suppliers(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  article_number TEXT,
  normal_price DECIMAL(10,2) NOT NULL,
  unit TEXT DEFAULT 'st',
  category TEXT,
  watch_price BOOLEAN DEFAULT false,
  current_price DECIMAL(10,2),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_suppliers_biz ON manual_suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_manual_supplier_products_biz ON manual_supplier_products(business_id);
CREATE INDEX IF NOT EXISTS idx_manual_supplier_products_watch ON manual_supplier_products(watch_price) WHERE watch_price = true;

ALTER TABLE manual_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_supplier_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service manual_suppliers" ON manual_suppliers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manual_supplier_products" ON manual_supplier_products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "User manual_suppliers" ON manual_suppliers FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User manual_supplier_products" ON manual_supplier_products FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
