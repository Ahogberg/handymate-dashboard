-- v122_customer_fact.sql (2026-08-12)
--
-- Customer Facts V1 — "säg-det-en-gång-minnet".
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor.
--
-- ═══ VARFÖR ═══
--
-- Mötesanalysen (app/api/voice/analyze/route.ts, arMote-grenen) extraherar
-- EXPLICIT sagda kundfakta — preferenser, begränsningar, löften och
-- kontaktfakta — som granskningsbara kort med ordagrant citat
-- (approval_type='customer_fact', se lib/approvals/action-contract.ts).
-- Godkännande skriver EN rad här. Ingen ambient extraktion: allt går genom
-- ett kort en människa godkänt.
--
-- Konsumenter dag 1: Mattes kundkontext (lib/matte/resolver.ts), kundkortet
-- (app/dashboard/customers/[id]/page.tsx) och kundtidslinjen
-- (app/api/customers/[id]/timeline/route.ts). Alla tre läser fail-safe —
-- ett fel eller en saknad tabell ger tom lista, aldrig en trasig sida.
--
-- Mönstret är identiskt med sql/v101_tenant_rls_projektdomanen.sql: två
-- policyer — tenant-medlemmen (via is_business_member) och service_role.

CREATE TABLE IF NOT EXISTS public.customer_fact (
  id TEXT PRIMARY KEY DEFAULT ('cfact_' || replace(gen_random_uuid()::text, '-', '')),
  business_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  fact_type TEXT NOT NULL CHECK (fact_type IN ('preference', 'constraint', 'commitment', 'contact')),
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'meeting',
  source_id TEXT,
  evidence_quote TEXT,
  confidence NUMERIC,
  superseded_by TEXT REFERENCES public.customer_fact(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.customer_fact IS
  'Säg-det-en-gång-minnet: explicit sagda kundfakta godkända via ett kort (approval_type=customer_fact). Aldrig ambient extraktion.';
COMMENT ON COLUMN public.customer_fact.evidence_quote IS
  'Ordagrant citat ur mötestranskriptet som fyndet bygger på.';
COMMENT ON COLUMN public.customer_fact.superseded_by IS
  'Sätts till ETT AV TVÅ: (1) ett nyare faktums id — automatisk supersede vid godkännande, bara för fact_type contact/commitment (app/api/approvals/[id]/route.ts, case customer_fact — preference/constraint superseder aldrig automatiskt, en kund kan ha flera samtidigt); (2) radens EGET id — manuellt borttagen via kundkortets papperskorg-knapp (DELETE app/api/customers/[id]/facts/route.ts). Läsvägarna filtrerar alltid på superseded_by IS NULL. Dokumentation uppdaterad 2026-08-12 — kräver ingen ny körning, kolumnen finns redan.';

CREATE INDEX IF NOT EXISTS idx_customer_fact_business_customer
  ON public.customer_fact (business_id, customer_id);

-- ── RLS: exakt v101-mönstret ──────────────────────────────────────────────

ALTER TABLE public.customer_fact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_fact_tenant_member ON public.customer_fact;
CREATE POLICY customer_fact_tenant_member
  ON public.customer_fact
  FOR ALL
  TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS customer_fact_service_role ON public.customer_fact;
CREATE POLICY customer_fact_service_role
  ON public.customer_fact
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.customer_fact FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_fact TO authenticated;
GRANT ALL ON TABLE public.customer_fact TO service_role;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
-- SELECT policyname, roles, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'customer_fact';
--   → customer_fact_tenant_member (authenticated) + customer_fact_service_role (service_role)
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'customer_fact' AND grantee IN ('anon');
--   → noll rader
--
-- Ögonkontroll efteråt: godkänn ett customer_fact-kort i Inkorgen och
-- SELECT * FROM customer_fact ORDER BY created_at DESC LIMIT 5;
