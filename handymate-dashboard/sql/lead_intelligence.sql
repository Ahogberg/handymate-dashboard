-- Lead Intelligence: AI Lead-kvalificering + Speed-to-Lead + Win/Loss
-- Run in Supabase SQL Editor

-- Deal: lead scoring columns
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_score_factors JSONB;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_reasoning TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS suggested_action TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS estimated_value NUMERIC;

-- Deal: speed-to-lead columns
ALTER TABLE deal ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;

-- Deal: win/loss columns
ALTER TABLE deal ADD COLUMN IF NOT EXISTS loss_reason TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS loss_reason_detail TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS won_value NUMERIC;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lost_value NUMERIC;

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_deal_business_created ON deal (business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deal_business_stage ON deal (business_id, stage_id);
