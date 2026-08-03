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
-- RLS-historik — RÄTTAD 2026-08-03 efter faktisk pg_policies-koll (den
-- tidigare versionen av denna kommentar gissade fel utifrån git-historik
-- istället för live-data — exakt den disciplin denna fil själv predikar):
--   sql/v2_pending_approvals.sql:30   — öppnade policyn USING(true) (bug)
--   sql/v4_pending_approvals_rls_fix.sql — stängde den (business-scopad,
--                                          5 separata policies)
--   sql/v15_autopilot.sql:24-26        — INNEHÅLLER kod som skulle återöppna
--                                          den, MEN Andreas pg_policies-koll
--                                          2026-08-03 visar att prod ALDRIG
--                                          fick den regressionen (v15:s
--                                          idempotenta block körde
--                                          sannolikt aldrig mot denna tabell,
--                                          eller kördes före v4 i praktiken).
--   → Nuvarande produktionsstate ÄR v4:s fem policies (owner_select/update
--     via business_config, team_select/update via business_users,
--     service_role) — redan korrekt business-scopat. INTE en akut
--     säkerhetslucka. Denna migration är alltså en KONSOLIDERING (5→2
--     policies, enhetlig is_active-koll) och infrastruktur för routing_role
--     — inte en brådskande fix av en läckande databas.
--
-- Server-routes (SUPABASE_SERVICE_ROLE_KEY, se lib/supabase.ts
-- getServerSupabase()) bypassar RLS helt oavsett policy — den här
-- ändringen påverkar ENDAST de dashboard-ytor som frågar pending_approvals
-- med anon-key direkt från klienten (idag: app/dashboard/approvals/page.tsx,
-- components/dashboard/IdagCore.tsx, components/projects/
-- ProjectApprovalsBlock.tsx, samt en fristående count-query i
-- app/dashboard/projects/[id]/page.tsx som INTE migreras i denna körning).
-- ============================================================

-- 1. Verifiera nuvarande policy INNAN du kör resten (redan gjort
--    2026-08-03 — bekräftat: v4:s fem policies, korrekt business-scopade,
--    inget qual='true'. Kör igen om det gått ett tag sedan förra kollen).
--
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'pending_approvals';

-- 1b. Backfill-koll INNAN du droppar owner_select/owner_update (steg 3
--     nedan): dessa två policies är ägarens ENDA väg in via business_config
--     (utan business_users-koppling). Om en ägare saknar en business_users-
--     rad låser vi ute den ägaren från sin egen godkännande-kö genom att
--     droppa dem. Förväntat resultat: 0 rader. Om raderna INTE är 0 —
--     STOPPA, säg till, kör inte resten förrän de företagen är backfyllda.
SELECT bc.business_id, bc.business_name, bc.user_id
FROM business_config bc
WHERE NOT EXISTS (
  SELECT 1 FROM business_users bu
  WHERE bu.business_id = bc.business_id AND bu.user_id = bc.user_id
);

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
-- rad för auth.uid(). is_active=true är ett TILLÄGG utöver planens
-- ordagranna EXISTS-exempel (som inte nämnde is_active) — motiveringen är
-- att lib/permissions.ts:124-146 getCurrentUser() (app-lagrets
-- motsvarighet) redan filtrerar på is_active=true, så RLS-bakstoppen
-- annars skulle vara SVAGARE än app-lagret för en inaktiverad anställd vars
-- Supabase-auth-konto fortfarande är giltigt.
--
-- RÄTTAD 2026-08-03: SELECT + UPDATE, INTE "FOR ALL". Det gamla v4-setet
-- (owner/team select+update) gav ALDRIG icke-service-role-användare
-- INSERT/DELETE via RLS — de operationerna föll tyst igenom till nekad,
-- eftersom ingen policy täckte dem. "FOR ALL" här hade varit en
-- kapacitetsUTÖKNING (vem som helst i businessen hade kunnat INSERTa/
-- DELETEa rader direkt via anon-key från webbläsarens devtools), inte en
-- ren konsolidering — appen skapar/raderar aldrig approvals klientsidan
-- (allt går via service-role-API:er), så det finns ingen anledning att
-- öppna den ytan som en bieffekt av denna migration.
CREATE POLICY "pending_approvals_business_select" ON pending_approvals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users
      WHERE business_users.business_id = pending_approvals.business_id
        AND business_users.user_id = auth.uid()
        AND business_users.is_active = true
    )
  );

CREATE POLICY "pending_approvals_business_update" ON pending_approvals
  FOR UPDATE
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
-- Förväntat: 3 policies (pending_approvals_service_role [ALL],
-- pending_approvals_business_select [SELECT],
-- pending_approvals_business_update [UPDATE]). Inga 'true'-policies kvar.
-- Testa gärna cross-business i SQL Editor med olika auth-kontext innan du
-- litar på detta i produktion (DoD-krav för Etapp 3a i planfilen).

-- 5. Verifiera routing_role-defaultet (ska visa 100% 'any' direkt efter körning)
SELECT routing_role, COUNT(*) AS antal
FROM pending_approvals
GROUP BY routing_role
ORDER BY antal DESC;
