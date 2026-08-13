-- v126_backfill_invoice_sent_at.sql
--
-- Bakgrund: POST /api/invoices/send satte ALDRIG invoice.sent_at eller
-- invoice.sent_method vid en lyckad utskick — bara status='sent'.
-- InvoiceStatusTimeline.tsx läser BÅDA fälten för att visa "Skickad via
-- {metod}"-steget som klart (rad 48-52); utan sent_at visas steget som
-- "upcoming" trots att fakturan faktiskt skickats. Upptäckt av Golden
-- Path-harnesset (Fas 2, Station 8) 2026-08-13, fixat i samma commit.
--
-- check-overdue-cronen (app/api/cron/check-overdue/route.ts) läser
-- due_date, inte sent_at — bekräftat att påminnelsekedjan INTE påverkats
-- av denna bugg, bara UI-tidslinjen.
--
-- Backfill: sent_at finns inte kvar från den faktiska sändningen (skrevs
-- aldrig), så created_at används som bästa approximation — samma dag
-- fakturan skapades är i praktiken samma dag den skickades för alla
-- berörda rader (skickas alltid samma flöde som skapar utkastet).
-- sent_method sätts INTE i backfillen (okänt i efterhand, ärligt NULL
-- hellre än gissat).
--
-- Blast radius vid källgranskning (2026-08-13): 4 fakturor i produktion.

UPDATE invoice
SET sent_at = created_at
WHERE status IN ('sent', 'paid', 'overdue')
  AND sent_at IS NULL;
