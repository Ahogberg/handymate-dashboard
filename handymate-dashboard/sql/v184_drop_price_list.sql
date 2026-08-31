-- v184 (Prisslingan V2, pass 5 / B3): droppa legacy-tabellen price_list.
--
-- ⚠️ DESTRUKTIV (DROP TABLE) — körs via MCP FÖRST efter att Andreas sett
-- filen och sagt "kör" (CLAUDE.md-regeln).
--
-- Bevisläget (2026-08-31): tabellen har ALDRIG innehållit en rad —
-- price_list_id_seq.last_value var NULL (INTEGER-id + TEXT-inserts, felet
-- svaldes tyst sedan första seedningen). Alla sex läsare omkopplade till
-- products via lib/products/price-list-view.ts i pass 2 (4533d1e8); all
-- skriv-/seed-kod borttagen i samma pass. Noll migrationsrisk.
--
-- Dry-run (läsande, körs före):
-- SELECT COUNT(*) FROM price_list;                       -- → 0
-- SELECT last_value, is_called FROM price_list_id_seq;   -- → is_called = false

DROP TABLE IF EXISTS price_list CASCADE;

-- Verifiering (körs efteråt):
-- SELECT to_regclass('public.price_list');  -- → NULL
