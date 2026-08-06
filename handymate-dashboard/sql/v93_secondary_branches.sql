-- ═══════════════════════════════════════════════════════════════════════════
-- v93 — Hantverkaren får ha fler än en bransch
-- ═══════════════════════════════════════════════════════════════════════════
--
-- VARFÖR
--
-- `business_config.branch` är en enda TEXT-kolumn, och hela seedningen
-- (artiklar, prislista, reservationer, checklistor, standardtexter) väljer
-- sortiment ur den. Verkligheten är sällan en bransch: Bee arbetar både som
-- elektriker och med bygg. Med en kolumn får han en halv artikelbank för ett
-- helt jobb — och fyller resten för hand, vilket är precis det systemet ska
-- ta bort.
--
-- VARFÖR EN NY KOLUMN OCH INTE EN KOMMALISTA I `branch`
--
-- `branch` läses med likhetsjämförelse på flera ställen (mallval, avtalstyper,
-- normaliseringen i seed-defaults). En kommalista i samma kolumn hade tyst
-- fått varje sådan jämförelse att missa, utan att något kastar. Huvudbranschen
-- står kvar orörd i `branch`; det här är ett TILLÄGG.
--
-- Kör i Supabase SQL Editor. Idempotent — kan köras om.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS secondary_branches TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN business_config.secondary_branches IS
  'Ytterligare branscher utöver branch. Sortimenten slås ihop och dedupliceras på sku (lib/product-defaults.ts). Huvudbranschen står i branch och ska INTE upprepas här.';

-- Huvudbranschen ska aldrig ligga i listan också — sammanslagningen
-- deduplicerar på sku, men en dubblett här hade gjort avsikten otydlig för
-- den som läser raden.
ALTER TABLE business_config
  DROP CONSTRAINT IF EXISTS business_config_secondary_branches_not_primary;

ALTER TABLE business_config
  ADD CONSTRAINT business_config_secondary_branches_not_primary
  CHECK (branch IS NULL OR NOT (branch = ANY(secondary_branches)));

-- ═══ BEE — ELEKTRIKER OCH BYGG ═══
--
-- Pilotkontot är den konkreta anledningen till migrationen. Sätts bara om
-- huvudbranschen faktiskt är electrician, så satsen inte tyst gör fel om
-- kontot ser annorlunda ut än väntat.
--
-- Artiklarna kommer INTE med av sig själva: seedningen körs vid onboarding.
-- Kör POST /api/admin/backfill-products efteråt för konton som redan finns
-- (den hoppar över den som redan har artiklar — töm produktbanken först om
-- den ska seedas om).

UPDATE business_config
SET secondary_branches = ARRAY['construction']
WHERE branch = 'electrician'
  AND business_name ILIKE '%bee%';

-- ═══ KONTROLL ═══
-- SELECT business_id, business_name, branch, secondary_branches FROM business_config;
