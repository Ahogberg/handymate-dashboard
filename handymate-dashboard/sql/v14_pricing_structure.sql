-- V14: Prisstruktur — segment, avtalsformer, prislistor
-- Kör manuellt i Supabase SQL Editor

-- 1. Segment / Kundtyper
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#0F766E',
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Avtalsformer
CREATE TABLE IF NOT EXISTS contract_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'running' | 'framework' | 'fixed' | 'insurance'
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Prislistor
CREATE TABLE IF NOT EXISTS price_lists_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  segment_id UUID REFERENCES customer_segments(id) ON DELETE SET NULL,
  contract_type_id UUID REFERENCES contract_types(id) ON DELETE SET NULL,
  is_default BOOLEAN DEFAULT false,
  hourly_rate_normal DECIMAL(10,2),
  hourly_rate_ob1 DECIMAL(10,2),
  hourly_rate_ob2 DECIMAL(10,2),
  hourly_rate_emergency DECIMAL(10,2),
  material_markup_pct DECIMAL(5,2) DEFAULT 20,
  callout_fee DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Prisliste-rader (specifika produkter/tjänster)
CREATE TABLE IF NOT EXISTS price_list_items_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID REFERENCES price_lists_v2(id) ON DELETE CASCADE,
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'tim',
  price DECIMAL(10,2) NOT NULL,
  category_slug TEXT,
  is_rot_eligible BOOLEAN DEFAULT false,
  is_rut_eligible BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0
);

-- 5. Koppla segment + avtalsform + prislista till kund
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES customer_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_type_id UUID REFERENCES contract_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_list_id UUID REFERENCES price_lists_v2(id) ON DELETE SET NULL;

-- 6. Index
CREATE INDEX IF NOT EXISTS idx_price_lists_v2_business ON price_lists_v2(business_id);
CREATE INDEX IF NOT EXISTS idx_price_lists_v2_segment ON price_lists_v2(segment_id);
CREATE INDEX IF NOT EXISTS idx_price_list_items_v2_list ON price_list_items_v2(price_list_id);
CREATE INDEX IF NOT EXISTS idx_customer_segment ON customer(segment_id);
CREATE INDEX IF NOT EXISTS idx_customer_price_list ON customer(price_list_id);
CREATE INDEX IF NOT EXISTS idx_customer_segments_biz ON customer_segments(business_id);
CREATE INDEX IF NOT EXISTS idx_contract_types_biz ON contract_types(business_id);

-- 7. RLS
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items_v2 ENABLE ROW LEVEL SECURITY;

-- Service role full access (API uses service role key)
CREATE POLICY "Service segments" ON customer_segments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service contract_types" ON contract_types FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service price_lists_v2" ON price_lists_v2 FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service price_list_items_v2" ON price_list_items_v2 FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Auth user policies
CREATE POLICY "User segments" ON customer_segments FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User contract_types" ON contract_types FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User price_lists_v2" ON price_lists_v2 FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User price_list_items_v2" ON price_list_items_v2 FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
