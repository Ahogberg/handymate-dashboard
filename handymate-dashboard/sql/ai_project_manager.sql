-- =========================================
-- HANDYMATE - AI PROJEKTLEDARE
-- Utökar projekttabeller med AI-hälsopoäng
-- och skapar AI-logg för spårbarhet
-- Kan köras flera gånger utan problem
-- =========================================


-- 1. UTÖKA PROJECT med AI-kolumner
-- =========================================
ALTER TABLE project ADD COLUMN IF NOT EXISTS ai_health_score INTEGER DEFAULT 100;
ALTER TABLE project ADD COLUMN IF NOT EXISTS ai_health_summary TEXT;
ALTER TABLE project ADD COLUMN IF NOT EXISTS ai_last_analyzed_at TIMESTAMPTZ;
ALTER TABLE project ADD COLUMN IF NOT EXISTS ai_auto_created BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_project_health ON project(business_id, ai_health_score)
  WHERE status IN ('planning', 'active');


-- 2. PROJECT_AI_LOG - AI-handlingslogg
-- =========================================
CREATE TABLE IF NOT EXISTS project_ai_log (
  id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_log_project ON project_ai_log(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_log_business ON project_ai_log(business_id, created_at DESC);

ALTER TABLE project_ai_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_ai_log_all" ON project_ai_log;
CREATE POLICY "project_ai_log_all" ON project_ai_log FOR ALL USING (true) WITH CHECK (true);


-- 3. UTÖKA PROJECT_MILESTONE med AI-fält
-- =========================================
ALTER TABLE project_milestone ADD COLUMN IF NOT EXISTS ai_progress_percent INTEGER DEFAULT 0;


SELECT 'AI Project Manager migration completed' as status;
