-- V173: dokument får höra till en affär även innan en kund finns.
-- Kör manuellt i Supabase SQL Editor före deploy av affärsuppladdningen.

BEGIN;

ALTER TABLE public.customer_document
  ADD COLUMN IF NOT EXISTS deal_id TEXT,
  ADD COLUMN IF NOT EXISTS lead_id TEXT;

-- En inkommande affär kan skapas innan kundkopplingen är gjord. Det gamla
-- NOT NULL-kravet tvingade därför API:t att skriva deal.id i customer_id,
-- vilket bryter FK:n och gjorde att filen rullades tillbaka.
ALTER TABLE public.customer_document
  ALTER COLUMN customer_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_document_deal_id_fkey'
      AND conrelid = 'public.customer_document'::regclass
  ) THEN
    ALTER TABLE public.customer_document
      ADD CONSTRAINT customer_document_deal_id_fkey
      FOREIGN KEY (deal_id) REFERENCES public.deal(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_document_deal
  ON public.customer_document(deal_id)
  WHERE deal_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_document_has_owner'
      AND conrelid = 'public.customer_document'::regclass
  ) THEN
    ALTER TABLE public.customer_document
      ADD CONSTRAINT customer_document_has_owner
      CHECK (customer_id IS NOT NULL OR deal_id IS NOT NULL OR lead_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.customer_document.deal_id IS
  'Affären filen laddades upp för. Kan finnas utan customer_id tills kunden kopplas.';

COMMIT;

