-- V16: Projekt-tracker — steg och foton för kundportalen
-- Kör manuellt i Supabase SQL Editor

-- 1. Projekt-steg för tracker
CREATE TABLE IF NOT EXISTS project_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  label TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, stage)
);

-- 2. Projekt-foton
CREATE TABLE IF NOT EXISTS project_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  url TEXT NOT NULL,
  caption TEXT,
  type TEXT DEFAULT 'progress', -- 'before' | 'progress' | 'after'
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_project_stages_project ON project_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_photos_project ON project_photos(project_id);

-- 4. RLS
ALTER TABLE project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service project_stages" ON project_stages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service project_photos" ON project_photos FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "User project_stages" ON project_stages FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User project_photos" ON project_photos FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);

-- 5. Enable realtime for project_stages
ALTER PUBLICATION supabase_realtime ADD TABLE project_stages;
