-- ============================================================
-- Bugfix: Korrigera ID-numrering
-- leads.project_number → leads.lead_number (L-XXXX)
-- project.project_number (P-XXXX) — ny kolumn
-- Kör manuellt i Supabase SQL Editor
-- ============================================================

-- 1. Lägg till lead_number på leads (kopierar från project_number men byter prefix)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_number TEXT;

-- Migrera befintliga P-nummer till L-nummer
UPDATE leads SET lead_number = REPLACE(project_number, 'P-', 'L-')
WHERE project_number IS NOT NULL AND lead_number IS NULL;

-- 2. Lägg till project_number på project-tabellen
ALTER TABLE project ADD COLUMN IF NOT EXISTS project_number TEXT;

-- Tilldela P-nummer till befintliga projekt
WITH numbered AS (
  SELECT project_id, business_id,
    ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY created_at ASC) + 2000 AS num
  FROM project
  WHERE project_number IS NULL
)
UPDATE project SET project_number = 'P-' || numbered.num
FROM numbered WHERE project.project_id = numbered.project_id;

-- 3. Lägg till counter-typer
INSERT INTO business_counters (business_id, counter_type, last_value)
SELECT business_id, 'lead', COALESCE(MAX(
  CASE WHEN lead_number ~ '^L-[0-9]+$'
    THEN CAST(SUBSTRING(lead_number FROM 3) AS INTEGER)
    ELSE 1000
  END
), 1000)
FROM leads
WHERE lead_number IS NOT NULL
GROUP BY business_id
ON CONFLICT (business_id, counter_type) DO UPDATE SET last_value = EXCLUDED.last_value;

INSERT INTO business_counters (business_id, counter_type, last_value)
SELECT business_id, 'project', COALESCE(MAX(
  CASE WHEN project_number ~ '^P-[0-9]+$'
    THEN CAST(SUBSTRING(project_number FROM 3) AS INTEGER)
    ELSE 2000
  END
), 2000)
FROM project
WHERE project_number IS NOT NULL
GROUP BY business_id
ON CONFLICT (business_id, counter_type) DO UPDATE SET last_value = EXCLUDED.last_value;

-- Index
CREATE INDEX IF NOT EXISTS idx_lead_number ON leads(business_id, lead_number);
CREATE INDEX IF NOT EXISTS idx_project_number ON project(business_id, project_number);
