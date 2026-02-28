-- ============================================================
-- Lead Qualification & Pipeline System
-- Tables: leads, lead_activities, lead_scoring_rules
-- ============================================================

-- ── leads ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  lead_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  phone TEXT,
  email TEXT,
  name TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'new',
  score INT NOT NULL DEFAULT 0,
  score_reasons JSONB DEFAULT '[]',
  estimated_value INT,
  job_type TEXT,
  urgency TEXT NOT NULL DEFAULT 'medium',
  notes TEXT,
  assigned_to UUID,
  conversation_id TEXT,
  customer_id TEXT REFERENCES customer(customer_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  lost_reason TEXT,

  CONSTRAINT valid_source CHECK (source IN (
    'vapi_call', 'inbound_sms', 'website_form', 'manual'
  )),
  CONSTRAINT valid_status CHECK (status IN (
    'new', 'contacted', 'qualified', 'quote_sent', 'won', 'lost'
  )),
  CONSTRAINT valid_urgency CHECK (urgency IN (
    'low', 'medium', 'high', 'emergency'
  )),
  CONSTRAINT valid_score CHECK (score >= 0 AND score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_leads_business
  ON leads(business_id);
CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads(business_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_score
  ON leads(business_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_conversation
  ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_customer
  ON leads(customer_id);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_business_access" ON leads;
CREATE POLICY "leads_business_access" ON leads
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "leads_service_role" ON leads;
CREATE POLICY "leads_service_role" ON leads
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── lead_activities ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_activities (
  activity_id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  agent_run_id TEXT REFERENCES agent_runs(run_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_activity_type CHECK (activity_type IN (
    'created', 'called', 'sms_sent', 'email_sent',
    'quote_created', 'status_changed', 'score_updated', 'note_added'
  ))
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead
  ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_business
  ON lead_activities(business_id);

-- RLS
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_activities_business_access" ON lead_activities;
CREATE POLICY "lead_activities_business_access" ON lead_activities
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lead_activities_service_role" ON lead_activities;
CREATE POLICY "lead_activities_service_role" ON lead_activities
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── lead_scoring_rules ────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_scoring_rules (
  rule_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  rule_name TEXT NOT NULL,
  condition JSONB NOT NULL DEFAULT '{}',
  points INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, rule_name)
);

CREATE INDEX IF NOT EXISTS idx_lead_scoring_rules_business
  ON lead_scoring_rules(business_id);

-- RLS
ALTER TABLE lead_scoring_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_scoring_rules_business_access" ON lead_scoring_rules;
CREATE POLICY "lead_scoring_rules_business_access" ON lead_scoring_rules
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_config
      WHERE user_id::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lead_scoring_rules_service_role" ON lead_scoring_rules;
CREATE POLICY "lead_scoring_rules_service_role" ON lead_scoring_rules
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── Seed scoring rules ────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_lead_scoring_rules(p_business_id TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO lead_scoring_rules (rule_id, business_id, rule_name, condition, points, enabled)
  VALUES
    (
      'lsr_' || substr(md5(p_business_id || 'answered_call'), 1, 12),
      p_business_id, 'Svarade på samtal',
      '{"type": "answered_call"}', 20, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'specific_job'), 1, 12),
      p_business_id, 'Beskrev specifikt jobb',
      '{"type": "specific_job"}', 15, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'urgency_mentioned'), 1, 12),
      p_business_id, 'Nämnde tidspress/akut',
      '{"type": "urgency_mentioned"}', 25, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'in_service_area'), 1, 12),
      p_business_id, 'Har adress i vårt område',
      '{"type": "in_service_area"}', 10, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'returning_customer'), 1, 12),
      p_business_id, 'Återkommande kund',
      '{"type": "returning_customer"}', 30, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'budget_mentioned'), 1, 12),
      p_business_id, 'Budget nämnd',
      '{"type": "budget_mentioned"}', 15, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'unclear_request'), 1, 12),
      p_business_id, 'Oklar förfrågan',
      '{"type": "unclear_request"}', -10, true
    )
  ON CONFLICT (business_id, rule_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Pipeline stats view ───────────────────────────────────
CREATE OR REPLACE VIEW lead_pipeline_stats AS
SELECT
  business_id,
  status,
  COUNT(*) AS lead_count,
  COALESCE(SUM(estimated_value), 0) AS total_value,
  ROUND(AVG(score), 1) AS avg_score
FROM leads
GROUP BY business_id, status;

-- ── Active leads view ─────────────────────────────────────
CREATE OR REPLACE VIEW active_leads AS
SELECT
  l.lead_id,
  l.business_id,
  l.name,
  l.phone,
  l.email,
  l.source,
  l.status,
  l.score,
  l.score_reasons,
  l.estimated_value,
  l.job_type,
  l.urgency,
  l.notes,
  l.customer_id,
  l.created_at,
  l.updated_at,
  (
    SELECT la.description FROM lead_activities la
    WHERE la.lead_id = l.lead_id
    ORDER BY la.created_at DESC LIMIT 1
  ) AS last_activity
FROM leads l
WHERE l.status NOT IN ('won', 'lost')
ORDER BY
  CASE l.urgency
    WHEN 'emergency' THEN 0
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 3
  END,
  l.score DESC;
