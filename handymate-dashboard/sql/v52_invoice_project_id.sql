-- v52_invoice_project_id.sql
-- Etapp 1 av projekt-konsolidering (2026-05-20).
-- Referens: tasks/projekt-domain-audit-2026-05-20.md (brytpunkt 2).
--
-- Bakgrund: invoice-tabellen saknar idag project_id-kolumn. Det gör det
-- omöjligt att gruppera fakturor per projekt direkt i SQL — Karin kan läsa
-- invoice.total per kund, men Lars kan inte beräkna marginal per projekt
-- eftersom invoice → project-kedjan är bruten.
--
-- Den här migrationen ADDAR bara kolumnen + partial index. INGEN FK-
-- constraint i denna migration — backfill (v52b) måste köras först,
-- annars fail:ar constraint på orphan-rader. FK kan läggas till i en
-- senare migration efter att flödet stabiliserats.

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS project_id TEXT;

-- Partial index: bara rader med faktisk koppling indexeras. Effektivt
-- eftersom merparten av historiska rader kommer ha project_id = NULL
-- tills backfill (v52b) körs, och även efter backfill kommer "orphan-
-- fakturor" (skapade via from-project utan quote_id-bro) att förbli NULL.
CREATE INDEX IF NOT EXISTS idx_invoice_project
  ON invoice(project_id)
  WHERE project_id IS NOT NULL;

-- Verifiering efter körning:
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name = 'invoice' AND column_name = 'project_id';
--
-- Förväntat: en rad returneras med column_name = 'project_id'.
