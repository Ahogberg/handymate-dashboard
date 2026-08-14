-- ============================================================================
-- v133 — Bränsle: självbetjänings-påfyllning av AI/API-kostnadsbudgeten
--
-- KÖRS MANUELLT I SUPABASE SQL EDITOR (eller via Supabase MCP). Aldrig
-- programmatiskt från appen.
--
-- ═══ VAD DEN HÄR TABELLEN ÄR ═══
--
-- fuel_ledger är en APPEND-ONLY logg över köpta bränsle-påfyllningar (Stripe
-- one-time payments, se app/api/billing/fuel-topup/route.ts). Den läggs
-- TILL basbudgeten för det rullande 30-dagarsfönstret i lib/costs/fuel.ts
-- — se den filen för hur.
--
-- ═══ ÄGARSKAPSGRÄNSEN (samma mönster som cost_event, v100) ═══
--
-- fuel_ledger är kommersiellt känslig (öresbelopp per kund) men INTE COGS —
-- den berättar vad KUNDEN köpt, inte vad VI betalar för deras förbrukning.
-- Ändå service-role-only: en påfyllningshistorik är inte något en anställd
-- utan ägar-/adminroll ska kunna läsa rått ur databasen, och kundens EGEN
-- vy går alltid via /api/billing/fuel (aggregerat, aldrig en rå tabell-läsning
-- från klienten).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fuel_ledger (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  -- Heltal öre, SEK. Samma disciplin som cost_event.cost_ore.
  amount_ore INTEGER NOT NULL,
  -- Alltid 'stripe_checkout' i denna version — inget admin-manuellt flöde.
  -- TEXT och inte enum av samma skäl som cost_event.resource: en ny källa
  -- ska inte kräva en migration.
  source TEXT NOT NULL DEFAULT 'stripe_checkout',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.fuel_ledger IS
  'Köpta bränsle-påfyllningar (Stripe one-time payment). Läggs till '
  'planens basbudget i det rullande 30-dagarsfönstret — se lib/costs/fuel.ts. '
  'Append-only. Service-role-only, samma nivå som cost_event (v100).';

CREATE INDEX IF NOT EXISTS idx_fuel_ledger_business_created
  ON public.fuel_ledger (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_ledger_stripe_session
  ON public.fuel_ledger (stripe_checkout_session_id);

-- ── RLS: internt, bara service_role (mönster identiskt med v100) ───────────

ALTER TABLE public.fuel_ledger ENABLE ROW LEVEL SECURITY;

DO $policy_cleanup$
DECLARE
  policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fuel_ledger'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.fuel_ledger', policy_name);
  END LOOP;
END
$policy_cleanup$;

CREATE POLICY fuel_ledger_service_role
  ON public.fuel_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- VERIFIERING efter körning
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'fuel_ledger';
--   -- förväntat: fuel_ledger | true
--   SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'fuel_ledger';
--   -- förväntat: exakt EN rad, fuel_ledger_service_role, {service_role}, ALL
-- ============================================================================
