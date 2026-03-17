-- V17: Smart Dispatch — skills + tilldelning
-- Kör manuellt i Supabase SQL Editor

-- 1. Skills på team-medlemmar
ALTER TABLE business_users
  ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

-- 2. Assigned_to på bokningar (saknas idag)
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS assigned_user_id TEXT;

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_business_users_skills ON business_users USING gin(skills);
