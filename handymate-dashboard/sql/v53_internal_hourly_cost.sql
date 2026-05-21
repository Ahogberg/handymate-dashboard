-- v53_internal_hourly_cost.sql
-- Etapp 2 av projekt-konsolidering (2026-05-21).
-- Referens: tasks/projekt-domain-audit-2026-05-20.md — budget-modellen
-- saknar separation mellan intäkter och faktisk arbetskostnad.
--
-- Bakgrund: idag finns `business_users.hourly_cost` men ingen tydligt
-- namngiven intern-kostnad-kolumn. Andreas val 2026-05-21: skapa
-- parallellt `internal_hourly_cost` för att undvika risk att den
-- befintliga `hourly_cost` används i annat syfte i frontend/UI utan
-- vår vetskap. Den befintliga kolumnen orörd.
--
-- Plus ny `default_internal_hourly_cost` på business_config — fallback
-- när enskild medlem saknar satt intern kostnad.

-- ── 1. Per-medlem intern timkostnad ──────────────────────────
ALTER TABLE business_users
  ADD COLUMN IF NOT EXISTS internal_hourly_cost NUMERIC(10,2);

COMMENT ON COLUMN business_users.internal_hourly_cost IS
  'Intern arbetskostnad per timme för marginal-analys (lön + sociala avgifter + overhead). Skall ej blandas med hourly_rate (kundpris) eller hourly_cost (legacy, kan vara annat).';

-- ── 2. Business-default fallback ─────────────────────────────
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS default_internal_hourly_cost NUMERIC(10,2);

COMMENT ON COLUMN business_config.default_internal_hourly_cost IS
  'Default intern timkostnad när enskild medlem saknar satt internal_hourly_cost. Används som fallback i compute-economics-helpern (Etapp 2.1).';

-- Verifiering efter körning:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'business_users' AND column_name = 'internal_hourly_cost';
-- → en rad, numeric
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'business_config' AND column_name = 'default_internal_hourly_cost';
-- → en rad, numeric
--
-- Båda kolumner är nullable och saknar default — det är medvetet. Compute-
-- helpern måste explicit hantera fallet "ingen kostnad konfigurerad" och
-- sätta arbetskostnad_konfigurerad=false istället för att falskt rapportera
-- hög marginal. Etapp 2.1 implementerar det.
