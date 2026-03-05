-- ============================================================
-- Task Activity Log — Händelselogg för uppgifter
-- Loggar alla ändringar: skapade, tilldelning, statusändringar,
-- kommentarer, deadline-ändringar, slutförda
-- ============================================================

CREATE TABLE IF NOT EXISTS task_activity_log (
  id TEXT DEFAULT 'ta_' || substr(md5(random()::text), 1, 12) PRIMARY KEY,
  task_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'assigned', 'status_changed',
    'comment_added', 'deadline_changed', 'completed',
    'priority_changed', 'deleted'
  )),
  description TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_business ON task_activity_log(business_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_created ON task_activity_log(created_at DESC);

COMMENT ON TABLE task_activity_log IS 'Händelselogg för uppgifter — loggar alla ändringar';
