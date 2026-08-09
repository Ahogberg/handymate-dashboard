-- ═══════════════════════════════════════════════════════════════════════════
-- Testbädd för cross-tenant-provet (tests/tenant-isolation.integration.spec.ts)
-- (2026-08-09 — stänger roadmapens grind "disponibel tvåtenantmiljö saknas")
--
-- KÖRS I EN DISPONIBEL SUPABASE-INSTANS — ALDRIG I PRODUKTION.
-- Skapa ett nytt gratis Supabase-projekt, klistra in hela filen i SQL Editor.
--
-- ═══ VARFÖR FILEN FINNS ═══
--
-- Cross-tenant-provet är den enda körbara verifieringen av v96:s RLS — men
-- det har aldrig kunnat köras: business_config har ingen CREATE TABLE
-- någonstans i sql/ (tabellen föddes i Supabase-dashboarden en gång i tiden).
-- Den här filen är en SJÄLVFÖRSÖRJANDE miniatyr av prod-schemat: exakt de
-- sex tabellerna provet mäter, med exakt de kolumner provets fixtures och
-- v96:s policyer rör. Inte en kopia av prod — en testbädd för RLS-beviset.
--
-- Kolumnkontraktet kommer ur testets fixtureRows()/UPDATE_PATCH. Ändras
-- testet, uppdatera här — facit i tests/testbadden.spec.ts håller dem i synk.
--
-- ═══ EFTER KÖRNINGEN ═══
--
-- 1. Skapa TVÅ Auth-användare i dashboarden (Authentication → Add user,
--    valfria mail + lösenord, bekräfta direkt).
-- 2. Kör seed-blocket längst ner med deras user-id:n (syns i Auth-listan).
-- 3. Fyll .env.integration (kopiera .env.integration.example) och kör:
--       npm run test:tenant-isolation
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Tabellerna — minimala men verkliga: PK, tenantkolumn, fixture-fälten ──

CREATE TABLE IF NOT EXISTS public.business_config (
  business_id TEXT PRIMARY KEY,
  -- Ägarens auth-uid. is_business_member fallbackar hit (v96) för konton
  -- som saknar business_users-rad — samma beteende som prod.
  user_id UUID,
  business_name TEXT NOT NULL,
  contact_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project (
  project_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_change (
  change_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT,
  change_type TEXT,
  description TEXT,
  amount NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_material (
  material_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT,
  quantity NUMERIC,
  unit TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.time_entry (
  time_entry_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT,
  description TEXT,
  work_date DATE,
  duration_minutes INTEGER,
  is_billable BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT,
  supplier_name TEXT,
  amount_excl_vat NUMERIC,
  vat_amount NUMERIC,
  total_amount NUMERIC,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Medlemsfunktionen — ordagrant v96:s definition ──

CREATE OR REPLACE FUNCTION public.is_business_member(target_business_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.business_users AS bu
        WHERE bu.business_id = target_business_id
          AND bu.user_id::TEXT = auth.uid()::TEXT
          AND bu.is_active IS TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_config AS bc
        WHERE bc.business_id = target_business_id
          AND bc.user_id::TEXT = auth.uid()::TEXT
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.is_business_member(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_member(TEXT) TO authenticated, service_role;

-- ── Härdningen — samma DO-block som v96 (sex tabeller, två policyer var) ──

DO $rls_testbed$
DECLARE
  target_table TEXT;
  policy_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'project',
    'project_change',
    'project_material',
    'time_entry',
    'supplier_invoices',
    'business_config'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    FOR policy_name IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, target_table);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id))',
      target_table || '_tenant_member',
      target_table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      target_table || '_service_role',
      target_table
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', target_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', target_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', target_table);
  END LOOP;
END
$rls_testbed$;

-- business_users skyddas också — den definierar medlemskapet självt.
ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_users_service_role ON public.business_users;
CREATE POLICY business_users_service_role
  ON public.business_users FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.business_users FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_users TO service_role;

COMMIT;

-- ═══ SEED — kör EFTER att du skapat de två Auth-användarna ═══
--
-- Ersätt uid-platshållarna med de riktiga user-id:na från Auth-listan.
-- Företags-id:n är avsiktligt uppenbart disponibla.
--
-- INSERT INTO public.business_config (business_id, user_id, business_name, contact_email) VALUES
--   ('rls_test_biz_a', 'UID_FOR_ANVANDARE_A', 'RLS-testbolag A', 'a@example.test'),
--   ('rls_test_biz_b', 'UID_FOR_ANVANDARE_B', 'RLS-testbolag B', 'b@example.test');
--
-- Verifiering: båda raderna finns och funktionen är SECURITY DEFINER.
-- SELECT business_id, business_name FROM public.business_config;
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'is_business_member';
