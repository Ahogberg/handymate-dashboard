-- ============================================================
-- V2: Stripe + Referral system
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  referrer_business_id TEXT NOT NULL,
  referred_business_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'active', 'rewarded'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_business_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_policy ON referrals;
CREATE POLICY referrals_policy ON referrals FOR ALL USING (true) WITH CHECK (true);
