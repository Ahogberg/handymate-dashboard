-- v90: dold offertrad
-- Kör manuellt i Supabase SQL Editor. Idempotent.
-- =============================================================================
--
-- "Dölj rad" fanns inte alls tidigare — varken fält eller UI. Hantverkare som
-- ville dölja en marginal- eller detaljrad kunde bara ta bort den (och tappa
-- priset) eller sätta HELA offerten på visningsnivå 'summary' (och dölja allt).
--
-- SEMANTIK (beslut av Andreas 2026-08-05): raden syns INTE i kundens dokument
-- men PRISET INGÅR I SUMMAN oförändrat. lib/quote-calculations.ts rör därför
-- aldrig fältet — bara renderarna (QuoteDocumentRow, premium, friendly,
-- pdf-generator) filtrerar bort raden i static-läge.
--
-- Verifiering efter körning:
--   SELECT COUNT(*) FROM quote_items WHERE is_hidden IS TRUE;   -- 0 vid start
--   \d quote_items                                              -- kolumnen finns

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN quote_items.is_hidden IS
  'Dold för kunden: raden utelämnas ur kundens dokument (PDF/kundvy/förhandsgranskning) men ingår i summan. Beräkningarna rör aldrig fältet.';
