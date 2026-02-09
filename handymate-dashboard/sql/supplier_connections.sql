-- =========================================
-- HANDYMATE - GROSSIST-INTEGRATION
-- supplier_connection, grossist_product, project_material
-- Kan köras flera gånger utan problem
-- =========================================


-- 1. SUPPLIER_CONNECTION - API-kopplingar till grossister
-- =========================================
CREATE TABLE IF NOT EXISTS supplier_connection (
  connection_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  supplier_key TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  credentials JSONB DEFAULT '{}',
  is_connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, supplier_key)
);

DROP INDEX IF EXISTS idx_supplier_connection_business;
CREATE INDEX idx_supplier_connection_business ON supplier_connection(business_id);
DROP INDEX IF EXISTS idx_supplier_connection_key;
CREATE INDEX idx_supplier_connection_key ON supplier_connection(supplier_key);

ALTER TABLE supplier_connection ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_connection_all" ON supplier_connection;
CREATE POLICY "supplier_connection_all" ON supplier_connection FOR ALL USING (true) WITH CHECK (true);


-- 2. GROSSIST_PRODUCT - Cache av produkter från grossist-API
-- =========================================
CREATE TABLE IF NOT EXISTS grossist_product (
  product_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES supplier_connection(connection_id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  supplier_key TEXT NOT NULL,
  external_id TEXT,
  sku TEXT,
  ean TEXT,
  rsk_number TEXT,
  e_number TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  unit TEXT DEFAULT 'st',
  purchase_price DECIMAL(10,2),
  recommended_price DECIMAL(10,2),
  image_url TEXT,
  in_stock BOOLEAN DEFAULT true,
  stock_quantity INTEGER,
  last_price_sync TIMESTAMPTZ,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_grossist_product_business;
CREATE INDEX idx_grossist_product_business ON grossist_product(business_id);
DROP INDEX IF EXISTS idx_grossist_product_connection;
CREATE INDEX idx_grossist_product_connection ON grossist_product(connection_id);
DROP INDEX IF EXISTS idx_grossist_product_supplier_key;
CREATE INDEX idx_grossist_product_supplier_key ON grossist_product(supplier_key);
DROP INDEX IF EXISTS idx_grossist_product_sku;
CREATE INDEX idx_grossist_product_sku ON grossist_product(sku);
DROP INDEX IF EXISTS idx_grossist_product_ean;
CREATE INDEX idx_grossist_product_ean ON grossist_product(ean);
DROP INDEX IF EXISTS idx_grossist_product_external;
CREATE INDEX idx_grossist_product_external ON grossist_product(connection_id, external_id);

ALTER TABLE grossist_product ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grossist_product_all" ON grossist_product;
CREATE POLICY "grossist_product_all" ON grossist_product FOR ALL USING (true) WITH CHECK (true);


-- 3. PROJECT_MATERIAL - Material kopplat till projekt
-- =========================================
CREATE TABLE IF NOT EXISTS project_material (
  material_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  grossist_product_id TEXT REFERENCES grossist_product(product_id) ON DELETE SET NULL,
  supplier_product_id TEXT REFERENCES supplier_product(product_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  supplier_name TEXT,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'st',
  purchase_price DECIMAL(10,2),
  sell_price DECIMAL(10,2),
  markup_percent DECIMAL(5,2) DEFAULT 20,
  total_purchase DECIMAL(10,2),
  total_sell DECIMAL(10,2),
  invoiced BOOLEAN DEFAULT false,
  invoice_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_project_material_project;
CREATE INDEX idx_project_material_project ON project_material(project_id);
DROP INDEX IF EXISTS idx_project_material_business;
CREATE INDEX idx_project_material_business ON project_material(business_id);
DROP INDEX IF EXISTS idx_project_material_invoiced;
CREATE INDEX idx_project_material_invoiced ON project_material(project_id) WHERE invoiced = false;

ALTER TABLE project_material ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_material_all" ON project_material;
CREATE POLICY "project_material_all" ON project_material FOR ALL USING (true) WITH CHECK (true);


SELECT 'Supplier connections migration completed' as status;
