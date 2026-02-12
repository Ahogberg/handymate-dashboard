-- Pipeline stages (configurable order per business)
CREATE TABLE IF NOT EXISTS pipeline_stage (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER NOT NULL,
  is_system BOOLEAN DEFAULT false,
  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(business_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stage_business ON pipeline_stage(business_id);

-- Deals / Pipeline items
CREATE TABLE IF NOT EXISTS deal (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  customer_id TEXT,
  quote_id TEXT,
  order_id TEXT,
  invoice_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  value NUMERIC,
  stage_id TEXT NOT NULL REFERENCES pipeline_stage(id),
  assigned_to TEXT,
  source TEXT,
  source_call_id TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  expected_close_date DATE,
  closed_at TIMESTAMPTZ,
  lost_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_business ON deal(business_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage ON deal(stage_id);
CREATE INDEX IF NOT EXISTS idx_deal_customer ON deal(customer_id);

-- Pipeline activity log (for AI tracking and undo)
CREATE TABLE IF NOT EXISTS pipeline_activity (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  deal_id TEXT NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  from_stage_id TEXT REFERENCES pipeline_stage(id),
  to_stage_id TEXT REFERENCES pipeline_stage(id),
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('user', 'ai', 'system')),
  ai_confidence NUMERIC,
  ai_reason TEXT,
  source_call_id TEXT,
  undone_at TIMESTAMPTZ,
  undone_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_activity_deal ON pipeline_activity(deal_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_activity_business ON pipeline_activity(business_id);

-- AI automation settings per business
CREATE TABLE IF NOT EXISTS pipeline_automation (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT UNIQUE NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  auto_create_leads BOOLEAN DEFAULT true,
  auto_move_on_signature BOOLEAN DEFAULT true,
  auto_move_on_payment BOOLEAN DEFAULT true,
  auto_move_on_project_complete BOOLEAN DEFAULT true,
  ai_analyze_calls BOOLEAN DEFAULT true,
  ai_auto_move_threshold INTEGER DEFAULT 80,
  ai_create_lead_threshold INTEGER DEFAULT 70,
  show_ai_activity BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (service role full access)
ALTER TABLE pipeline_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_automation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access pipeline_stage" ON pipeline_stage FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access deal" ON deal FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access pipeline_activity" ON pipeline_activity FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access pipeline_automation" ON pipeline_automation FOR ALL USING (true) WITH CHECK (true);
