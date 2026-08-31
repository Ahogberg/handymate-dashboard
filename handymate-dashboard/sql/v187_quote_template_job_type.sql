-- Epic 2: en uttrycklig koppling, aldrig gissning från category/namn.
-- Kör MANUELLT efter granskning. Ingen backfill och inga prisändringar.
-- Verifierat läsande 2026-08-31: job_types har UNIQUE(business_id, slug).
BEGIN;

ALTER TABLE public.quote_templates ADD COLUMN IF NOT EXISTS job_type_slug TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quote_templates'::regclass
    AND conname = 'quote_templates_job_type_tenant_fk') THEN
    ALTER TABLE public.quote_templates ADD CONSTRAINT quote_templates_job_type_tenant_fk
      FOREIGN KEY (business_id, job_type_slug)
      REFERENCES public.job_types (business_id, slug)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quote_templates'::regclass
    AND conname = 'quote_templates_job_type_requires_business') THEN
    ALTER TABLE public.quote_templates ADD CONSTRAINT quote_templates_job_type_requires_business
      CHECK (job_type_slug IS NULL OR business_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quote_templates_job_type_idx
  ON public.quote_templates (business_id, job_type_slug) WHERE job_type_slug IS NOT NULL;
COMMENT ON COLUMN public.quote_templates.job_type_slug IS
  'Explicit owner/admin choice. category remains a presentation category; no automatic name inference.';

COMMIT;

-- Read-only verifiering efter körning:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'quote_templates' AND column_name = 'job_type_slug';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.quote_templates'::regclass
  AND conname IN ('quote_templates_job_type_tenant_fk', 'quote_templates_job_type_requires_business');
