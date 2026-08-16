-- v138: Outcome Quality Gate V1
-- Kör MANUELLT i Supabase SQL Editor före koden aktiveras.
--
-- Legacy-rader får INTE en beräkningsversion i migrationen. De skapades innan
-- alla källfel lästes och kan därför inte göras till träningsdata med en
-- UPDATE. Den idempotenta reconciliation-vägen räknar om dem från källorna.

DO $$
BEGIN
  IF to_regclass('public.project_outcome') IS NULL THEN
    RAISE EXCEPTION 'project_outcome saknas; kör v73_efterkalkyl.sql först';
  END IF;
END $$;

ALTER TABLE project_outcome
  ADD COLUMN IF NOT EXISTS calculation_version INTEGER,
  ADD COLUMN IF NOT EXISTS quote_source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_counts JSONB NOT NULL DEFAULT '{
    "ata": 0,
    "invoice": 0,
    "realized_invoice": 0,
    "time_entry": 0,
    "supplier_invoice": 0,
    "project_material": 0,
    "project_cost": 0
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS completeness_flags JSONB NOT NULL DEFAULT '{
    "project_completed": false,
    "quote_linked": false,
    "quote_budget_present": false,
    "quote_hours_present": false,
    "time_entries_present": false,
    "cost_rows_present": false,
    "material_source_overlap_free": false,
    "labor_cost_complete": false,
    "invoice_present": false,
    "invoice_net_amount_complete": false,
    "realized_revenue_present": false,
    "source_reads_complete": false
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS time_learning_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS financial_learning_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS learning_blockers TEXT[] NOT NULL DEFAULT ARRAY['legacy_unverified']::TEXT[],
  ADD COLUMN IF NOT EXISTS expected_revenue_kr NUMERIC,
  ADD COLUMN IF NOT EXISTS realized_revenue_kr NUMERIC,
  ADD COLUMN IF NOT EXISTS realized_margin_kr NUMERIC,
  ADD COLUMN IF NOT EXISTS realized_margin_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

ALTER TABLE project_outcome
  DROP CONSTRAINT IF EXISTS project_outcome_calculation_version_check,
  ADD CONSTRAINT project_outcome_calculation_version_check
    CHECK (calculation_version IS NULL OR calculation_version > 0),
  DROP CONSTRAINT IF EXISTS project_outcome_quote_source_type_check,
  ADD CONSTRAINT project_outcome_quote_source_type_check
    CHECK (
      quote_source_type IS NULL OR quote_source_type IN (
        'quote_items_table', 'jsonb_legacy', 'total_fallback', 'empty', 'none'
      )
    ),
  DROP CONSTRAINT IF EXISTS project_outcome_time_learning_version_check,
  ADD CONSTRAINT project_outcome_time_learning_version_check
    CHECK (
      NOT time_learning_eligible OR
      (calculation_version IS NOT NULL AND calculation_version >= 2)
    ),
  DROP CONSTRAINT IF EXISTS project_outcome_financial_learning_version_check,
  ADD CONSTRAINT project_outcome_financial_learning_version_check
    CHECK (
      NOT financial_learning_eligible OR
      (calculation_version IS NOT NULL AND calculation_version >= 2)
    );

CREATE INDEX IF NOT EXISTS idx_project_outcome_quality_jobtype
  ON project_outcome(business_id, job_type, calculation_version)
  WHERE time_learning_eligible = true OR financial_learning_eligible = true;

CREATE INDEX IF NOT EXISTS idx_project_outcome_quality_template
  ON project_outcome(business_id, template_id, calculation_version)
  WHERE time_learning_eligible = true OR financial_learning_eligible = true;

COMMENT ON COLUMN project_outcome.calculation_version IS
  'NULL = legacy/overifierad. Version 2 kräver fail-closed läsning av samtliga ekonomiska källor.';
COMMENT ON COLUMN project_outcome.time_learning_eligible IS
  'Sant endast när avslutat projekt har jämförbara offerttimmar och faktisk tid.';
COMMENT ON COLUMN project_outcome.financial_learning_eligible IS
  'Sant endast när offert, kostnadskällor, intern arbetskostnad och fakturerad intäkt är verifierade.';

-- Avsiktligt INGEN UPDATE som märker gamla rader som version 2.
-- Efter manuell körning: anropa owner/admin-routen för reconciliation eller
-- låt den begränsade lazy-reconciliationen räkna om rader från källorna.
