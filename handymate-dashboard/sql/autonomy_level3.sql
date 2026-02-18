-- ============================================================
-- Autonomy Level 3: Auto-approve, Nurture Sequences, Auto-invoice
-- ============================================================

-- 1. Auto-approve config (JSONB on automation_settings)
ALTER TABLE automation_settings ADD COLUMN IF NOT EXISTS auto_approve_config JSONB DEFAULT '{
  "sms": { "enabled": false, "min_confidence": 85, "daily_limit": 50, "risk": "low" },
  "callback": { "enabled": false, "min_confidence": 85, "daily_limit": 50, "risk": "low" },
  "create_customer": { "enabled": false, "min_confidence": 85, "daily_limit": 30, "risk": "low" },
  "follow_up": { "enabled": false, "min_confidence": 85, "daily_limit": 30, "risk": "low" },
  "reminder": { "enabled": false, "min_confidence": 85, "daily_limit": 30, "risk": "low" },
  "booking": { "enabled": false, "min_confidence": 92, "daily_limit": 10, "risk": "medium" },
  "reschedule": { "enabled": false, "min_confidence": 92, "daily_limit": 10, "risk": "medium" },
  "quote": { "enabled": false, "min_confidence": 100, "daily_limit": 0, "risk": "high" },
  "other": { "enabled": false, "min_confidence": 100, "daily_limit": 0, "risk": "high" }
}'::jsonb;

-- Master toggle for auto-approve
ALTER TABLE automation_settings ADD COLUMN IF NOT EXISTS auto_approve_enabled BOOLEAN DEFAULT false;

-- Track daily auto-approve counts
CREATE TABLE IF NOT EXISTS auto_approve_daily_count (
  id TEXT PRIMARY KEY DEFAULT 'aadc_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 0,
  UNIQUE(business_id, action_type, count_date)
);
CREATE INDEX IF NOT EXISTS idx_auto_approve_daily_biz_date ON auto_approve_daily_count(business_id, count_date);

-- Add auto_approved flag to ai_suggestion
ALTER TABLE ai_suggestion ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false;
ALTER TABLE ai_suggestion ADD COLUMN IF NOT EXISTS auto_approved_at TIMESTAMPTZ;

-- 2. Nurture sequences
CREATE TABLE IF NOT EXISTS nurture_sequence (
  id TEXT PRIMARY KEY DEFAULT 'ns_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  steps JSONB NOT NULL DEFAULT '[]',
  cancel_on JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nurture_seq_biz ON nurture_sequence(business_id);

CREATE TABLE IF NOT EXISTS nurture_enrollment (
  id TEXT PRIMARY KEY DEFAULT 'ne_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  deal_id TEXT,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  next_action_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_nurture_enroll_biz ON nurture_enrollment(business_id);
CREATE INDEX IF NOT EXISTS idx_nurture_enroll_next ON nurture_enrollment(next_action_at) WHERE status = 'active';

-- 3. Auto-invoice settings
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS auto_invoice_enabled BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS auto_invoice_send BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS auto_invoice_max_amount INTEGER DEFAULT 50000;

-- Track which time entries are invoiced
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS invoiced BOOLEAN DEFAULT false;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS invoice_id TEXT;

-- 4. Communication log for email tracking
CREATE TABLE IF NOT EXISTS communication_log (
  id TEXT PRIMARY KEY DEFAULT 'cl_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  customer_id TEXT,
  channel TEXT NOT NULL,
  direction TEXT DEFAULT 'outbound',
  subject TEXT,
  message TEXT,
  status TEXT DEFAULT 'sent',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comm_log_biz ON communication_log(business_id, created_at DESC);
