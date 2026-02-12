-- Automation Center - Centralized automation settings
-- All automation toggles in one table

CREATE TABLE IF NOT EXISTS automation_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT UNIQUE NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,

  -- AI & Calls
  ai_analyze_calls BOOLEAN DEFAULT true,
  ai_create_leads BOOLEAN DEFAULT true,
  ai_auto_move_deals BOOLEAN DEFAULT true,
  ai_confidence_threshold INTEGER DEFAULT 80,

  -- Pipeline
  pipeline_move_on_quote_sent BOOLEAN DEFAULT true,
  pipeline_move_on_quote_accepted BOOLEAN DEFAULT true,
  pipeline_move_on_invoice_sent BOOLEAN DEFAULT true,
  pipeline_move_on_payment BOOLEAN DEFAULT true,

  -- SMS Communication
  sms_booking_confirmation BOOLEAN DEFAULT true,
  sms_day_before_reminder BOOLEAN DEFAULT true,
  sms_on_the_way BOOLEAN DEFAULT true,
  sms_quote_followup BOOLEAN DEFAULT true,
  sms_job_completed BOOLEAN DEFAULT true,
  sms_invoice_reminder BOOLEAN DEFAULT true,
  sms_review_request BOOLEAN DEFAULT true,
  sms_auto_enabled BOOLEAN DEFAULT true,
  sms_quiet_hours_start TEXT DEFAULT '21:00',
  sms_quiet_hours_end TEXT DEFAULT '07:00',
  sms_max_per_customer_week INTEGER DEFAULT 3,

  -- Calendar
  calendar_sync_bookings BOOLEAN DEFAULT false,
  calendar_create_from_booking BOOLEAN DEFAULT true,

  -- Accounting (Fortnox)
  fortnox_sync_invoices BOOLEAN DEFAULT false,
  fortnox_sync_customers BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access automation_settings" ON automation_settings FOR ALL USING (true) WITH CHECK (true);

-- Activity log for automations
CREATE TABLE IF NOT EXISTS automation_activity (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  automation_type TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_activity_business ON automation_activity(business_id);
CREATE INDEX IF NOT EXISTS idx_automation_activity_created ON automation_activity(created_at);

ALTER TABLE automation_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access automation_activity" ON automation_activity FOR ALL USING (true) WITH CHECK (true);
