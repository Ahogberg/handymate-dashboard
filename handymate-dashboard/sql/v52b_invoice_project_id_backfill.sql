-- v52b_invoice_project_id_backfill.sql
-- Etapp 1 av projekt-konsolidering (2026-05-20).
-- Förutsätter att v52_invoice_project_id.sql har körts (project_id-kolumn finns).
--
-- TVÅ-STEGS-PROCESS:
--   1. Kör dry-run-frågorna (A), (B), (C) först. Granska resultaten.
--   2. Kör UPDATE först efter granskning + uttryckligt godkännande.
--
-- Orphan-hantering (beslut 2026-05-20): orphan-fakturor (utan quote_id
-- eller där quote_id inte matchar något projekt) lämnas med project_id =
-- NULL. INGEN heuristisk backfill via customer_id+datum — mis-attribution-
-- risk för hög. Om dry-run visar MÅNGA orphans → stanna, rapportera,
-- besluta manuell mapping per fall innan UPDATE.

-- ============================================================
-- DEL 1 — DRY RUN (kör först, granska resultaten)
-- ============================================================

-- (A) Vad SKULLE backfillas via quote_id-bryggan
-- Förväntat: lista över fakturor som matchar ett projekt på quote_id.
-- Stickprov 3-5 rader: ser project_name rimligt ut mot invoice_number?
SELECT
  i.invoice_id,
  i.invoice_number,
  i.invoice_date,
  i.total,
  i.quote_id,
  p.project_id,
  p.name AS project_name
FROM invoice i
JOIN project p ON i.quote_id = p.quote_id
WHERE i.project_id IS NULL
  AND i.quote_id IS NOT NULL
ORDER BY i.invoice_date DESC NULLS LAST;

-- (B) Orphan-räkning per orsak
-- Förväntat: räkningar visar hur många fakturor som INTE kommer kopplas.
--   - utan_quote_id: skapade via /api/invoices/from-project utan quote_id-koppling
--   - quote_finns_ej_pa_projekt: quote skapades men aldrig blev ett projekt
--   - total_utan_project_id: summa orphans efter UPDATE
SELECT
  COUNT(*) FILTER (WHERE quote_id IS NULL) AS utan_quote_id,
  COUNT(*) FILTER (
    WHERE quote_id IS NOT NULL
      AND quote_id NOT IN (SELECT quote_id FROM project WHERE quote_id IS NOT NULL)
  ) AS quote_finns_ej_pa_projekt,
  COUNT(*) AS total_utan_project_id
FROM invoice
WHERE project_id IS NULL;

-- (C) Dubletter — flera projekt pekar på samma quote_id
-- Förväntat: 0 rader. Om en quote har flera projekt → UPDATE behöver
-- specialhantering (sannolikt LIMIT 1 + manuell granskning av vilka).
SELECT
  quote_id,
  COUNT(*) AS antal_projekt,
  array_agg(project_id ORDER BY created_at) AS projekt_ids,
  array_agg(name ORDER BY created_at) AS projekt_namn
FROM project
WHERE quote_id IS NOT NULL
GROUP BY quote_id
HAVING COUNT(*) > 1;

-- (D) Stickprov: dubla quote_id på invoice-sidan
-- Förväntat: oftast 0. Om delfaktura+slutfaktura skapats från samma quote
-- så är detta normalt. Inte ett problem för backfill — alla får samma
-- project_id (rätt resultat).
SELECT
  quote_id,
  COUNT(*) AS antal_fakturor,
  array_agg(invoice_id) AS invoice_ids
FROM invoice
WHERE quote_id IS NOT NULL
  AND project_id IS NULL
GROUP BY quote_id
HAVING COUNT(*) > 1
ORDER BY antal_fakturor DESC;

-- ============================================================
-- DEL 2 — UPDATE (kör först EFTER granskning + godkännande)
-- ============================================================
--
-- AVKOMMENTERA NEDAN OM DRY-RUN SER BRA UT:
--
-- BEGIN;
--
-- UPDATE invoice i
-- SET project_id = p.project_id
-- FROM project p
-- WHERE i.quote_id = p.quote_id
--   AND i.project_id IS NULL
--   AND i.quote_id IS NOT NULL;
--
-- -- Verifiering före COMMIT:
-- -- (a) Hur många rader uppdaterades?
-- SELECT COUNT(*) AS uppdaterade FROM invoice WHERE project_id IS NOT NULL;
--
-- -- (b) Återstående orphans
-- SELECT COUNT(*) AS kvar_utan_project_id FROM invoice WHERE project_id IS NULL;
--
-- -- (c) Sanity check: matcher project_id mot ett faktiskt projekt?
-- SELECT COUNT(*) AS ogiltiga_project_id
-- FROM invoice i
-- WHERE i.project_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM project p WHERE p.project_id = i.project_id);
--
-- -- Om allt ser bra ut:
-- COMMIT;
--
-- -- Om något ser konstigt ut:
-- -- ROLLBACK;
