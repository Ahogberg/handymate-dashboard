-- ============================================================
-- Handymate AI Agent — Database Migration
-- Tables: agent_runs, conversations, scheduled_actions
-- NOTE: No FK REFERENCES — business_config was created via
--       Supabase Dashboard and isn't visible to SQL REFERENCES.
--       App-level validation handles integrity.
-- ============================================================

-- ── agent_runs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}',
  steps JSONB DEFAULT '[]',
  tool_calls INT DEFAULT 0,
  final_response TEXT,
  tokens_used INT DEFAULT 0,
  estimated_cost DECIMAL(10, 4) DEFAULT 0,
  duration_ms INT DEFAULT 0,
  status TEXT DEFAULT 'running',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_business ON agent_runs(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_trigger ON agent_runs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON agent_runs(created_at DESC);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_runs_service_role" ON agent_runs;
CREATE POLICY "agent_runs_service_role" ON agent_runs
  FOR ALL USING (auth.role() = 'service_role');

-- ── conversations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT,
  agent_run_id TEXT,
  type TEXT NOT NULL,
  phone_number TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_business ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_service_role" ON conversations;
CREATE POLICY "conversations_service_role" ON conversations
  FOR ALL USING (auth.role() = 'service_role');

-- ── scheduled_actions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_actions (
  action_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  agent_run_id TEXT,
  action_type TEXT NOT NULL,
  target_id TEXT,
  target_type TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  action_data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_actions_business ON scheduled_actions(business_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_status ON scheduled_actions(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_scheduled ON scheduled_actions(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_pending ON scheduled_actions(status, scheduled_for) WHERE status = 'pending';

ALTER TABLE scheduled_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_actions_service_role" ON scheduled_actions;
CREATE POLICY "scheduled_actions_service_role" ON scheduled_actions
  FOR ALL USING (auth.role() = 'service_role');
