-- ============================================================
-- V2: Kundnummer (K-XXXX) och Projektnummer (P-XXXX)
-- Run in Supabase SQL Editor
-- ============================================================

-- Kolumner för nummer
ALTER TABLE customer ADD COLUMN IF NOT EXISTS customer_number TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS project_number TEXT;

-- Räknartabell för sekventiella nummer per företag
CREATE TABLE IF NOT EXISTS business_counters (
  business_id TEXT NOT NULL,
  counter_type TEXT NOT NULL,  -- 'customer', 'project'
  last_value INTEGER DEFAULT 1000,
  PRIMARY KEY (business_id, counter_type)
);

ALTER TABLE business_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_counters_policy ON business_counters;
CREATE POLICY business_counters_policy ON business_counters FOR ALL USING (true) WITH CHECK (true);

-- Atomisk räknarfunktion (anropas via supabase.rpc('increment_counter', {...}))
CREATE OR REPLACE FUNCTION increment_counter(p_business_id TEXT, p_counter_type TEXT)
RETURNS INTEGER AS $$
DECLARE
  new_value INTEGER;
BEGIN
  INSERT INTO business_counters (business_id, counter_type, last_value)
  VALUES (p_business_id, p_counter_type, 1001)
  ON CONFLICT (business_id, counter_type)
  DO UPDATE SET last_value = business_counters.last_value + 1
  RETURNING last_value INTO new_value;
  RETURN new_value;
END;
$$ LANGUAGE plpgsql;

-- Index för snabb sökning på nummer
CREATE INDEX IF NOT EXISTS idx_customer_number ON customer(business_id, customer_number);
CREATE INDEX IF NOT EXISTS idx_lead_project_number ON leads(business_id, project_number);

-- ============================================================
-- Engångsmigration: tilldela nummer till befintliga poster
-- ============================================================

-- Kunder: K-1001, K-1002, ...
WITH numbered AS (
  SELECT customer_id, business_id,
    ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY created_at ASC) + 1000 AS num
  FROM customer
  WHERE customer_number IS NULL
)
UPDATE customer SET customer_number = 'K-' || numbered.num
FROM numbered WHERE customer.customer_id = numbered.customer_id;

-- Leads/Projekt: P-1001, P-1002, ...
WITH numbered AS (
  SELECT lead_id, business_id,
    ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY created_at ASC) + 1000 AS num
  FROM leads
  WHERE project_number IS NULL
)
UPDATE leads SET project_number = 'P-' || numbered.num
FROM numbered WHERE leads.lead_id = numbered.lead_id;

-- Sätt business_counters till rätt startvärde baserat på befintliga poster
INSERT INTO business_counters (business_id, counter_type, last_value)
SELECT business_id, 'customer', COALESCE(MAX(
  CASE WHEN customer_number ~ '^K-[0-9]+$'
    THEN CAST(SUBSTRING(customer_number FROM 3) AS INTEGER)
    ELSE 1000
  END
), 1000)
FROM customer
WHERE customer_number IS NOT NULL
GROUP BY business_id
ON CONFLICT (business_id, counter_type) DO UPDATE SET last_value = EXCLUDED.last_value;

INSERT INTO business_counters (business_id, counter_type, last_value)
SELECT business_id, 'project', COALESCE(MAX(
  CASE WHEN project_number ~ '^P-[0-9]+$'
    THEN CAST(SUBSTRING(project_number FROM 3) AS INTEGER)
    ELSE 1000
  END
), 1000)
FROM leads
WHERE project_number IS NOT NULL
GROUP BY business_id
ON CONFLICT (business_id, counter_type) DO UPDATE SET last_value = EXCLUDED.last_value;
