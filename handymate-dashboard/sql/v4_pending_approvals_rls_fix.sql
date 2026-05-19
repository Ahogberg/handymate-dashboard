-- ============================================================
-- v4 — KRITISK: Fix pending_approvals RLS-läcka
--
-- Bug: sql/v2_pending_approvals.sql:30 hade policy:
--   CREATE POLICY pending_approvals_policy ON pending_approvals
--     FOR ALL USING (true) WITH CHECK (true);
--
-- Detta tillåter ANY autentiserad user att läsa/skriva approvals
-- för ALLA businesses. Cross-business data-läckage.
--
-- Sql/v15_autopilot.sql:26 har samma problem.
--
-- Fix: ersätt med samma pattern som business_knowledge (v_agent_observations.sql:94)
-- där användare bara ser sin egen business (owner via business_config eller
-- aktiv team-member via business_users).
--
-- Kör manuellt i Supabase SQL Editor INNAN launch 25 maj.
-- ============================================================

-- 1. Verifiera nuvarande policy (innan vi gör något)
--
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'pending_approvals';
--
-- Förväntat output: 1 rad med qual='true' och with_check='true' — det är bug.

-- 2. Drop gamla open policies
DROP POLICY IF EXISTS pending_approvals_policy ON pending_approvals;
DROP POLICY IF EXISTS "Enable read access for all users" ON pending_approvals;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON pending_approvals;
DROP POLICY IF EXISTS "Enable update for users based on email" ON pending_approvals;
DROP POLICY IF EXISTS "Enable all access" ON pending_approvals;

-- 3. Säkerställ att RLS är på
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;

-- 4. Service role bypassar allt (för cron-jobs + admin-routes)
CREATE POLICY "pending_approvals_service_role" ON pending_approvals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 5. Owner (business_config.user_id) ser sin egen business
CREATE POLICY "pending_approvals_owner_select" ON pending_approvals
  FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM business_config WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pending_approvals_owner_update" ON pending_approvals
  FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id FROM business_config WHERE user_id = auth.uid()
    )
  );

-- 6. Active team-members (business_users) ser sin business
CREATE POLICY "pending_approvals_team_select" ON pending_approvals
  FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM business_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "pending_approvals_team_update" ON pending_approvals
  FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id FROM business_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 7. Verifiering efter körning
--
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename = 'pending_approvals' ORDER BY policyname;
--
-- Förväntat: 5 rader med restriktiva policies (service_role +
-- owner_select/update + team_select/update). Inga 'true'-policies.
--
-- Test cross-business: logga in som user_A, kör SELECT, verifiera att
-- bara user_A's business pending_approvals returneras.
