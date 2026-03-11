-- ============================================================
-- Inbox Item table + billing column fixes
-- Run in Supabase SQL Editor
-- ============================================================

-- Inbox items — dashboard overview of incoming SMS/calls/leads
CREATE TABLE IF NOT EXISTS inbox_item (
  inbox_item_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  customer_id TEXT,
  summary TEXT,
  status TEXT DEFAULT 'new',
  related_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table already existed without them
ALTER TABLE inbox_item ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE inbox_item ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE inbox_item ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE inbox_item ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE inbox_item ADD COLUMN IF NOT EXISTS related_id TEXT;
ALTER TABLE inbox_item ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_inbox_item_business ON inbox_item(business_id);
CREATE INDEX IF NOT EXISTS idx_inbox_item_status ON inbox_item(business_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_item_created ON inbox_item(created_at DESC);

ALTER TABLE inbox_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbox_item_policy ON inbox_item;
CREATE POLICY inbox_item_policy ON inbox_item FOR ALL USING (true) WITH CHECK (true);

-- Billing columns on business_config (if billing.sql was not run)
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS billing_plan TEXT DEFAULT 'starter';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'trialing';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

