-- Backfill: time_entry.customer_id för rader skapade av /api/checkin/approve
-- INNAN fix(checkin/approve customer_id-propagation)-commiten.
--
-- Bug: time_entry.customer_id sattes inte i INSERT — raderna fick NULL och
-- blev osynliga i fakturera-flowet (Christoffer kunde inte skapa faktura).
-- Fix i koden ärver nu customer från projektet vid attest.
--
-- Schema-fakta:
--   time_entry.invoice_id är TEXT (sql/time_tracking_expansion.sql:31)
--   invoice.invoice_id är TEXT (sql/invoice_overhaul.sql:81 FK-syntax)
--   → ingen ::text-cast behövs.
--
-- Kör manuellt i Supabase SQL Editor EFTER att fix-commiten är deployad.

-- ─────────────────────────────────────────────────────────────────
-- DEL 1: time_entry.customer_id ← project.customer_id
-- Påverkar pilot-business där rader hade customer_id=NULL men project
-- pekar på en kund. Sätter inte över rader som redan har customer_id.
-- ─────────────────────────────────────────────────────────────────

UPDATE time_entry te
SET customer_id = p.customer_id
FROM project p
WHERE te.business_id = 'biz_al7pjuu5smi'
  AND te.customer_id IS NULL
  AND te.project_id IS NOT NULL
  AND p.project_id = te.project_id
  AND p.business_id = te.business_id
  AND p.customer_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- DEL 2: invoice.customer_id för FV-2026-001 (skapad innan fixen)
-- Hämtar customer_id från en av invoice:ns time_entry-rader (de har
-- nu customer_id efter DEL 1). LIMIT 1 räcker eftersom alla rader
-- på samma faktura ska peka på samma kund.
-- ─────────────────────────────────────────────────────────────────

UPDATE invoice i
SET customer_id = (
  SELECT te.customer_id
  FROM time_entry te
  WHERE te.invoice_id = i.invoice_id
    AND te.customer_id IS NOT NULL
  LIMIT 1
)
WHERE i.business_id = 'biz_al7pjuu5smi'
  AND i.customer_id IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- Förvänta: alla pilot-rader har customer_id satt, fakturan med.
-- ─────────────────────────────────────────────────────────────────

SELECT time_entry_id, project_id, customer_id, invoice_id, work_date
FROM time_entry
WHERE business_id = 'biz_al7pjuu5smi'
  AND project_id IS NOT NULL
ORDER BY work_date DESC;

SELECT invoice_id, invoice_number, customer_id
FROM invoice
WHERE business_id = 'biz_al7pjuu5smi'
ORDER BY created_at DESC
LIMIT 5;
