-- ============================================================
-- Handymate AI Agent — Database Migration
-- Tables: agent_runs, conversations, scheduled_actions
-- ============================================================

-- ── agent_runs ──────────────────────────────────────────
-- Logs every AI agent execution with full step history
CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  trigger_type TEXT NOT NULL, -- phone_call, incoming_sms, cron, manual
  trigger_data JSONB DEFAULT '{}',
  steps JSONB DEFAULT '[]', -- Array of step objects
  tool_calls INT DEFAULT 0,
  final_response TEXT,
  tokens_used INT DEFAULT 0,
  estimated_cost DECIMAL(10, 4) DEFAULT 0,
  duration_ms INT DEFAULT 0,
  status TEXT DEFAULT 'running', -- running, completed, failed, timeout
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_business
  ON agent_runs(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_trigger
  ON agent_runs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created
  ON agent_runs(created_at DESC);

-- RLS
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_runs_business_access" ON agent_runs;
CREATE POLICY "agent_runs_business_access" ON agent_runs
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

-- Service role bypass
DROP POLICY IF EXISTS "agent_runs_service_role" ON agent_runs;
CREATE POLICY "agent_runs_service_role" ON agent_runs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── conversations ───────────────────────────────────────
-- Unified conversation history across all channels
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  customer_id TEXT REFERENCES customer(customer_id),
  agent_run_id TEXT REFERENCES agent_runs(run_id),
  type TEXT NOT NULL, -- phone_call, sms, email, manual
  phone_number TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_business
  ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer
  ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type
  ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_phone
  ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_created
  ON conversations(created_at DESC);

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_business_access" ON conversations;
CREATE POLICY "conversations_business_access" ON conversations
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "conversations_service_role" ON conversations;
CREATE POLICY "conversations_service_role" ON conversations
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── scheduled_actions ───────────────────────────────────
-- Actions that the agent has scheduled for future execution
CREATE TABLE IF NOT EXISTS scheduled_actions (
  action_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  agent_run_id TEXT REFERENCES agent_runs(run_id),
  action_type TEXT NOT NULL, -- send_sms, send_email, follow_up, reminder, create_invoice
  target_id TEXT, -- customer_id, booking_id, quote_id, etc.
  target_type TEXT, -- customer, booking, quote, invoice
  scheduled_for TIMESTAMPTZ NOT NULL,
  action_data JSONB DEFAULT '{}', -- Parameters for the action
  status TEXT DEFAULT 'pending', -- pending, executed, cancelled, failed
  executed_at TIMESTAMPTZ,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_actions_business
  ON scheduled_actions(business_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_status
  ON scheduled_actions(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_scheduled
  ON scheduled_actions(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_pending
  ON scheduled_actions(status, scheduled_for)
  WHERE status = 'pending';

-- RLS
ALTER TABLE scheduled_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_actions_business_access" ON scheduled_actions;
CREATE POLICY "scheduled_actions_business_access" ON scheduled_actions
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "scheduled_actions_service_role" ON scheduled_actions;
CREATE POLICY "scheduled_actions_service_role" ON scheduled_actions
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── Useful views ────────────────────────────────────────

-- Recent agent activity per business
CREATE OR REPLACE VIEW agent_activity AS
SELECT
  ar.run_id,
  ar.business_id,
  bc.business_name,
  ar.trigger_type,
  ar.tool_calls,
  ar.tokens_used,
  ar.estimated_cost,
  ar.duration_ms,
  ar.status,
  ar.final_response,
  ar.created_at
FROM agent_runs ar
JOIN business_config bc ON bc.business_id = ar.business_id
ORDER BY ar.created_at DESC;

-- Pending scheduled actions (for cron processing)
CREATE OR REPLACE VIEW pending_actions AS
SELECT
  sa.*,
  bc.business_name
FROM scheduled_actions sa
JOIN business_config bc ON bc.business_id = sa.business_id
WHERE sa.status = 'pending'
  AND sa.scheduled_for <= NOW()
ORDER BY sa.scheduled_for ASC;
