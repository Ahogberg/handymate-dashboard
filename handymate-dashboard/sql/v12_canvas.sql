-- V12 Rityta / Canvas för projekt
-- Kör manuellt i Supabase SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_canvas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL,
  project_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  canvas_data JSONB DEFAULT '{"objects": [], "background": "#ffffff"}',
  thumbnail_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_canvas_project ON project_canvas(project_id);
CREATE INDEX IF NOT EXISTS idx_project_canvas_business ON project_canvas(business_id);

ALTER TABLE project_canvas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_canvas_all" ON project_canvas;
CREATE POLICY "project_canvas_all" ON project_canvas FOR ALL USING (true) WITH CHECK (true);
