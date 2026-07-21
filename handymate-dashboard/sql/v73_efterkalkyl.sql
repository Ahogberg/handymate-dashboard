-- v73: Efterkalkyl — frusen utfall-vs-offert per stängt projekt (Motor 1:
-- Lärande prissättning). Kör manuellt i Supabase SQL Editor.
--
-- freezeProjectOutcome() (lib/efterkalkyl/freeze-outcome.ts) skriver en rad
-- hit varje gång ett projekt stängs (status→completed). Idempotent — en
-- omstängning skriver om samma rad (UNIQUE project_id + upsert).
--
-- Ärlighetsprincip: margin_kr/margin_pct är NULL när
-- labor_cost_configured=false (samma princip som compute-economics.ts).
-- hours_diff_pct/amount_diff_pct är NULL när offererad tid/belopp saknas
-- eller är 0 — vi gissar aldrig ett diff mot en nollnämnare.

CREATE TABLE IF NOT EXISTS project_outcome (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  project_id TEXT NOT NULL UNIQUE,
  quote_id TEXT,
  job_type TEXT,
  template_id TEXT,

  -- Offererat (från getQuoteBudgetDerivation, om quote_id finns)
  quoted_amount NUMERIC,
  quoted_hours NUMERIC,
  quoted_labor_kr NUMERIC,
  quoted_material_kr NUMERIC,

  -- Utfall (från computeProjectEconomics)
  actual_hours NUMERIC,
  actual_labor_kr NUMERIC,
  actual_material_purchase_kr NUMERIC,
  actual_material_billable_kr NUMERIC,
  ata_signed_kr NUMERIC,
  invoiced_kr NUMERIC,
  margin_kr NUMERIC,
  margin_pct NUMERIC,
  labor_cost_configured BOOLEAN NOT NULL DEFAULT false,

  -- Diffar (utfall vs offererat). NULL när jämförelse saknas (ingen offert,
  -- offererad tid/belopp = 0, eller arbetskostnad ej konfigurerad för kr-diff).
  hours_diff_pct NUMERIC,
  amount_diff_pct NUMERIC,

  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_outcome_business_jobtype
  ON project_outcome(business_id, job_type);

CREATE INDEX IF NOT EXISTS idx_project_outcome_business_template
  ON project_outcome(business_id, template_id);

ALTER TABLE project_outcome ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_project_outcome' AND tablename = 'project_outcome') THEN
    CREATE POLICY service_project_outcome ON project_outcome FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_project_outcome' AND tablename = 'project_outcome') THEN
    CREATE POLICY user_project_outcome ON project_outcome
      FOR ALL USING (
        business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ROLLBACK (manuellt om behövs):
-- DROP TABLE IF EXISTS project_outcome;
