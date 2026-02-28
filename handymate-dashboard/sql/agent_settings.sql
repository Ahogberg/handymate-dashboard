-- ============================================================
-- Agent Settings — Autonomy configuration per business
-- Controls what the AI agent can do without approval
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_settings (
  business_id TEXT PRIMARY KEY REFERENCES business_config(business_id),
  settings JSONB NOT NULL DEFAULT '{
    "auto_create_customer": true,
    "auto_create_quote": false,
    "auto_send_sms": false,
    "auto_create_booking": false,
    "auto_send_email": false,
    "auto_create_invoice": false,
    "max_quote_amount": 50000,
    "require_approval_above": 10000
  }',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_settings_business_access" ON agent_settings;
CREATE POLICY "agent_settings_business_access" ON agent_settings
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agent_settings_service_role" ON agent_settings;
CREATE POLICY "agent_settings_service_role" ON agent_settings
  FOR ALL
  USING (auth.role() = 'service_role');
