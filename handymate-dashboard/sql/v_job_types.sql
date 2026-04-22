-- Jobbtyper som förstklassigt objekt + team-specialiteter
-- Kör manuellt i Supabase SQL Editor

-- 1. Jobbtyper per företag
CREATE TABLE IF NOT EXISTS job_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT DEFAULT '#0F766E',
  icon TEXT,
  default_hourly_rate NUMERIC(10, 2),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_job_types_business ON job_types(business_id, is_active);

ALTER TABLE job_types ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_job_types' AND tablename = 'job_types') THEN
    CREATE POLICY service_job_types ON job_types FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_job_types' AND tablename = 'job_types') THEN
    CREATE POLICY user_job_types ON job_types
      FOR ALL USING (
        business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- 2. Specialiteter per teammedlem — array av job_types.slug
ALTER TABLE business_users
  ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_business_users_specialties
  ON business_users USING GIN(specialties);

-- 3. Säkerställ deal.assigned_to (kanske finns redan)
ALTER TABLE deal
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;

CREATE INDEX IF NOT EXISTS idx_deal_assigned_to
  ON deal(business_id, assigned_to) WHERE assigned_to IS NOT NULL;
