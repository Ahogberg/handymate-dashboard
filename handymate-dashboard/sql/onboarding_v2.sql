-- Onboarding V2: Enhanced wizard with 6 steps
-- Run in Supabase SQL Editor

-- Add onboarding progress columns
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}';

-- Mark existing users who completed original onboarding as fully done (step 7)
UPDATE business_config SET onboarding_step = 7 WHERE onboarding_completed_at IS NOT NULL AND (onboarding_step IS NULL OR onboarding_step < 7);

-- Add service/pricing fields if missing
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS services_offered TEXT[] DEFAULT '{}';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS default_hourly_rate NUMERIC DEFAULT 0;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS callout_fee NUMERIC DEFAULT 0;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS rot_enabled BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS rut_enabled BOOLEAN DEFAULT false;

-- Add lead source tracking
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS lead_sources TEXT[] DEFAULT '{}';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS lead_email_address TEXT;
