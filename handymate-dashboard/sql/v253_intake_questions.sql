-- v253_intake_questions.sql — frågeflöde per jobbtyp: frågorna på jobbtypen, svaren på offerten.
-- Claude 2026-09-17, beslut Andreas samma dag ("frågeflöden per jobbtyp byggs först").
--
-- Bakgrund: hantverkaren ska lämna kundens hem med en prissatt offert. Varje jobbtyp får
-- 5–8 frågor (yta, antal, golvvärme, bortforsling …) som besvaras på plats. Svaren sätter
-- mängderna på jobbtypens standardrader, kryssar tillval och ger Matte ett underlag som
-- inte är gissat. Frågorna hör till jobbtypen och är redigerbara per firma; svaren hör
-- till offerten så att de kan visas, följas upp och senare komma från kunden själv.
--
-- job_types.intake_questions: NULL = aldrig redigerade → koden räknar fram seedade förslag
-- ur bransch + jobbtypens namn + enheterna i standardraderna. '[]' = medvetet inga frågor.
-- Formen valideras i lib/quotes/intake-questions.ts (max 20 frågor, id/label/kind/unit/…).
--
-- quotes.intake_answers: { version: 1, jobType, answeredAt, source: 'hantverkare', answers: [...] }
-- eller NULL. Ändrar inga belopp: raderna bär mängderna, svaren är underlaget.
--
-- Rör inte: job_types övriga kolumner, quote_templates, quotes.source_transcript (får svaren
-- som text från klienten, som förut vid fritext).
-- Idempotent: kan köras flera gånger.
BEGIN;

ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS intake_questions JSONB;
COMMENT ON COLUMN public.job_types.intake_questions IS
  'Frågor som ställs på plats när en offert startas från jobbtypen. NULL = seedade förslag används, [] = inga frågor. Form: lib/quotes/intake-questions.ts.';

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS intake_answers JSONB;
COMMENT ON COLUMN public.quotes.intake_answers IS
  'Svar från frågeflödet när offerten startades (version 1). NULL när offerten byggdes utan frågor. Rör inga belopp.';

COMMIT;

-- Verifiering efter körning:
-- SELECT table_name, column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND column_name IN ('intake_questions', 'intake_answers');
