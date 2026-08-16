-- v139: Business Twin Watch & Verify V1
--
-- KÖRS MANUELLT i Supabase SQL Editor före kodens bevakningsknapp aktiveras.
-- Tabellen lagrar en serveromräknad projektmarginalprognos och det senare,
-- kvalitetsgrindade projektutfallet. Den är INTE en generell scenario- eller
-- eventplattform.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_config') IS NULL
     OR to_regclass('public.business_users') IS NULL
     OR to_regclass('public.project') IS NULL
     OR to_regclass('public.project_outcome') IS NULL THEN
    RAISE EXCEPTION 'v139 kräver business_config, business_users, project och project_outcome';
  END IF;
END $$;

DO $$
BEGIN
  IF (
    SELECT COUNT(DISTINCT column_name)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_outcome'
      AND column_name IN (
        'calculation_version',
        'financial_learning_eligible',
        'learning_blockers',
        'realized_margin_kr',
        'realized_margin_pct',
        'closed_at'
      )
  ) <> 6 THEN
    RAISE EXCEPTION 'v139 kräver att v138_outcome_quality_gate.sql är körd först';
  END IF;
END $$;

CREATE TABLE public.business_twin_forecast (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL
    REFERENCES public.project(project_id) ON DELETE CASCADE,
  created_by_business_user_id TEXT
    REFERENCES public.business_users(id) ON DELETE SET NULL,

  -- V1 har medvetet bara ett utfall med entydigt facit. Kassa/årstakt saknar
  -- ännu en definierad observationsperiod och får därför inte verifieras här.
  scenario_kind TEXT NOT NULL DEFAULT 'project_margin'
    CHECK (scenario_kind = 'project_margin'),
  scenario_version INTEGER NOT NULL
    CHECK (scenario_version = 1),
  fingerprint TEXT NOT NULL,
  request_snapshot JSONB NOT NULL,
  scenario_snapshot JSONB NOT NULL,
  predicted_margin_kr NUMERIC NOT NULL,
  predicted_margin_pct NUMERIC NOT NULL,

  status TEXT NOT NULL DEFAULT 'watching'
    CHECK (status IN ('watching', 'verified', 'unverifiable')),
  project_outcome_id TEXT
    REFERENCES public.project_outcome(id) ON DELETE SET NULL,
  actual_margin_kr NUMERIC,
  actual_margin_pct NUMERIC,
  -- Signerad avvikelse = faktiskt minus prognos. Positivt är bättre utfall.
  margin_error_kr NUMERIC,
  margin_error_pp NUMERIC,
  lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  verification_blocker TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  CONSTRAINT business_twin_forecast_state_check CHECK (
    (
      status = 'watching'
      AND project_outcome_id IS NULL
      AND actual_margin_pct IS NULL
      AND verification_blocker IS NULL
      AND resolved_at IS NULL
    )
    OR
    (
      status = 'verified'
      AND project_outcome_id IS NOT NULL
      AND actual_margin_pct IS NOT NULL
      AND margin_error_pp IS NOT NULL
      AND lead_time_days IS NOT NULL
      AND verification_blocker IS NULL
      AND resolved_at IS NOT NULL
    )
    OR
    (
      status = 'unverifiable'
      AND project_outcome_id IS NOT NULL
      AND actual_margin_pct IS NULL
      AND margin_error_pp IS NULL
      AND verification_blocker IS NOT NULL
      AND resolved_at IS NOT NULL
    )
  ),
  CONSTRAINT business_twin_forecast_fingerprint_unique
    UNIQUE (business_id, fingerprint)
);

CREATE INDEX idx_business_twin_forecast_project_status
  ON public.business_twin_forecast (business_id, project_id, status);

ALTER TABLE public.business_twin_forecast ENABLE ROW LEVEL SECURITY;

-- All åtkomst går via owner/admin-grindad serverroute eller den kanoniska
-- projektstängningen. Marginalprognoser exponeras aldrig direkt till en
-- authenticated-klient.
REVOKE ALL ON TABLE public.business_twin_forecast FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_twin_forecast TO service_role;

CREATE POLICY business_twin_forecast_service_role
  ON public.business_twin_forecast
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

COMMENT ON TABLE public.business_twin_forecast IS
  'Serveromräknade projektmarginalprognoser som senare jämförs med kvalitetsgrindat project_outcome.';
COMMENT ON COLUMN public.business_twin_forecast.scenario_snapshot IS
  'Oföränderligt BusinessScenarioResult från samma deterministiska motor som visades för ägaren.';
COMMENT ON COLUMN public.business_twin_forecast.margin_error_pp IS
  'Faktisk realiserad marginalprocent minus prognostiserad marginalprocent.';

-- MANUELL VERIFIERING EFTER KÖRNING:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='business_twin_forecast'
--   ORDER BY ordinal_position;
-- SELECT policyname, roles, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename='business_twin_forecast';
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name='business_twin_forecast';

COMMIT;
