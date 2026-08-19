-- v157: OperatingExperiment — Etapp 1 (Adaptive Business Twin, Lars-piloten)
--
-- KÖRS MANUELLT i Supabase SQL Editor. Kräver project_outcome (v73+v138).
--
-- ═══ BAKGRUND ═══
--
-- docs/council/ACTIVE_ROADMAP.md, "Läge 2026-08-19 — Adaptive Business
-- Twin / OperatingExperiment": en loop observation → hypotes → avgränsat
-- försök → mätning → ägarbekräftad företagsregel, byggd på VERKLIGA
-- projektutfall (project_outcome, financial_learning_eligible). Andreas
-- beslut 2026-08-19: motorn byggs FÖRE lansering, står färdigtestad och
-- TOM, aktiveras av riktig kunddata — den här migrationen skapar bara
-- skalet. Ingen kod i Etapp 1 skriver en enda rad hit.
--
-- Första piloten (när grinden i ACTIVE_ROADMAP öppnas): Lars +
-- kickoff-checkpoints — ett bekräftat playbook-mönster
-- (lib/playbook/kickoff-candidates.ts, business_knowledge-raden i
-- source_pattern_id) testas på 3–5 nya matchande projekt, och
-- checkpoint-outcomes (lib/playbook/checkpoint-outcomes.ts) + det frusna
-- project_outcome-facit är beviset.
--
-- ═══ FYRA SANNINGSNIVÅER, INGET RESULTATFÄLT ═══
--
-- Tabellen bär planen och gränserna — ALDRIG ett resultat. Precis som
-- mission (sql/v144) och mission_mandate (sql/v150): resultat härleds vid
-- läsning (lib/experiment/measure.ts, Etapp 1) ur project_outcome/
-- project_change/invoice, aldrig lagras. Undantaget är frozen_summary,
-- som mirrorar project_outcome-frysningens idiom: skrivs EN gång, vid
-- concluded, med räknade fakta — aldrig en slutsats. Ingen kod i Etapp 1
-- skriver dit; skrivvägen kommer i en senare etapp.
--
-- guard_rails.no_autonomous_customer_send är ALLTID true i V1 — inget
-- steg i den här motorn får någonsin skicka något till en kund utan ett
-- vanligt godkännandekort. CHECK:as nedan (går att uttrycka i SQL,
-- källskanning behövs inte som fallback).
--
-- measures är en SLUTEN uppsättning (se lib/experiment/types.ts
-- EXPERIMENT_MEASURE_KEYS — måste hållas i synk med CHECK:en nedan).
--
-- guard_rails.max_projects och jsonb_array_length(enrolled_project_ids)
-- är hårdkodade till 5 nedan — samma tal som
-- EXPERIMENT_MAX_PROJECTS_CAP i lib/experiment/types.ts. Ändras båda
-- ställena tillsammans om taket någonsin justeras.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_config') IS NULL THEN
    RAISE EXCEPTION 'v157 kräver business_config';
  END IF;
  IF to_regclass('public.project_outcome') IS NULL THEN
    RAISE EXCEPTION 'v157 kräver project_outcome (kör v73_efterkalkyl.sql och v138_outcome_quality_gate.sql först)';
  END IF;
END $$;

