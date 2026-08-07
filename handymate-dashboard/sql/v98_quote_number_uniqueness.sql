-- V98: unika offertnummer per tenant/år och unika versionsnummer per familj
-- KÖRS MANUELLT i Supabase SQL Editor. Kör inte från applikationskod.
--
-- quote_number återställs varje år (#001, #002, ...), därför omfattar
-- nummerregeln business_id + UTC-år från created_at + quote_number.

BEGIN;

-- Förhandskontroll av de fem kolumner som reglerna använder.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'quotes'
  AND column_name IN (
    'business_id', 'created_at', 'quote_number',
    'parent_quote_id', 'version_number'
  )
ORDER BY column_name;
-- Förväntat: 5 rader. STOPPA vid avvikelse.

-- Måste returnera 0 rader. Befintliga dubbletter ska utredas manuellt; denna
-- migration väljer aldrig automatiskt vilken juridisk offert som är rätt.
SELECT
  business_id,
  EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC') AS quote_year,
  quote_number,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(quote_id ORDER BY created_at, quote_id) AS quote_ids
FROM public.quotes
WHERE quote_number IS NOT NULL
GROUP BY
  business_id,
  EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC'),
  quote_number
HAVING COUNT(*) > 1;

-- Måste returnera 0 rader. Samma princip: ingen automatisk omskrivning av
-- befintliga versionsfamiljer.
SELECT
  parent_quote_id,
  version_number,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(quote_id ORDER BY created_at, quote_id) AS quote_ids
FROM public.quotes
WHERE parent_quote_id IS NOT NULL
GROUP BY parent_quote_id, version_number
HAVING COUNT(*) > 1;

-- Ett uttrycksindex krävs eftersom år inte är en egen kolumn. UTC matchar
-- serverallokeringen i generateQuoteNumber och gör uttrycket deterministiskt.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_business_year_number_unique
  ON public.quotes (
    business_id,
    (EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC')),
    quote_number
  )
  WHERE quote_number IS NOT NULL;

-- En vanlig UNIQUE constraint räcker här: PostgreSQL tillåter flera NULL,
-- så rot-offerter och fristående kopior (parent_quote_id NULL) påverkas inte.
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.quotes'::regclass
      AND conname = 'quotes_parent_version_unique'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_parent_version_unique
      UNIQUE (parent_quote_id, version_number);
  END IF;
END
$constraint$;

COMMIT;

-- Manuell verifiering efter körning.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'quotes'
  AND indexname = 'quotes_business_year_number_unique';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.quotes'::regclass
  AND conname = 'quotes_parent_version_unique';
