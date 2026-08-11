-- v120_expected_margin_snapshot.sql (2026-08-12)
--
-- Sparar "förväntad marginal vid accept" på offerten — idag räknas
-- calculateQuoteMargin() (lib/quotes/margin.ts) bara i UI:t och kastas bort
-- i samma sekund offerten accepteras. En hantverkare kan aldrig senare svara
-- på "vad trodde jag att jag skulle tjäna på det här?" — irreversibel
-- dataförlust vid varje accept.
--
-- KÖRS MANUELLT I SUPABASE SQL EDITOR. Koden som skriver/läser kolumnen
-- deployas INNAN denna migration körs (se lib/quotes/margin-snapshot.ts och
-- app/api/projects/[id]/efterkalkyl/route.ts) — allt är därför byggt
-- fail-safe mot en 42703 ("column does not exist"): skrivningar loggar och
-- ger upp tyst, läsningar degraderar till "ingen snapshot". Efter denna körs
-- börjar kolumnen fyllas på vid nästa accept, ingen backfill av gamla
-- offerter.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS expected_margin_snapshot JSONB;

COMMENT ON COLUMN public.quotes.expected_margin_snapshot IS
  'Fryst ögonblicksbild av calculateQuoteMargin() (lib/quotes/margin.ts) från det ögonblick offerten accepterades. Skrivs av captureExpectedMarginSnapshot (lib/quotes/margin-snapshot.ts) — första accepten vinner, skrivs aldrig över. Fält: margin_kr, margin_pct, known_revenue, known_cost, is_partial, rows_with_cost, rows_without_cost, computed_at, basis (manual_accept | portal_accept | signed).';

-- ── Verifiering (körs efteråt, läsande) ─────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='quotes' AND column_name='expected_margin_snapshot';
--   → 1 rad, data_type = jsonb
