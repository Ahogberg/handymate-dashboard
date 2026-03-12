-- ============================================================
-- V2: Push Subscriptions — Web Push VAPID
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_business ON push_subscriptions(business_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_policy ON push_subscriptions;
CREATE POLICY push_subscriptions_policy ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);
