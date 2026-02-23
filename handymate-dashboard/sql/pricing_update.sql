-- Pricing Update: Add plan column + update billing plans
-- Run in Supabase SQL Editor

-- Add plan column to business_config
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'business'));

-- Update existing users: sync plan from billing_plan or subscription_plan (if columns exist)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'billing_plan') THEN
    EXECUTE '
      UPDATE business_config
      SET plan = CASE
        WHEN LOWER(COALESCE(billing_plan, ''starter'')) = ''professional'' THEN ''professional''
        WHEN LOWER(COALESCE(billing_plan, ''starter'')) = ''business'' THEN ''business''
        ELSE ''starter''
      END
      WHERE plan IS NULL OR plan = ''starter''
    ';
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'subscription_plan') THEN
    EXECUTE '
      UPDATE business_config
      SET plan = CASE
        WHEN LOWER(COALESCE(subscription_plan, ''starter'')) = ''professional'' THEN ''professional''
        WHEN LOWER(COALESCE(subscription_plan, ''starter'')) = ''business'' THEN ''business''
        ELSE ''starter''
      END
      WHERE plan IS NULL OR plan = ''starter''
    ';
  END IF;
END $$;

-- Update billing_plan table prices (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plan') THEN
    UPDATE billing_plan SET price_sek = 2495 WHERE id = 'starter';
    UPDATE billing_plan SET price_sek = 5995 WHERE id = 'professional';
    UPDATE billing_plan SET price_sek = 11995 WHERE id = 'business';

    -- Update limits
    UPDATE billing_plan SET limits = jsonb_set(limits, '{calls}', '100') WHERE id = 'starter';
    UPDATE billing_plan SET limits = jsonb_set(limits, '{calls}', '400') WHERE id = 'professional';
    UPDATE billing_plan SET limits = jsonb_set(limits, '{calls}', '999999') WHERE id = 'business';
  END IF;
END $$;
