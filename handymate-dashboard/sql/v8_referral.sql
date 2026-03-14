-- ============================================================
-- V8: Referralprogram — komplett (inkl. v2_referrals-grunden)
-- Kör manuellt i Supabase SQL Editor
-- ============================================================

-- 1. Business config — referral + Stripe-kolumner (från v2, idempotent)
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- 2. Referrals-tabell med alla kolumner (grund + V8-utökning)
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  referrer_business_id TEXT NOT NULL,
  referred_business_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',            -- 'pending' | 'active' | 'rewarded'
  referrer_type TEXT DEFAULT 'customer',    -- 'customer' | 'partner'
  partner_name TEXT,
  referred_email TEXT,
  referrer_discount_applied_at TIMESTAMPTZ,
  partner_commission_sek INTEGER,
  partner_commission_paid_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_business_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_policy ON referrals;
CREATE POLICY referrals_policy ON referrals FOR ALL USING (true) WITH CHECK (true);

-- 3. Om tabellen redan fanns (från v2) — lägg till saknade kolumner
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_type TEXT DEFAULT 'customer';
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS partner_name TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_email TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_discount_applied_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS partner_commission_sek INTEGER;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS partner_commission_paid_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS rewarded_at TIMESTAMPTZ;

-- 4. Rabatt-spårning i v3_automation_settings
ALTER TABLE v3_automation_settings
  ADD COLUMN IF NOT EXISTS referral_discount_pending JSONB,
  ADD COLUMN IF NOT EXISTS referral_reminder_last_sent TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referral_reminder_count INTEGER DEFAULT 0;

-- Kommentar:
-- referral_discount_pending: { "percent": 50, "expires_at": "2026-04-14T..." } eller null
-- referral_reminder_last_sent: senaste morgonrapport-påminnelse
-- referral_reminder_count: antal påminnelser skickade (max 3 om ingen konverterat)
