-- v54_backfill_project_budget_from_quote.sql
-- Pilot-blocker backfill (2026-05-22).
-- Förutsätter att commits 941a403e + 4d117502 är deployade
-- (helper + konverterings-vägar uppdaterade).
--
-- Bakgrund: tidigare läste offert→projekt-konverteringen bara
-- quote.items JSONB. För nya offerter (data i quote_items-tabellen)
-- gav det null budget. Etapp 2 ekonomi-vyn visar fel för dessa.
-- Helpern get-quote-budget-derivation läser nu primärt quote_items,
-- fallback JSONB, fallback quote.total — denna backfill matchar
-- exakt samma logik för EXISTERANDE projekt med null budget.
--
-- ORDNING:
--   1. Kör Del A (räkning) först — får en känsla för skala
--   2. Kör Del B (per-projekt-dry-run) — granska beräknade värden
--   3. Andreas godkänner → avkommentera Del C (UPDATE) och kör i transaction
--
-- Edge-case (medvetet): projekt vars offert är HELT tom
-- (ingen quote_items, ingen JSONB, ingen quote.total) förblir
-- budget_amount = NULL. Backfill sätter aldrig 0 där.

-- ============================================================
-- DEL A — RÄKNING (kör först)
-- ============================================================

WITH calc AS (
  SELECT
    p.project_id,
    p.budget_amount AS current_budget,
    -- quote_items-tabellen (primär källa, samma som helpern)
    (SELECT SUM(qi.total)
       FROM quote_items qi
       WHERE qi.quote_id = p.quote_id
         AND (qi.item_type IS NULL OR qi.item_type = 'item')
    ) AS table_total,
    -- JSONB-fallback
    (SELECT SUM(COALESCE((item->>'total')::numeric, 0))
       FROM jsonb_array_elements(COALESCE(q.items, '[]'::jsonb)) item
       WHERE item->>'item_type' IS NULL OR item->>'item_type' = 'item'
    ) AS jsonb_total,
    -- quote.total (sista utvägen)
    q.total AS quote_total
  FROM project p
  LEFT JOIN quotes q ON q.quote_id = p.quote_id
  WHERE p.quote_id IS NOT NULL
    AND p.budget_amount IS NULL
)
SELECT
  COUNT(*) AS total_kandidater,
  COUNT(*) FILTER (WHERE COALESCE(table_total, 0) > 0) AS skulle_uppdateras_fran_tabell,
  COUNT(*) FILTER (WHERE COALESCE(table_total, 0) = 0 AND COALESCE(jsonb_total, 0) > 0) AS skulle_uppdateras_fran_jsonb,
  COUNT(*) FILTER (WHERE COALESCE(table_total, 0) = 0 AND COALESCE(jsonb_total, 0) = 0 AND COALESCE(quote_total, 0) > 0) AS skulle_uppdateras_fran_total,
  COUNT(*) FILTER (
    WHERE COALESCE(table_total, 0) = 0
      AND COALESCE(jsonb_total, 0) = 0
      AND COALESCE(quote_total, 0) = 0
  ) AS forblir_null_helt_tom_offert
FROM calc;

-- ============================================================
-- DEL B — PER-PROJEKT DRY-RUN (kör efter A)
-- ============================================================

WITH calc AS (
  SELECT
    p.project_id,
    p.name,
    p.quote_id,
    p.business_id,
    p.created_at,
    p.budget_amount AS current_budget,
    p.budget_hours AS current_hours,
    (SELECT SUM(qi.total)
       FROM quote_items qi
       WHERE qi.quote_id = p.quote_id
         AND (qi.item_type IS NULL OR qi.item_type = 'item')
    ) AS table_total,
    (SELECT SUM(qi.quantity)
       FROM quote_items qi
       WHERE qi.quote_id = p.quote_id
         AND (qi.item_type IS NULL OR qi.item_type = 'item')
         AND (
           COALESCE(qi.is_rot_eligible, false)
           OR COALESCE(qi.is_rut_eligible, false)
           OR LOWER(COALESCE(qi.unit, '')) IN ('tim', 'h', 'timmar', 'hour')
         )
    ) AS table_hours,
    (SELECT SUM(COALESCE((item->>'total')::numeric, 0))
       FROM jsonb_array_elements(COALESCE(q.items, '[]'::jsonb)) item
       WHERE item->>'item_type' IS NULL OR item->>'item_type' = 'item'
    ) AS jsonb_total,
    (SELECT SUM(COALESCE((item->>'quantity')::numeric, 0))
       FROM jsonb_array_elements(COALESCE(q.items, '[]'::jsonb)) item
       WHERE (item->>'item_type' IS NULL OR item->>'item_type' = 'item')
         AND (
           item->>'type' = 'labor'
           OR COALESCE((item->>'is_rot_eligible')::boolean, false)
           OR COALESCE((item->>'is_rut_eligible')::boolean, false)
           OR LOWER(COALESCE(item->>'unit', '')) IN ('tim', 'h', 'timmar', 'hour')
         )
    ) AS jsonb_hours,
    q.total AS quote_total,
    q.quote_number,
    q.status AS quote_status
  FROM project p
  LEFT JOIN quotes q ON q.quote_id = p.quote_id
  WHERE p.quote_id IS NOT NULL
    AND p.budget_amount IS NULL
)
SELECT
  project_id,
  name,
  quote_number,
  quote_status,
  to_char(created_at, 'YYYY-MM-DD') AS projekt_skapat,
  current_budget,
  -- Beräknad budget enligt helper-prio
  COALESCE(
    NULLIF(table_total, 0),
    NULLIF(jsonb_total, 0),
    NULLIF(quote_total, 0)
  ) AS ny_budget_amount,
  -- Beräknade timmar (bara från tabell + JSONB, inte total-fallback)
  COALESCE(
    NULLIF(table_hours, 0),
    NULLIF(jsonb_hours, 0)
  ) AS ny_budget_hours,
  -- Vilken källa skulle användas
  CASE
    WHEN COALESCE(table_total, 0) > 0 THEN 'quote_items_table'
    WHEN COALESCE(jsonb_total, 0) > 0 THEN 'jsonb_legacy'
    WHEN COALESCE(quote_total, 0) > 0 THEN 'total_fallback'
    ELSE 'empty (förblir NULL)'
  END AS source,
  business_id
