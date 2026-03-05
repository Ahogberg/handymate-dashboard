-- ============================================================
-- Agent Idempotency — Prevent duplicate agent runs
-- Adds idempotency_key to agent_runs for dedup
-- ============================================================

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_idempotency
  ON agent_runs(idempotency_key) WHERE idempotency_key IS NOT NULL;
