-- ═══════════════════════════════════════════════════════════
-- V17: E2E Deal Flow Engine — tabeller
-- Spårar hela livscykeln från lead till betalning
-- ═══════════════════════════════════════════════════════════

-- Lägg till project_id på deal-tabellen (om den inte redan finns)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_deal_project ON deal(project_id) WHERE project_id IS NOT NULL;

-- Lägg till deal_id på project-tabellen (om den inte redan finns)
ALTER TABLE project ADD COLUMN IF NOT EXISTS deal_id TEXT;
CREATE INDEX IF NOT EXISTS idx_project_deal ON project(deal_id) WHERE deal_id IS NOT NULL;

-- Deal flow: trackar aktuellt steg för varje deal
CREATE TABLE IF NOT EXISTS deal_flow (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  deal_id TEXT NOT NULL,
  current_step TEXT NOT NULL DEFAULT 'lead_qualified',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, deal_id)
);

-- Deal flow log: logg per steg
CREATE TABLE IF NOT EXISTS deal_flow_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'skipped', 'failed')),
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_deal_flow_business ON deal_flow(business_id);
CREATE INDEX IF NOT EXISTS idx_deal_flow_deal ON deal_flow(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_flow_status ON deal_flow(status);
CREATE INDEX IF NOT EXISTS idx_deal_flow_log_deal ON deal_flow_log(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_flow_log_business ON deal_flow_log(business_id);
CREATE INDEX IF NOT EXISTS idx_deal_flow_log_step ON deal_flow_log(step_key);

-- RLS
ALTER TABLE deal_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_flow_log ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY deal_flow_service ON deal_flow FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY deal_flow_log_service ON deal_flow_log FOR ALL USING (true) WITH CHECK (true);
