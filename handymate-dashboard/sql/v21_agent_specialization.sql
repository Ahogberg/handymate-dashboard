-- V21: Agent-specialisering — agent_id på automation_rules + logs
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE v3_automation_rules
  ADD COLUMN IF NOT EXISTS agent_id TEXT;

ALTER TABLE v3_automation_logs
  ADD COLUMN IF NOT EXISTS agent_id TEXT;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS agent_id TEXT DEFAULT 'matte';

CREATE INDEX IF NOT EXISTS idx_automation_rules_agent ON v3_automation_rules(agent_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_agent ON v3_automation_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
