-- =========================================
-- HANDYMATE - ANVÄNDARHANTERING & TEAM
-- business_users, project_assignments
-- Kan köras flera gånger utan problem
-- =========================================


-- 1. BUSINESS_USERS - Teammedlemmar per företag
-- =========================================
CREATE TABLE IF NOT EXISTS business_users (
  id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL DEFAULT 'employee',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  title TEXT,
  hourly_cost NUMERIC,
  hourly_rate NUMERIC,
  color TEXT DEFAULT '#3B82F6',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  can_see_all_projects BOOLEAN DEFAULT false,
  can_see_financials BOOLEAN DEFAULT false,
  can_manage_users BOOLEAN DEFAULT false,
  can_approve_time BOOLEAN DEFAULT false,
  can_create_invoices BOOLEAN DEFAULT false,
  invite_token TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, email)
);

DROP INDEX IF EXISTS idx_business_users_business;
CREATE INDEX idx_business_users_business ON business_users(business_id);
DROP INDEX IF EXISTS idx_business_users_user;
CREATE INDEX idx_business_users_user ON business_users(user_id);
DROP INDEX IF EXISTS idx_business_users_invite;
CREATE INDEX idx_business_users_invite ON business_users(invite_token);
DROP INDEX IF EXISTS idx_business_users_active;
CREATE INDEX idx_business_users_active ON business_users(business_id) WHERE is_active = true;

ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_users_all" ON business_users;
CREATE POLICY "business_users_all" ON business_users FOR ALL USING (true) WITH CHECK (true);


-- 2. PROJECT_ASSIGNMENTS - Tilldelning av användare till projekt
-- =========================================
CREATE TABLE IF NOT EXISTS project_assignment (
  id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  business_user_id TEXT NOT NULL REFERENCES business_users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by TEXT REFERENCES business_users(id) ON DELETE SET NULL
);

DROP INDEX IF EXISTS idx_project_assignment_project;
CREATE INDEX idx_project_assignment_project ON project_assignment(project_id);
DROP INDEX IF EXISTS idx_project_assignment_user;
CREATE INDEX idx_project_assignment_user ON project_assignment(business_user_id);
DROP INDEX IF EXISTS idx_project_assignment_business;
CREATE INDEX idx_project_assignment_business ON project_assignment(business_id);

ALTER TABLE project_assignment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_assignment_all" ON project_assignment;
CREATE POLICY "project_assignment_all" ON project_assignment FOR ALL USING (true) WITH CHECK (true);


-- 3. UTÖKA TIME_ENTRY med business_user_id
-- =========================================
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS business_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_time_entry_business_user ON time_entry(business_user_id);


-- 4. MIGRATION: Skapa owner-rad för befintliga konton
-- =========================================
INSERT INTO business_users (business_id, user_id, role, name, email, accepted_at,
  can_see_all_projects, can_see_financials, can_manage_users,
  can_approve_time, can_create_invoices)
SELECT
  bc.business_id,
  bc.user_id,
  'owner',
  COALESCE(bc.contact_name, bc.business_name, 'Ägare'),
  COALESCE(bc.contact_email, ''),
  NOW(),
  true, true, true, true, true
FROM business_config bc
WHERE bc.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.business_id = bc.business_id
    AND bu.role = 'owner'
  );


SELECT 'Business users migration completed' as status;
