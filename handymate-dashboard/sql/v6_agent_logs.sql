-- ============================================================
-- V6: agent_type kolumn i automation_logs och agent_runs
-- Spårar vilken subagent (lead/ekonomi/strategi/orchestrator)
-- som fattade varje beslut.
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE v3_automation_logs ADD COLUMN IF NOT EXISTS agent_type TEXT;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS agent_type TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_type ON agent_runs(agent_type);
