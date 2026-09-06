-- Apply after v212. Not executed by Codex: direct database access is unavailable.
BEGIN;
ALTER TABLE public.customer_preparation
  ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.project(project_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lars_review jsonb,
  ADD COLUMN IF NOT EXISTS review_run_id uuid,
  ADD COLUMN IF NOT EXISTS review_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.check_preparation_project() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project p WHERE p.project_id = NEW.project_id
      AND p.business_id = NEW.business_id AND p.customer_id = NEW.customer_id
  ) THEN RAISE EXCEPTION 'Preparation project must belong to the same business and customer'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS preparation_project_scope ON public.customer_preparation;
CREATE TRIGGER preparation_project_scope BEFORE INSERT OR UPDATE OF project_id, business_id, customer_id
  ON public.customer_preparation FOR EACH ROW EXECUTE FUNCTION public.check_preparation_project();
COMMIT;

-- Required post-apply schema evidence. Also perform the scoped acceptance test in tasks/lars-preparation-review.md.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customer_preparation'
  AND column_name IN ('project_id', 'lars_review', 'review_run_id', 'review_started_at');
