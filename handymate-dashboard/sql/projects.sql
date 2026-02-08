-- =========================================
-- HANDYMATE - PROJEKTHANTERING
-- project, project_milestone, project_change (ÄTA)
-- Kan köras flera gånger utan problem
-- =========================================


-- 1. PROJECT - Projekt
-- =========================================
CREATE TABLE IF NOT EXISTS project (
  project_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT,
  quote_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT DEFAULT 'hourly',
  status TEXT DEFAULT 'planning',
  budget_hours NUMERIC,
  budget_amount NUMERIC,
  progress_percent INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_project_business;
CREATE INDEX idx_project_business ON project(business_id);
DROP INDEX IF EXISTS idx_project_customer;
CREATE INDEX idx_project_customer ON project(customer_id);
DROP INDEX IF EXISTS idx_project_status;
CREATE INDEX idx_project_status ON project(business_id, status);

ALTER TABLE project ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_all" ON project;
CREATE POLICY "project_all" ON project FOR ALL USING (true) WITH CHECK (true);


-- 2. PROJECT_MILESTONE - Delmoment
-- =========================================
CREATE TABLE IF NOT EXISTS project_milestone (
  milestone_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  budget_hours NUMERIC,
  budget_amount NUMERIC,
  status TEXT DEFAULT 'pending',
  sort_order INTEGER DEFAULT 0,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_milestone_project;
CREATE INDEX idx_milestone_project ON project_milestone(project_id);
DROP INDEX IF EXISTS idx_milestone_business;
CREATE INDEX idx_milestone_business ON project_milestone(business_id);

ALTER TABLE project_milestone ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "milestone_all" ON project_milestone;
CREATE POLICY "milestone_all" ON project_milestone FOR ALL USING (true) WITH CHECK (true);


-- 3. PROJECT_CHANGE - ÄTA (Ändringar, Tillägg, Avgående)
-- =========================================
CREATE TABLE IF NOT EXISTS project_change (
  change_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  hours NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_change_project;
CREATE INDEX idx_change_project ON project_change(project_id);
DROP INDEX IF EXISTS idx_change_business;
CREATE INDEX idx_change_business ON project_change(business_id);

ALTER TABLE project_change ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "change_all" ON project_change;
CREATE POLICY "change_all" ON project_change FOR ALL USING (true) WITH CHECK (true);


-- 4. UTÖKA TIME_ENTRY med project-koppling
-- =========================================
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS milestone_id TEXT;

CREATE INDEX IF NOT EXISTS idx_time_entry_project ON time_entry(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_milestone ON time_entry(milestone_id);


SELECT 'Projects migration completed' as status;
