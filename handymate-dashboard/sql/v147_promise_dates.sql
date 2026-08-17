-- v147: Daterade kundlöften på BEKRÄFTADE commitment-fakta (Promise-to-Proof,
-- smal grind-förenlig skiva — rådets Promise Ledger-avvisning respekterad:
-- ett löfte BEVAKAS bara när ägaren bekräftat det (confirmed_at), aldrig ur
-- rå AI-extraktion. Extraktionen får FÖRESLÅ ett datum; bekräftelsen gör
-- det till ett bevakat löfte.)
--
-- KÖRS MANUELLT i Supabase SQL Editor. Kräver v122_customer_fact.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.customer_fact') IS NULL THEN
    RAISE EXCEPTION 'v147 kräver v122_customer_fact.sql';
  END IF;
END $$;

-- När löftet ska vara uppfyllt. NULL = odaterat åtagande (bevakas inte).
ALTER TABLE public.customer_fact
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

-- Löftets tillstånd. NULL för icke-commitment-fakta och odaterade åtaganden.
-- 'open' sätts när ett daterat commitment bekräftas; 'fulfilled' när ett
-- bevis-länkat kort verkställs (payload.promise_fact_id-konventionen);
-- 'broken' sätts ALDRIG automatiskt av datumpassage — deadline-svepet
-- skapar ett kort till ägaren, människan avgör om löftet bröts.
ALTER TABLE public.customer_fact
  ADD COLUMN IF NOT EXISTS promise_status TEXT
    CHECK (promise_status IS NULL OR promise_status IN ('open', 'fulfilled', 'broken'));

-- Beviset som uppfyllde löftet (approval-id/fältrapport-id, fritt TEXT-ref +
-- typ — samma lätta konvention som execution_result.artifacts).
ALTER TABLE public.customer_fact
  ADD COLUMN IF NOT EXISTS fulfilled_by_ref TEXT;
ALTER TABLE public.customer_fact
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

-- Svepets arbetsyta: öppna daterade löften per företag.
CREATE INDEX IF NOT EXISTS idx_customer_fact_open_promises
  ON public.customer_fact (business_id, due_at)
  WHERE promise_status = 'open';

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='customer_fact'
--   AND column_name IN ('due_at','promise_status','fulfilled_by_ref','fulfilled_at');
