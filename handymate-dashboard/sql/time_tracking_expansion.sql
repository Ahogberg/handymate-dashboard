-- =========================================
-- HANDYMATE - TIDRAPPORTERING EXPANSION
-- work_type tabell, utökad time_entry, business_config inställningar
-- Kan köras flera gånger utan problem
-- =========================================


-- 1. WORK_TYPE - Konfigurerbara arbetstyper
-- =========================================
CREATE TABLE IF NOT EXISTS work_type (
  work_type_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  multiplier DECIMAL(4,2) DEFAULT 1.0,
  billable_default BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_work_type_business;
CREATE INDEX idx_work_type_business ON work_type(business_id);

ALTER TABLE work_type ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_type_all" ON work_type;
CREATE POLICY "work_type_all" ON work_type FOR ALL USING (true) WITH CHECK (true);


-- 2. UTÖKA TIME_ENTRY
-- =========================================
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS work_type_id TEXT;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS invoiced BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_time_entry_work_type ON time_entry(work_type_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_invoice ON time_entry(invoice_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_uninvoiced ON time_entry(business_id, invoiced)
  WHERE invoiced = false;


-- 3. UTÖKA BUSINESS_CONFIG med tidrapport-inställningar
-- =========================================
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS default_hourly_rate DECIMAL(10,2) DEFAULT 500;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS time_rounding_minutes INTEGER DEFAULT 15;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS time_require_description BOOLEAN DEFAULT false;


-- 4. SEED DEFAULT WORK TYPES för alla befintliga företag
-- =========================================
INSERT INTO work_type (business_id, name, multiplier, billable_default, sort_order)
SELECT bc.business_id, 'Normal arbetstid', 1.0, true, 0
FROM business_config bc
WHERE NOT EXISTS (
  SELECT 1 FROM work_type wt WHERE wt.business_id = bc.business_id AND wt.name = 'Normal arbetstid'
);

INSERT INTO work_type (business_id, name, multiplier, billable_default, sort_order)
SELECT bc.business_id, 'Övertid', 1.5, true, 1
FROM business_config bc
WHERE NOT EXISTS (
  SELECT 1 FROM work_type wt WHERE wt.business_id = bc.business_id AND wt.name = 'Övertid'
);

INSERT INTO work_type (business_id, name, multiplier, billable_default, sort_order)
SELECT bc.business_id, 'Restid', 1.0, false, 2
FROM business_config bc
WHERE NOT EXISTS (
  SELECT 1 FROM work_type wt WHERE wt.business_id = bc.business_id AND wt.name = 'Restid'
);

INSERT INTO work_type (business_id, name, multiplier, billable_default, sort_order)
SELECT bc.business_id, 'Jour', 2.0, true, 3
FROM business_config bc
WHERE NOT EXISTS (
  SELECT 1 FROM work_type wt WHERE wt.business_id = bc.business_id AND wt.name = 'Jour'
);


SELECT 'Time tracking expansion migration completed' as status;
