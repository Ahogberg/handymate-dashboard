-- V9: Partnerportal — partners-tabell + referrals-utökning
-- Kör manuellt i Supabase SQL Editor

-- 1. Partners-tabell
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  password_hash TEXT NOT NULL,

  referral_code TEXT UNIQUE NOT NULL,
  referral_url TEXT,

  commission_rate FLOAT DEFAULT 0.20,
  total_earned_sek INTEGER DEFAULT 0,
  total_pending_sek INTEGER DEFAULT 0,

  status TEXT DEFAULT 'pending_approval', -- 'pending_approval' | 'active' | 'suspended'
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_partners_code ON partners(referral_code);
CREATE INDEX IF NOT EXISTS idx_partners_email ON partners(email);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partners_policy ON partners;
CREATE POLICY partners_policy ON partners FOR ALL USING (true) WITH CHECK (true);

-- 2. Utöka referrals-tabellen med partner-koppling + provisions-spårning
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id),
  ADD COLUMN IF NOT EXISTS commission_month INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS subscription_amount_sek INTEGER DEFAULT 0;

-- 3. Index för partner-lookups
CREATE INDEX IF NOT EXISTS idx_referrals_partner ON referrals(partner_id);
