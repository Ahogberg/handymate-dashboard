-- =========================================
-- HANDYMATE - NYA TABELLER (ROBUST VERSION)
-- Kan köras flera gånger utan problem
-- =========================================


-- 1. TIME_ENTRY - Tidrapportering
-- =========================================
CREATE TABLE IF NOT EXISTS time_entry (
  time_entry_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  booking_id TEXT,
  customer_id TEXT,
  description TEXT,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME,
  end_time TIME,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  hourly_rate DECIMAL(10,2),
  is_billable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_time_entry_business;
DROP INDEX IF EXISTS idx_time_entry_date;
CREATE INDEX idx_time_entry_business ON time_entry(business_id);
CREATE INDEX idx_time_entry_date ON time_entry(work_date);

ALTER TABLE time_entry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_entry_all" ON time_entry;
CREATE POLICY "time_entry_all" ON time_entry FOR ALL USING (true) WITH CHECK (true);


-- 2. CALL_RECORDING - Samtalsinspelningar
-- =========================================
CREATE TABLE IF NOT EXISTS call_recording (
  recording_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT,
  elks_recording_id TEXT,
  recording_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  transcript TEXT,
  transcript_summary TEXT,
  transcribed_at TIMESTAMPTZ,
  phone_number TEXT,
  direction TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lägg till saknade kolumner om tabellen redan finns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'phone_number') THEN
    ALTER TABLE call_recording ADD COLUMN phone_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'direction') THEN
    ALTER TABLE call_recording ADD COLUMN direction TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'transcript') THEN
    ALTER TABLE call_recording ADD COLUMN transcript TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'transcript_summary') THEN
    ALTER TABLE call_recording ADD COLUMN transcript_summary TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'transcribed_at') THEN
    ALTER TABLE call_recording ADD COLUMN transcribed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'elks_recording_id') THEN
    ALTER TABLE call_recording ADD COLUMN elks_recording_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'recording_url') THEN
    ALTER TABLE call_recording ADD COLUMN recording_url TEXT;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_call_recording_business;
DROP INDEX IF EXISTS idx_call_recording_created;
CREATE INDEX idx_call_recording_business ON call_recording(business_id);
CREATE INDEX idx_call_recording_created ON call_recording(created_at);

ALTER TABLE call_recording ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "call_recording_all" ON call_recording;
CREATE POLICY "call_recording_all" ON call_recording FOR ALL USING (true) WITH CHECK (true);


-- 3. AI_SUGGESTION - AI-förslag
-- =========================================
CREATE TABLE IF NOT EXISTS ai_suggestion (
  suggestion_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  recording_id TEXT,
  customer_id TEXT,
  suggestion_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  action_data JSONB DEFAULT '{}',
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  confidence_score DECIMAL(3,2),
  source_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

DROP INDEX IF EXISTS idx_ai_suggestion_business;
DROP INDEX IF EXISTS idx_ai_suggestion_status;
DROP INDEX IF EXISTS idx_ai_suggestion_created;
CREATE INDEX idx_ai_suggestion_business ON ai_suggestion(business_id);
CREATE INDEX idx_ai_suggestion_status ON ai_suggestion(status);
CREATE INDEX idx_ai_suggestion_created ON ai_suggestion(created_at);

ALTER TABLE ai_suggestion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_suggestion_all" ON ai_suggestion;
CREATE POLICY "ai_suggestion_all" ON ai_suggestion FOR ALL USING (true) WITH CHECK (true);


-- 4. TELEFONI + FÖRETAGSINFO KOLUMNER I BUSINESS_CONFIG
-- =========================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'assigned_phone_number') THEN
    ALTER TABLE business_config ADD COLUMN assigned_phone_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'forward_phone_number') THEN
    ALTER TABLE business_config ADD COLUMN forward_phone_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'call_recording_enabled') THEN
    ALTER TABLE business_config ADD COLUMN call_recording_enabled BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'call_recording_consent_message') THEN
    ALTER TABLE business_config ADD COLUMN call_recording_consent_message TEXT DEFAULT 'Detta samtal kan komma att spelas in för kvalitets- och utbildningsändamål.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'elks_number_id') THEN
    ALTER TABLE business_config ADD COLUMN elks_number_id TEXT;
  END IF;
  -- Organisationsnummer för offert-PDF
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'org_number') THEN
    ALTER TABLE business_config ADD COLUMN org_number TEXT;
  END IF;
  -- Adress för företaget
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'address') THEN
    ALTER TABLE business_config ADD COLUMN address TEXT;
  END IF;
  -- Bransch för AI-analys
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'industry') THEN
    ALTER TABLE business_config ADD COLUMN industry TEXT DEFAULT 'hantverkare';
  END IF;
END $$;


-- 5. SUPPLIER - Grossister/Leverantörer
-- =========================================
CREATE TABLE IF NOT EXISTS supplier (
  supplier_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  customer_number TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_supplier_business;
CREATE INDEX idx_supplier_business ON supplier(business_id);

ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_all" ON supplier;
CREATE POLICY "supplier_all" ON supplier FOR ALL USING (true) WITH CHECK (true);


-- 6. SUPPLIER_PRODUCT - Grossistprodukter/Prislista
-- =========================================
CREATE TABLE IF NOT EXISTS supplier_product (
  product_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES supplier(supplier_id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT DEFAULT 'st',
  purchase_price DECIMAL(10,2),
  sell_price DECIMAL(10,2),
  markup_percent DECIMAL(5,2) DEFAULT 20,
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_supplier_product_business;
DROP INDEX IF EXISTS idx_supplier_product_supplier;
DROP INDEX IF EXISTS idx_supplier_product_name;
DROP INDEX IF EXISTS idx_supplier_product_sku;
CREATE INDEX idx_supplier_product_business ON supplier_product(business_id);
CREATE INDEX idx_supplier_product_supplier ON supplier_product(supplier_id);
CREATE INDEX idx_supplier_product_name ON supplier_product(name);
CREATE INDEX idx_supplier_product_sku ON supplier_product(sku);

ALTER TABLE supplier_product ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_product_all" ON supplier_product;
CREATE POLICY "supplier_product_all" ON supplier_product FOR ALL USING (true) WITH CHECK (true);


-- KLART!
SELECT 'Migration completed successfully' as status;
