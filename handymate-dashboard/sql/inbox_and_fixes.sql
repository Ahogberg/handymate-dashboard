-- ============================================================
-- Inbox Item table + billing column fixes
-- Run in Supabase SQL Editor
-- ============================================================

-- Inbox items — dashboard overview of incoming SMS/calls/leads
CREATE TABLE IF NOT EXISTS inbox_item (
  inbox_item_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'call', 'lead', 'email')),
  customer_id TEXT,
  summary TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  related_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

