-- v176: Projektnumret — alltid, unikt, aldrig tyst tappat
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND (2026-08-27)
-- 19 av 37 projekt i prod saknar project_number. Bara POST /api/projects
-- sätter nummer — projekt födda ur signerad offert, lead eller bokning
-- (createProjectFromQuote m.fl.) får aldrig något. Dessutom hade rutten en
-- fallback som vid insert-fel tyst försökte igen UTAN nummer. Numret var
-- inte unikt i databasen (bara ett vanligt index) och visades ingenstans på
-- projektsidan — hantverkaren kunde inte se det, kunden kunde inte referera
-- till det, Fortnox fick det ibland.
--
-- BESLUT
-- 1. Databasen garanterar numret: en BEFORE INSERT-trigger drar nästa
--    nummer ur samma räknare som appen (increment_counter, 'project') när
--    inget nummer skickas med. Sju skapare i koden behöver inte veta något.
--    Deal-vägen skickar fortfarande P-<deal_number> explicit + bump_counter.
-- 2. Backfill: de 19 numreras i skapandeordning per företag, ur räknaren —
--    aldrig ett räknat ROW_NUMBER som kan krocka med räknarens nästa värde.
-- 3. Unikt per företag (partiellt index — NULL tillåts inte längre uppstå
--    via appen, men gamla rader med NULL blockerar inte).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project') IS NULL OR to_regclass('public.business_counters') IS NULL THEN
    RAISE EXCEPTION 'v176 kräver project och business_counters (sql/v2_numbering.sql)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_counter') THEN
    RAISE EXCEPTION 'v176 kräver increment_counter (sql/v2_numbering.sql)';
  END IF;
END $$;

-- 1) Trigger: nummer om inget skickas med.
CREATE OR REPLACE FUNCTION public.project_assign_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.project_number IS NULL OR btrim(NEW.project_number) = '' THEN
    NEW.project_number := 'P-' || public.increment_counter(NEW.business_id, 'project');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_assign_number ON public.project;
CREATE TRIGGER trg_project_assign_number
  BEFORE INSERT ON public.project
  FOR EACH ROW EXECUTE FUNCTION public.project_assign_number();

-- 2) Backfill i skapandeordning, ur räknaren.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT project_id, business_id
    FROM public.project
    WHERE project_number IS NULL OR btrim(project_number) = ''
    ORDER BY business_id, created_at ASC, project_id ASC
  LOOP
    UPDATE public.project
    SET project_number = 'P-' || public.increment_counter(r.business_id, 'project')
    WHERE project_id = r.project_id;
  END LOOP;
END $$;

-- 3) Unikt per företag.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_number_per_business
  ON public.project (business_id, project_number)
  WHERE project_number IS NOT NULL;

COMMENT ON COLUMN public.project.project_number IS
  'P-<löpnummer> per företag (business_counters ''project''). Sätts av trigger om skaparen inte skickar med (deal-vägen skickar P-<deal_number>). Unikt per företag.';

COMMIT;

-- Verifiera efteråt:
-- SELECT count(*) FILTER (WHERE project_number IS NULL) AS utan_nummer, count(*) AS totalt FROM public.project;
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.project'::regclass AND tgname = 'trg_project_assign_number';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'project' AND indexname = 'uq_project_number_per_business';