FROM calc
ORDER BY created_at DESC NULLS LAST;

-- ============================================================
-- DEL C — UPDATE (avkommentera EFTER Andreas-godkännande)
-- ============================================================
--
-- BEGIN;
--
-- WITH calc AS (
--   SELECT
--     p.project_id,
--     (SELECT SUM(qi.total)
--        FROM quote_items qi
--        WHERE qi.quote_id = p.quote_id
--          AND (qi.item_type IS NULL OR qi.item_type = 'item')
--     ) AS table_total,
--     (SELECT SUM(qi.quantity)
--        FROM quote_items qi
--        WHERE qi.quote_id = p.quote_id
--          AND (qi.item_type IS NULL OR qi.item_type = 'item')
--          AND (
--            COALESCE(qi.is_rot_eligible, false)
--            OR COALESCE(qi.is_rut_eligible, false)
--            OR LOWER(COALESCE(qi.unit, '')) IN ('tim', 'h', 'timmar', 'hour')
--          )
--     ) AS table_hours,
--     (SELECT SUM(COALESCE((item->>'total')::numeric, 0))
--        FROM jsonb_array_elements(COALESCE(q.items, '[]'::jsonb)) item
--        WHERE item->>'item_type' IS NULL OR item->>'item_type' = 'item'
--     ) AS jsonb_total,
--     (SELECT SUM(COALESCE((item->>'quantity')::numeric, 0))
--        FROM jsonb_array_elements(COALESCE(q.items, '[]'::jsonb)) item
--        WHERE (item->>'item_type' IS NULL OR item->>'item_type' = 'item')
--          AND (
--            item->>'type' = 'labor'
--            OR COALESCE((item->>'is_rot_eligible')::boolean, false)
--            OR COALESCE((item->>'is_rut_eligible')::boolean, false)
--            OR LOWER(COALESCE(item->>'unit', '')) IN ('tim', 'h', 'timmar', 'hour')
--          )
--     ) AS jsonb_hours,
--     q.total AS quote_total
--   FROM project p
--   LEFT JOIN quotes q ON q.quote_id = p.quote_id
--   WHERE p.quote_id IS NOT NULL
--     AND p.budget_amount IS NULL
-- )
-- UPDATE project p
-- SET
--   budget_amount = COALESCE(
--     NULLIF(c.table_total, 0),
--     NULLIF(c.jsonb_total, 0),
--     NULLIF(c.quote_total, 0)
--   ),
--   budget_hours = COALESCE(
--     p.budget_hours,
--     NULLIF(c.table_hours, 0),
--     NULLIF(c.jsonb_hours, 0)
--   )
-- FROM calc c
-- WHERE p.project_id = c.project_id
--   AND COALESCE(
--     NULLIF(c.table_total, 0),
--     NULLIF(c.jsonb_total, 0),
--     NULLIF(c.quote_total, 0)
--   ) IS NOT NULL;
--
-- -- Verifiering före COMMIT:
-- SELECT
--   COUNT(*) FILTER (WHERE budget_amount IS NOT NULL) AS med_budget,
--   COUNT(*) FILTER (WHERE budget_amount IS NULL AND quote_id IS NOT NULL) AS fortfarande_null
-- FROM project;
--
-- -- Om allt ser bra ut:
-- COMMIT;
-- -- Annars: ROLLBACK;

-- ============================================================
-- ANMÄRKNINGAR
-- ============================================================
--
-- 1. project_type backfilas INTE av denna script. Det kräver räkning
--    av labor-rader vs material-rader vilket är mer komplex SQL. Om
--    project_type är 'fixed_price' på ett 'mixed'-projekt syns det inte
--    i Etapp 2-ekonomin (beror på budget_amount, inte project_type).
--    Loggas som TD om någon flikar fel project_type-display.
--
-- 2. Heuristik labor-vs-material i denna SQL ska matcha exakt
--    isLaborByTableRow + isLaborByJsonbItem i
--    lib/quotes/get-quote-budget-derivation.ts. Justeringar i helpern
--    bör spegla sig här om backfill körs igen senare.
--
-- 3. Edge-case "offert utan rader men med quote.total" hanteras via
--    total_fallback i UPDATE (NULLIF(quote_total, 0)). Det är samma
--    beteende som helpern.
--
-- 4. Helt tomma offerter (quote.total = 0 OCH inga rader någonstans)
--    förblir med budget_amount = NULL — vilket är korrekt enligt
--    Andreas spec. Backfill ska inte sätta 0 på dessa.
