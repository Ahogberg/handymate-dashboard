-- V17: Lagerhantering — Servicebil-lager
-- Kör manuellt i Supabase SQL Editor

-- Lagerplatser
CREATE TABLE IF NOT EXISTS inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lagerartiklar
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  location_id UUID REFERENCES inventory_locations(id) ON DELETE CASCADE,
  product_id UUID,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'st',
  current_stock DECIMAL(10,2) DEFAULT 0,
  min_stock DECIMAL(10,2) DEFAULT 0,
  cost_price DECIMAL(10,2) DEFAULT 0,
  sell_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lagerrörelser
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  project_id TEXT,
  order_id TEXT,
  movement_type TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_inventory_items_business ON inventory_items(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_location ON inventory_items(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_project ON inventory_movements(project_id);

-- RLS
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owns inventory_locations" ON inventory_locations FOR ALL
  USING (business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid()));
CREATE POLICY "Business owns inventory_items" ON inventory_items FOR ALL
  USING (business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid()));
CREATE POLICY "Business owns inventory_movements" ON inventory_movements FOR ALL
  USING (business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid()));

-- Service role access
CREATE POLICY "Service inventory_locations" ON inventory_locations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service inventory_items" ON inventory_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service inventory_movements" ON inventory_movements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Kolumn för lagerkoppling i project_material
ALTER TABLE project_material
  ADD COLUMN IF NOT EXISTS from_inventory BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID;
