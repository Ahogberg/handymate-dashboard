-- V96: tenant-isolering för N2 + server-only Fortnox-kredentialer
-- KÖRS MANUELLT i Supabase SQL Editor efter oberoende DB-granskning.
-- Produktionsinventering före ändring:
-- docs/security/production-rls-snapshot-2026-08-07.md

BEGIN;

-- Fortnox-hemligheter får inte ligga på business_config, som läses från
-- webbläsarkod. Den nya tabellen är endast åtkomlig för service_role.
CREATE TABLE IF NOT EXISTS public.business_integration_credentials (
  business_id TEXT PRIMARY KEY
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  fortnox_access_token TEXT,
  fortnox_refresh_token TEXT,
  fortnox_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.business_integration_credentials (
  business_id,
  fortnox_access_token,
  fortnox_refresh_token,
  fortnox_token_expires_at
)
SELECT
  business_id,
  fortnox_access_token,
  fortnox_refresh_token,
  fortnox_token_expires_at
FROM public.business_config
WHERE fortnox_access_token IS NOT NULL
   OR fortnox_refresh_token IS NOT NULL
ON CONFLICT (business_id) DO UPDATE SET
  fortnox_access_token = EXCLUDED.fortnox_access_token,
  fortnox_refresh_token = EXCLUDED.fortnox_refresh_token,
  fortnox_token_expires_at = EXCLUDED.fortnox_token_expires_at,
  updated_at = NOW();

ALTER TABLE public.business_integration_credentials ENABLE ROW LEVEL SECURITY;

DO $policy_cleanup$
DECLARE
  policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_integration_credentials'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.business_integration_credentials',
      policy_name
    );
  END LOOP;
END
$policy_cleanup$;

CREATE POLICY business_integration_credentials_service_role
  ON public.business_integration_credentials
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.business_integration_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_integration_credentials TO service_role;

-- Ta bort hemlighetskolumnerna helt efter kopieringen. Därmed kan ett
-- table-level SELECT på business_config aldrig exponera dem av misstag.
ALTER TABLE public.business_config
  DROP COLUMN IF EXISTS fortnox_access_token,
  DROP COLUMN IF EXISTS fortnox_refresh_token,
  DROP COLUMN IF EXISTS fortnox_token_expires_at;

-- Medlemskapet stöder både aktiva business_users och de fyra observerade
-- produktionskonton där ägaren ännu endast finns som business_config.user_id.
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

-- Ersätt samtliga befintliga policyer. Produktionssnapshoten visade en
-- villkorslöst öppen public-policy på alla sex tabeller.
DO $rls_hardening$
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
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
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
$rls_hardening$;

COMMIT;

-- Manuell verifiering efter körning (returnerar ingen hemlighetsdata):
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'project', 'project_change', 'project_material', 'time_entry',
    'supplier_invoices', 'business_config', 'business_integration_credentials'
  )
ORDER BY tablename, policyname;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'project', 'project_change', 'project_material', 'time_entry',
    'supplier_invoices', 'business_config', 'business_integration_credentials'
  )
ORDER BY table_name, grantee, privilege_type;
