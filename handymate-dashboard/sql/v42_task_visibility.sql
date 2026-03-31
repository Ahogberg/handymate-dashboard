-- V42: Synlighet på uppgifter — privat, team, projekt
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE task
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';

-- Befintliga uppgifter med project_id → project-synlighet
UPDATE task SET visibility = 'project' WHERE project_id IS NOT NULL AND visibility = 'private';
-- Befintliga uppgifter utan tilldelning → team (bakåtkompatibilitet)
UPDATE task SET visibility = 'team' WHERE assigned_to IS NULL AND created_by IS NULL AND visibility = 'private';

CREATE INDEX IF NOT EXISTS idx_task_assigned ON task(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_created_by ON task(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_visibility ON task(business_id, visibility);

NOTIFY pgrst, 'reload schema';
