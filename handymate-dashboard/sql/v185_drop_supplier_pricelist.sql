-- v185 (Prisslingan V2, pass 5 / E): droppa supplier_pricelist.
--
-- ⚠️ DESTRUKTIV (DROP TABLE) — samma grind som v184: Andreas ser filen +
-- säger "kör" före MCP-körning.
--
-- Bevisläget (2026-08-31, pris-datamodellkartläggningen): 0 rader i prod
-- och NOLL kodreferenser i hela repot (enda spåret var RLS-svepets policy i
-- sql/v112). Tabellen har ingen CREATE-fil i sql/ — förhistorisk rest.
--
-- Dry-run (läsande, körs före):
-- SELECT COUNT(*) FROM supplier_pricelist;  -- → 0

DROP TABLE IF EXISTS supplier_pricelist CASCADE;

-- Verifiering (körs efteråt):
-- SELECT to_regclass('public.supplier_pricelist');  -- → NULL