CREATE TABLE public.operating_experiment (
  -- 'exp_' + 12 tecken, samma id-konvention som övriga TEXT-id i kodbasen.
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,

  hypothesis TEXT NOT NULL,
  -- Ansvarig specialist, t.ex. 'lars' i den beslutade första piloten.
  agent_key TEXT NOT NULL,
  job_type TEXT NOT NULL,

  -- business_knowledge.id (UUID, lagras som text) — mönstret hypotesen
  -- föddes ur. Ingen FK (typmismatch UUID/TEXT, och en confirmed pattern-
  -- rad kan gå igenom eget livscykelstatus oberoende av experimentet) —
  -- rent spårbarhetsfält, samma roll som pattern_id i kickoff-korten.
  source_pattern_id TEXT,
  -- Käll-projekten observationen byggde på (project_id-array).
  source_project_ids JSONB NOT NULL DEFAULT '[]',

  -- Typad, INTE fritext-schema. V1: { type: 'kickoff_checkpoint',
  -- checkpoint_text: '...' } — se PlannedChange i lib/experiment/types.ts.
  planned_change JSONB NOT NULL,
  CONSTRAINT experiment_planned_change_typed CHECK (
    planned_change ? 'type'
    AND planned_change->>'type' = 'kickoff_checkpoint'
    AND planned_change ? 'checkpoint_text'
  ),

  -- { max_projects, start_date, end_date, no_autonomous_customer_send }.
  guard_rails JSONB NOT NULL,
  CONSTRAINT experiment_guard_rails_no_auto_send CHECK (
    (guard_rails->>'no_autonomous_customer_send')::boolean IS TRUE
  ),
  CONSTRAINT experiment_guard_rails_max_projects_check CHECK (
    (guard_rails->>'max_projects')::int BETWEEN 1 AND 5
  ),
  CONSTRAINT experiment_guard_rails_dates_present CHECK (
    guard_rails ? 'start_date' AND guard_rails ? 'end_date'
  ),

  -- Lista av måttnycklar ur EN SLUTEN uppsättning — se filhuvudet.
  measures JSONB NOT NULL,
  CONSTRAINT experiment_measures_closed_set CHECK (
    jsonb_typeof(measures) = 'array'
    AND jsonb_array_length(measures) >= 1
    AND measures <@ '[
      "sena_andringar", "marginal", "extra_timmar",
      "faktureringstid", "forseningar", "materialavvikelser"
    ]'::jsonb
  ),

  min_comparable_projects INTEGER NOT NULL
    CHECK (min_comparable_projects BETWEEN 1 AND 20),

  enrolled_project_ids JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT experiment_enrolled_within_cap CHECK (
    jsonb_typeof(enrolled_project_ids) = 'array'
    AND jsonb_array_length(enrolled_project_ids) <= 5
  ),

  -- Ägarens SLUTBESLUT — separat par från status, satt EN gång vid
  -- concluded (mirrorar mission_state_check-idiomet i sql/v144).
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'declined', 'active', 'concluded')),
  owner_decision TEXT
    CHECK (owner_decision IS NULL OR owner_decision IN ('continue_testing', 'rejected', 'made_standard')),
  decided_at TIMESTAMPTZ,
  resulting_rule_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,

  -- Skrivs EN gång vid concluded — räknade fakta, aldrig en slutsats
  -- (freeze-outcome-idiomet). Ingen skrivväg finns i Etapp 1.
  frozen_summary JSONB,

  CONSTRAINT experiment_state_check CHECK (
    (status IN ('proposed', 'declined') AND confirmed_at IS NULL AND concluded_at IS NULL)
    OR (status = 'active' AND confirmed_at IS NOT NULL AND concluded_at IS NULL)
    OR (status = 'concluded' AND confirmed_at IS NOT NULL AND concluded_at IS NOT NULL)
  ),
  CONSTRAINT experiment_owner_decision_check CHECK (
    (owner_decision IS NULL AND decided_at IS NULL)
    OR (owner_decision IS NOT NULL AND decided_at IS NOT NULL AND status = 'concluded')
  ),
  CONSTRAINT experiment_frozen_summary_only_when_concluded CHECK (
    frozen_summary IS NULL OR status = 'concluded'
  )
);

CREATE INDEX idx_operating_experiment_business_status
  ON public.operating_experiment (business_id, status);

CREATE INDEX idx_operating_experiment_business_jobtype
  ON public.operating_experiment (business_id, job_type);

-- RLS-lärdomen från v112–v115 / v148-mönstret: allt via service_role,
-- inget till anon eller authenticated.
ALTER TABLE public.operating_experiment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operating_experiment FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.operating_experiment TO service_role;
CREATE POLICY operating_experiment_service_role ON public.operating_experiment
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='operating_experiment' ORDER BY ordinal_position;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.operating_experiment'::regclass AND contype='c';
-- SELECT indexname FROM pg_indexes WHERE tablename='operating_experiment';
-- SELECT count(*) FROM public.operating_experiment; -- ska vara 0 (tom, aktiveras av riktig data)
