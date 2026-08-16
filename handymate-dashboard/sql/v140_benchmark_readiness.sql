-- v140: Business Twin Benchmark Readiness V1
-- Kör MANUELLT i Supabase SQL Editor före inställningsytan aktiveras.
--
-- V1 lagrar endast ett uttryckligt, återkalleligt samtycke. Ingen
-- tvärtenant-aggregering och ingen kopia av project_outcome skapas här.

DO $$
BEGIN
  IF to_regclass('public.business_config') IS NULL
     OR to_regclass('public.business_users') IS NULL THEN
    RAISE EXCEPTION 'v140 kräver business_config och business_users';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_config'
      AND column_name = 'is_demo_tenant'
  ) THEN
    RAISE EXCEPTION 'v140 kräver is_demo_tenant från v99_demo_reset_transaction.sql';
  END IF;
END $$;

ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS benchmark_consent_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS benchmark_consent_version TEXT,
  ADD COLUMN IF NOT EXISTS benchmark_consent_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.benchmark_consent_audit (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  actor_business_user_id TEXT REFERENCES public.business_users(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL,
  consent_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_consent_audit_business_created
  ON public.benchmark_consent_audit(business_id, created_at DESC);

ALTER TABLE public.benchmark_consent_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_benchmark_consent_audit ON public.benchmark_consent_audit;
CREATE POLICY service_benchmark_consent_audit
  ON public.benchmark_consent_audit
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.benchmark_consent_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.benchmark_consent_audit TO service_role;

CREATE OR REPLACE FUNCTION public.set_benchmark_consent(
  p_business_id TEXT,
  p_actor_business_user_id TEXT,
  p_enabled BOOLEAN,
  p_consent_version TEXT
)
RETURNS TABLE (
  enabled BOOLEAN,
  consent_version TEXT,
  changed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_demo BOOLEAN;
  v_actor_role TEXT;
  v_changed_at TIMESTAMPTZ := NOW();
BEGIN
  IF p_business_id IS NULL OR btrim(p_business_id) = ''
     OR p_actor_business_user_id IS NULL OR btrim(p_actor_business_user_id) = ''
     OR p_enabled IS NULL
     OR p_consent_version IS NULL OR btrim(p_consent_version) = '' THEN
    RAISE EXCEPTION 'Ogiltigt benchmark-samtycke' USING ERRCODE = '22023';
  END IF;
  IF p_consent_version <> 'benchmark-readiness-v1' THEN
    RAISE EXCEPTION 'Okänd version av benchmark-samtycket' USING ERRCODE = '22023';
  END IF;

  -- Hård demo-grind före varje UPDATE/INSERT. Syntetisk demodata får aldrig
  -- bli underlag för framtida branschstatistik.
  SELECT bc.is_demo_tenant
  INTO v_is_demo
  FROM public.business_config bc
  WHERE bc.business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Företaget finns inte' USING ERRCODE = '22023';
  END IF;
  IF v_is_demo IS TRUE THEN
    RAISE EXCEPTION 'Demo-företag får inte bidra till benchmark' USING ERRCODE = '42501';
  END IF;

  SELECT bu.role
  INTO v_actor_role
  FROM public.business_users bu
  WHERE bu.id = p_actor_business_user_id
    AND bu.business_id = p_business_id
    AND bu.is_active IS TRUE;

  IF NOT FOUND OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Endast owner/admin får ändra benchmark-samtycke'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.business_config
  SET benchmark_consent_enabled = p_enabled,
      benchmark_consent_version = CASE WHEN p_enabled THEN p_consent_version ELSE NULL END,
      benchmark_consent_changed_at = v_changed_at
  WHERE business_id = p_business_id;

  INSERT INTO public.benchmark_consent_audit (
    business_id,
    actor_business_user_id,
    enabled,
    consent_version,
    created_at
  ) VALUES (
    p_business_id,
    p_actor_business_user_id,
    p_enabled,
    p_consent_version,
    v_changed_at
  );

  RETURN QUERY
  SELECT
    p_enabled,
    CASE WHEN p_enabled THEN p_consent_version ELSE NULL END,
    v_changed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_benchmark_consent(TEXT, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_benchmark_consent(TEXT, TEXT, BOOLEAN, TEXT)
  TO service_role;

COMMENT ON COLUMN public.business_config.benchmark_consent_enabled IS
  'Explicit opt-in till framtida aggregerad branschstatistik. FALSE som default och omedelbart återkalleligt.';
COMMENT ON TABLE public.benchmark_consent_audit IS
  'Smal revisionslogg över opt-in/opt-out. Innehåller inga projekt- eller kunddata.';
