-- OMDÖPT VID MERGE 2026-09-18: hette v255_invoice_job_type.sql och KÖRDES i produktionen
-- 2026-09-17 under det numret. main hade redan ett v255 med annat
-- innehåll, så numret krockade. Kör inte om — satserna är idempotenta,
-- men filen är historik, inte en väntande migration.
-- v255 (2026-09-17): jobbtypen på fakturan.
--
-- Jobbtypen bärs av offerten (quotes.job_type) och av projektet
-- (project.job_type) men nådde ALDRIG fakturan — noll träffar på job_type i
-- hela fakturakoden. Följden: ingen lönsamhet per jobbtyp på fakturanivå,
-- alltså ingen efterkalkyl som stänger cirkeln offert → jobb → faktura.
--
-- Bara en ny nullbar kolumn. Inga rader ändras, inget skrivs om.

ALTER TABLE public.invoice
  ADD COLUMN IF NOT EXISTS job_type TEXT;

COMMENT ON COLUMN public.invoice.job_type IS
  'Jobbtypens slug, ärvd från offerten i första hand och projektet i andra (samma format som quotes.job_type, project.job_type, deal.job_type). Sätts när fakturan skapas; ändras aldrig i efterhand.';

-- Kontroll efteråt:
-- SELECT count(*) FROM invoice;                       -- oförändrat 15
-- SELECT count(*) FROM invoice WHERE job_type IS NOT NULL;  -- 0 vid start
