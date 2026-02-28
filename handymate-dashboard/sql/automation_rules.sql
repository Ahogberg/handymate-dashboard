-- ============================================================
-- Proactive Automation System
-- Tables: automation_rules, automation_queue
-- + seed function for default rules per business
-- ============================================================

-- ── automation_rules ────────────────────────────────────
-- Business-specific automation rules
CREATE TABLE IF NOT EXISTS automation_rules (
  rule_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  rule_type TEXT NOT NULL, -- quote_followup, booking_reminder, invoice_reminder, lead_response, project_complete
  label TEXT NOT NULL,
  description TEXT,
  delay_hours INT NOT NULL DEFAULT 72,
  max_attempts INT NOT NULL DEFAULT 3,
  channel TEXT NOT NULL DEFAULT 'sms', -- sms, email, both
  enabled BOOLEAN NOT NULL DEFAULT true,
  message_template TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium', -- low, medium, high
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_rule_type CHECK (rule_type IN (
    'quote_followup', 'booking_reminder', 'invoice_reminder',
    'lead_response', 'project_complete',
    'lead_qualify', 'lead_nurture', 'lead_hot_alert'
  )),
  CONSTRAINT valid_channel CHECK (channel IN ('sms', 'email', 'both')),
  CONSTRAINT valid_risk CHECK (risk_level IN ('low', 'medium', 'high')),
  UNIQUE(business_id, rule_type)
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_business
  ON automation_rules(business_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled
  ON automation_rules(business_id, enabled)
  WHERE enabled = true;

-- RLS
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_rules_business_access" ON automation_rules;
CREATE POLICY "automation_rules_business_access" ON automation_rules
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "automation_rules_service_role" ON automation_rules;
CREATE POLICY "automation_rules_service_role" ON automation_rules
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── automation_queue ────────────────────────────────────
-- Job queue for automation executions
CREATE TABLE IF NOT EXISTS automation_queue (
  queue_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  rule_id TEXT NOT NULL REFERENCES automation_rules(rule_id),
  rule_type TEXT NOT NULL,
  target_id TEXT NOT NULL, -- quote_id, booking_id, invoice_id, conversation_id, etc.
  target_type TEXT NOT NULL, -- quote, booking, invoice, conversation, project
  customer_id TEXT REFERENCES customer(customer_id),
  customer_name TEXT,
  target_label TEXT, -- Human-readable label: "Offert Q-2026-0045, 35 000 kr"
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  attempt_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, executed, skipped, failed
  agent_run_id TEXT REFERENCES agent_runs(run_id),
  agent_instruction TEXT, -- The prompt sent to the agent
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_queue_status CHECK (status IN ('pending', 'executed', 'skipped', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_automation_queue_business
  ON automation_queue(business_id);
CREATE INDEX IF NOT EXISTS idx_automation_queue_status
  ON automation_queue(status);
CREATE INDEX IF NOT EXISTS idx_automation_queue_scheduled
  ON automation_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_automation_queue_pending
  ON automation_queue(status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_queue_target
  ON automation_queue(target_id, rule_type);

-- RLS
ALTER TABLE automation_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_queue_business_access" ON automation_queue;
CREATE POLICY "automation_queue_business_access" ON automation_queue
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "automation_queue_service_role" ON automation_queue;
CREATE POLICY "automation_queue_service_role" ON automation_queue
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── Seed function ───────────────────────────────────────
-- Call this when a new business is created to set up default rules
CREATE OR REPLACE FUNCTION seed_automation_rules(p_business_id TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO automation_rules (rule_id, business_id, rule_type, label, description, delay_hours, max_attempts, channel, enabled, message_template, risk_level)
  VALUES
    (
      'rule_' || substr(md5(p_business_id || 'quote_followup'), 1, 12),
      p_business_id,
      'quote_followup',
      'Offertuppföljning',
      'Följer upp skickade offerter som inte fått svar inom angiven tid',
      72,
      3,
      'sms',
      true,
      'Följ upp offert {quote_id} ({total} kr) till {customer}. Var vänlig och personlig, fråga om de har funderingar.',
      'medium'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'booking_reminder'), 1, 12),
      p_business_id,
      'booking_reminder',
      'Bokningspåminnelse',
      'Skickar påminnelse kvällen innan ett bokat jobb',
      18,
      1,
      'sms',
      true,
      'Skicka påminnelse om bokning {booking_id} imorgon kl {time} till {customer}. Inkludera adress om tillgänglig.',
      'low'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'invoice_reminder'), 1, 12),
      p_business_id,
      'invoice_reminder',
      'Fakturapåminnelse',
      'Påminner om obetalda fakturor som passerat förfallodatum',
      168,
      3,
      'both',
      true,
      'Skicka vänlig påminnelse om faktura {invoice_id} ({total} kr), förfallen {due_date}. Var artig men tydlig.',
      'medium'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'lead_response'), 1, 12),
      p_business_id,
      'lead_response',
      'Snabb lead-respons',
      'Reagerar på nya samtal som inte lett till offert eller bokning inom 1 timme',
      1,
      1,
      'sms',
      false,
      'Ny lead från {phone}. Analysera samtalet och föreslå nästa steg — offert, bokning eller uppföljning.',
      'high'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'project_complete'), 1, 12),
      p_business_id,
      'project_complete',
      'Projekt-avslut',
      'Skapar slutfaktura när ett projekt markeras som klart utan kopplad faktura',
      2,
      1,
      'email',
      false,
      'Projekt {booking_id} ({service_type}) för {customer} är klart. Skapa och förbered slutfaktura baserat på tidrapporter.',
      'high'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'lead_qualify'), 1, 12),
      p_business_id,
      'lead_qualify',
      'Lead-kvalificering',
      'Kvalificerar nya samtal/SMS som leads automatiskt inom 5 minuter',
      1,
      1,
      'sms',
      true,
      'Analysera samtal {conversation_id}, kvalificera lead, skapa i pipeline. Bedöm urgency, jobbtyp och uppskattat värde.',
      'low'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'lead_nurture'), 1, 12),
      p_business_id,
      'lead_nurture',
      'Lead-uppföljning',
      'Följer upp kontaktade leads med score över 50 som inte haft aktivitet på 48h',
      48,
      3,
      'sms',
      true,
      'Följ upp lead {lead_id} ({name}), var personlig baserat på deras förfrågan om {job_type}. Ring eller skicka SMS till {phone}.',
      'medium'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'lead_hot_alert'), 1, 12),
      p_business_id,
      'lead_hot_alert',
      'Het lead-alert',
      'Skickar omedelbar notis till hantverkaren vid akuta/heta leads',
      0,
      1,
      'sms',
      true,
      'Het lead! {name} behöver {job_type} akut. Ring {phone} omedelbart! Skicka SMS till hantverkaren på {owner_phone}.',
      'high'
    )
  ON CONFLICT (business_id, rule_type) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Preview view ────────────────────────────────────────
