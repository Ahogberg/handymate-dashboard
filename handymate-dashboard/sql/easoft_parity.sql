-- ============================================================
-- Easoft Parity: Lager, Geotaggning, Lönsamhet
-- ============================================================

-- 1. Lagerhantering
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY DEFAULT 'inv_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  category TEXT DEFAULT 'material', -- 'material', 'verktyg', 'förbrukning'
  unit TEXT DEFAULT 'st',
  quantity NUMERIC DEFAULT 0,
  min_quantity NUMERIC DEFAULT 0,
  unit_cost NUMERIC DEFAULT 0,
  location TEXT, -- 'Bilen', 'Förrådet', 'Kontoret'
  supplier TEXT,
  last_restocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_business ON inventory(business_id);

CREATE TABLE IF NOT EXISTS inventory_transaction (
  id TEXT PRIMARY KEY DEFAULT 'invt_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  inventory_id TEXT NOT NULL,
  project_id TEXT,
  type TEXT NOT NULL, -- 'in', 'out', 'adjustment'
  quantity NUMERIC NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invtx_inventory ON inventory_transaction(inventory_id);
CREATE INDEX IF NOT EXISTS idx_invtx_project ON inventory_transaction(project_id);

-- 2. Geotaggning vid tidrapportering
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS start_latitude NUMERIC;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS start_longitude NUMERIC;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS start_address TEXT;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS end_latitude NUMERIC;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS end_longitude NUMERIC;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS end_address TEXT;

-- 3. Extra projektkostnader (UE, övriga)
CREATE TABLE IF NOT EXISTS project_cost (
  id TEXT PRIMARY KEY DEFAULT 'pc_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  category TEXT NOT NULL, -- 'subcontractor', 'other'
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_cost_project ON project_cost(project_id);
