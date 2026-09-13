-- v237 (2026-09-13): backfill av invoice.paid_amount för fakturor som markerats
-- betalda via PUT /api/invoices (fakturalistans "Markera betald" fram till
-- 2026-09-13). Den vägen satte bara status/paid_at och lämnade paid_amount NULL,
-- vilket gör betalsummorna på Pengar-sidan och i value-ledgern för låga.
-- Se docs/strategy/FINANCIAL_KERNEL_CALL_SITE_MAP.md §2 (tier 1, #2) och §5.
--
-- Idempotent: rör BARA rader där paid_amount IS NULL, och bara slutförda
-- statusar. Ändrar inte status, paid_at eller total. Kör efter att koden som
-- stänger PUT-vägen är deployad, annars fylls nya luckor på.
--
-- Före körning (räkna): SELECT status, count(*) FROM invoice
--   WHERE paid_amount IS NULL AND status IN ('paid','customer_paid') GROUP BY 1;

BEGIN;

UPDATE public.invoice
   SET paid_amount = CASE
         WHEN status = 'paid' THEN total
         WHEN status = 'customer_paid' THEN COALESCE(customer_pays, total - COALESCE(rot_rut_deduction, 0))
       END
 WHERE paid_amount IS NULL
   AND status IN ('paid', 'customer_paid')
   AND total IS NOT NULL;

COMMIT;

-- Efter körning (ska ge 0 rader utom eventuella total IS NULL):
-- SELECT invoice_id, status FROM invoice WHERE paid_amount IS NULL AND status IN ('paid','customer_paid');
