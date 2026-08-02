-- ============================================================
-- v77 — Etapp 3a (tasks/multi-employee-parity-plan.md): kö-routing
-- infrastruktur för pending_approvals.
-- Kör manuellt i Supabase SQL Editor.
--
-- Bakgrund: pending_approvals har idag INGEN routing-kolumn — varje
-- inloggad anställd ser och kan agera på VARJE kort för sitt business,
-- inklusive finansiella (fakturor, offerter) och löne-typer (tidattestering).
-- Denna migration lägger bara INFRASTRUKTUREN (kolumner + en grov RLS-
-- bakstopp). Vilken approval_type som hör till vilken bucket (per-typ-
-- routing) är Etapp 3b — en SENARE körning. Default 'any' på routing_role
-- => NOLL beteendeförändring för befintliga rader vid denna deploy.
--
-- RLS-historik (viktigt att förstå innan du kör detta — hittat vid
-- kodgranskning, INTE en live-DB-fråga):
--   sql/v2_pending_approvals.sql:30   — öppnade policyn USING(true) (bug)
--   sql/v4_pending_approvals_rls_fix.sql — stängde den (business-scopad,
--                                          5 separata policies)
--   sql/v15_autopilot.sql:24-26        — DROP:ade v4:s policies igen och
--                                          återskapade USING(true)
--                                          (sannolikt oavsiktlig regression
--                                          — filen kör en idempotent
--                                          CREATE TABLE IF NOT EXISTS-setup
--                                          som kopierade v2:s ursprungliga
--                                          policy utan att veta att v4 redan
--                                          hade skärpt den).
--   → Nuvarande produktionsstate är alltså sannolikt USING(true) igen,
--     dvs INTE ens business-scopad. Steg 1 nedan verifierar detta faktiskt
--     innan resten körs.
--
-- Server-routes (SUPABASE_SERVICE_ROLE_KEY, se lib/supabase.ts
-- getServerSupabase()) bypassar RLS helt oavsett policy — den här
-- ändringen påverkar ENDAST de dashboard-ytor som frågar pending_approvals
-- med anon-key direkt från klienten (idag: app/dashboard/approvals/page.tsx,
-- components/dashboard/IdagCore.tsx, components/projects/
-- ProjectApprovalsBlock.tsx, samt en fristående count-query i
-- app/dashboard/projects/[id]/page.tsx som INTE migreras i denna körning).
-- ============================================================

-- 1. Verifiera nuvarande policy INNAN du kör resten (för din egen skull):
--
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'pending_approvals';
--
-- Om qual='true' här bekräftar det regressionen ovan.

-- 2. Nya kolumner (idempotent, ingen beteendeförändring — default 'any')
ALTER TABLE pending_approvals ADD COLUMN IF NOT EXISTS routing_role TEXT DEFAULT 'any';
ALTER TABLE pending_approvals ADD COLUMN IF NOT EXISTS routed_business_user_id TEXT REFERENCES business_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pending_approvals_routing
  ON pending_approvals(business_id, routing_role) WHERE status = 'pending';

-- 3. RLS — grov bakstopp. Stänger "inte ens business-scopad i databasen".
-- Per-typ-routing (vem inom businessen som får agera på VILKEN typ) ligger
-- MEDVETET i appkod (lib/approvals/routing.ts, canActOnApproval) — inte
-- här. Att koda hela per-typ-tabellen i RLS-policyn hade blivit fragilt
-- och svårtestat (t.ex. JSONB-payload-uppslag mot project_assignment för
-- project_team-bucketen), och hade behövt synkas manuellt med appkoden vid
-- varje ändring i Etapp 3b. RLS-policyn ska bara svara på EN fråga:
-- "tillhör den här personen överhuvudtaget detta business?"
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_approvals_policy ON pending_approvals;
DROP POLICY IF EXISTS "Enable read access for all users" ON pending_approvals;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON pending_approvals;
DROP POLICY IF EXISTS "Enable update for users based on email" ON pending_approvals;
DROP POLICY IF EXISTS "Enable all access" ON pending_approvals;
DROP POLICY IF EXISTS "pending_approvals_service_role" ON pending_approvals;
DROP POLICY IF EXISTS "pending_approvals_owner_select" ON pending_approvals;
DROP POLICY IF EXISTS "pending_approvals_owner_update" ON pending_approvals;
DROP POLICY IF EXISTS "pending_approvals_team_select" ON pending_approvals;
DROP POLICY IF EXISTS "pending_approvals_team_update" ON pending_approvals;

-- Service role (cron-jobs, alla API-routes via getServerSupabase()) bypassar
-- RLS ändå på Supabase — denna policy är bara explicit dokumentation/
-- defense-in-depth, ingen funktionell skillnad.
CREATE POLICY "pending_approvals_service_role" ON pending_approvals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Business-scopad bakstopp: business_id måste matcha en AKTIV business_users-
-- rad för auth.uid(). OBS mot planspecen: business_users.sql (steg 4) har
-- redan backfyllt en 'owner'-rad i business_users för varje
-- business_config.user_id — så till skillnad från v4:s separata
-- owner-via-business_config-policy räcker EN EXISTS-klausul mot
-- business_users här. is_active=true är ett TILLÄGG utöver planens
-- ordagranna EXISTS-exempel (som inte nämnde is_active) — motiveringen är
-- att lib/permissions.ts:124-146 getCurrentUser() (app-lagrets
-- motsvarighet) redan filtrerar på is_active=true, så RLS-bakstoppen
-- annars skulle vara SVAGARE än app-lagret för en inaktiverad anställd vars
-- Supabase-auth-konto fortfarande är giltigt. Flaggat i körrapporten för
-- extra granskning.
CREATE POLICY "pending_approvals_business_scoped" ON pending_approvals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM business_users
      WHERE business_users.business_id = pending_approvals.business_id
        AND business_users.user_id = auth.uid()
        AND business_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_users
      WHERE business_users.business_id = pending_approvals.business_id
        AND business_users.user_id = auth.uid()
        AND business_users.is_active = true
    )
  );

-- 4. Verifiering efter körning
--
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename = 'pending_approvals' ORDER BY policyname;
--
-- Förväntat: 2 policies (pending_approvals_service_role +
-- pending_approvals_business_scoped). Inga 'true'-policies kvar. Testa
-- gärna cross-business i SQL Editor med olika auth-kontext innan du litar
-- på detta i produktion (DoD-krav för Etapp 3a i planfilen).

-- 5. Verifiera routing_role-defaultet (ska visa 100% 'any' direkt efter körning)
SELECT routing_role, COUNT(*) AS antal
FROM pending_approvals
GROUP BY routing_role
ORDER BY antal DESC;