-- Shows upcoming automation candidates (for dashboard preview)
CREATE OR REPLACE VIEW automation_preview AS
SELECT
  aq.queue_id,
  aq.business_id,
  aq.rule_type,
  ar.label AS rule_label,
  aq.target_id,
  aq.target_type,
  aq.customer_name,
  aq.target_label,
  aq.scheduled_at,
  aq.status,
  aq.attempt_number,
  ar.max_attempts,
  aq.created_at
FROM automation_queue aq
JOIN automation_rules ar ON ar.rule_id = aq.rule_id
WHERE aq.status = 'pending'
ORDER BY aq.scheduled_at ASC;

-- ── History view ────────────────────────────────────────
CREATE OR REPLACE VIEW automation_history AS
SELECT
  aq.queue_id,
  aq.business_id,
  aq.rule_type,
  ar.label AS rule_label,
  aq.target_id,
  aq.target_type,
  aq.customer_name,
  aq.target_label,
  aq.scheduled_at,
  aq.executed_at,
  aq.status,
  aq.attempt_number,
  aq.agent_run_id,
  aq.error_message,
  aq.created_at
FROM automation_queue aq
JOIN automation_rules ar ON ar.rule_id = aq.rule_id
WHERE aq.status != 'pending'
ORDER BY aq.executed_at DESC NULLS LAST;
