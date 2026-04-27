-- v39: Projekt-workflow-stages med automationer
-- Strukturerad uppföljning av projekt från kontrakt till recension.
-- 8 systemstages (låsta, gemensamma) + business-egna automationer per stage.
--
-- Namnet `project_workflow_stages` är medvetet — den befintliga tabellen
-- `project_stages` används redan av kundportalens projekt-tracker
-- (v16_project_tracker.sql) och har annan semantik.

-- ── project_workflow_stages ────────────────────────────────────
-- TEXT som PK gör att system-stages kan ha läsbara id ('ps-01' etc)
-- medan business-egna stages använder gen_random_uuid()::text.
CREATE TABLE IF NOT EXISTS project_workflow_stages (
  id TEXT PRIMARY KEY,
  business_id TEXT, -- NULL = systemstage (gäller alla businesses)
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_system BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed system stages — låsta, gemensamma för alla businesses
INSERT INTO project_workflow_stages
  (id, business_id, name, position, color, icon, is_system, description)
VALUES
  ('ps-01', NULL, 'Kontrakt signerat',  1, '#0F766E', '✍️', true,
   'Offert accepterad — projekt startar'),
  ('ps-02', NULL, 'Startmöte bokat',    2, '#0284C7', '📅', true,
   'Datum och detaljer bekräftade med kund'),
  ('ps-03', NULL, 'Jobb påbörjat',      3, '#7C3AED', '🔨', true,
   'Arbetet har startat på plats'),
  ('ps-04', NULL, 'Delmål uppnått',     4, '#B45309', '🎯', true,
   'Konfigurerbar milstolpe'),
  ('ps-05', NULL, 'Slutbesiktning',     5, '#DC2626', '🔍', true,
   'Jobbet klart, besiktning genomförs'),
  ('ps-06', NULL, 'Faktura skickad',    6, '#0369A1', '📄', true,
   'Faktura skickad till kund'),
  ('ps-07', NULL, 'Faktura betald',     7, '#16A34A', '💰', true,
   'Betalning mottagen'),
  ('ps-08', NULL, 'Recension mottagen', 8, '#059669', '⭐', true,
   'Kund har lämnat recension')
ON CONFLICT (id) DO NOTHING;

-- ── project_stage_automations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS project_stage_automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id TEXT REFERENCES project_workflow_stages(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  agent TEXT NOT NULL CHECK (agent IN ('lars','karin','hanna','daniel','matte')),
  action_type TEXT NOT NULL,
  sms_template TEXT,
  delay_hours INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Workflow-kolumner på project ───────────────────────────────
-- Använder TEXT FK eftersom project_workflow_stages.id är TEXT
ALTER TABLE project
  ADD COLUMN IF NOT EXISTS current_workflow_stage_id TEXT REFERENCES project_workflow_stages(id),
  ADD COLUMN IF NOT EXISTS workflow_stage_entered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workflow_stage_history JSONB DEFAULT '[]';

-- ── Index ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_project_workflow_stage
  ON project(current_workflow_stage_id) WHERE current_workflow_stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stage_automations
  ON project_stage_automations(stage_id, business_id);

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE project_workflow_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_stages_select ON project_workflow_stages;
CREATE POLICY workflow_stages_select ON project_workflow_stages
  FOR SELECT USING (
    business_id IS NULL
    OR business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::text = auth.uid()::text
    )
  );

ALTER TABLE project_stage_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stage_automations_all ON project_stage_automations;
CREATE POLICY stage_automations_all ON project_stage_automations
  FOR ALL USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::text = auth.uid()::text
    )
  );

COMMENT ON TABLE project_workflow_stages IS
  '8 låsta system-stages (business_id NULL) + valfria business-egna stages för projektets livscykel.';
COMMENT ON COLUMN project.workflow_stage_history IS
  'JSONB-array: [{ stage_id, entered_at, previous_stage_id }, ...]';
