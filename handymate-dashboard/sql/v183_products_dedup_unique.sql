-- v183 (Prisslingan V2, pass 3 / C2): slå ihop produktdubbletter och lås
-- (business_id, namn, enhet) unikt.
--
-- ⚠️ DESTRUKTIV (DELETE av dubblettrader) — körs via MCP FÖRST efter att
-- Andreas sett filen och sagt "kör v183" i chatten (CLAUDE.md-regeln).
--
-- Prod-läget vid skrivning (verifierat läsande 2026-08-31): 15 dubblett-
-- grupper i 11 businesses — 'tillbyggnad'/kvm ×11 (en prissatt + en prislös,
-- seed-buggen HM-BYG-012/018, källfixad i C1), 'lärling'/tim ×3 (båda
-- prislösa, EL+BYG-seed), 'arbete'/tim ×1 hos Bee (BÅDA prissatta 650 —
-- tie-break: äldst vinner). quote_items har 9 linked_product_id totalt.
--
-- Regler:
--  * Kanonisk rad per grupp: PRISSATT (sales_price>0) vinner; vid lika —
--    äldsta created_at, sist lägsta id (deterministiskt).
--  * ALLA pekare flyttas FÖRE delete: quote_items.linked_product_id
--    (SET NULL-FK), product_components.product_id och
--    reservation_triggers.product_id (⚠️ ON DELETE CASCADE — utan ompekning
--    raderas triggarna tyst).
--  * Dubblett-triggers efter ompekning rensas (samma reservation+produkt ×2).
--
-- ── DRY RUN (kör dessa LÄSANDE innan transaktionen, spara utfallen) ──
-- SELECT business_id, LOWER(TRIM(name)) n, unit, COUNT(*),
--        SUM((sales_price>0)::int) prissatta
--   FROM products GROUP BY 1,2,3 HAVING COUNT(*)>1 ORDER BY 1;
-- SELECT COUNT(*) FROM quote_items qi JOIN products p ON p.id = qi.linked_product_id;
-- SELECT COUNT(*) FROM reservation_triggers WHERE product_id IS NOT NULL;

BEGIN;

-- 1. Kanonisk rad + mappning dubblett → kanonisk
CREATE TEMP TABLE dedup_map ON COMMIT DROP AS
WITH grupper AS (
  SELECT id, business_id, LOWER(TRIM(name)) AS n, unit,
         ROW_NUMBER() OVER (
           PARTITION BY business_id, LOWER(TRIM(name)), unit
           ORDER BY (sales_price > 0) DESC, created_at ASC, id ASC
         ) AS rn,
         FIRST_VALUE(id) OVER (
           PARTITION BY business_id, LOWER(TRIM(name)), unit
           ORDER BY (sales_price > 0) DESC, created_at ASC, id ASC
         ) AS kanonisk_id
  FROM products
)
SELECT id AS dubblett_id, kanonisk_id
FROM grupper
WHERE rn > 1;

-- 2. Peka om ALLA referenser (FÖRE delete — reservation_triggers CASCADE:ar!)
UPDATE quote_items qi
   SET linked_product_id = m.kanonisk_id
  FROM dedup_map m
 WHERE qi.linked_product_id = m.dubblett_id;

UPDATE product_components pc
   SET product_id = m.kanonisk_id
  FROM dedup_map m
 WHERE pc.product_id = m.dubblett_id;

UPDATE reservation_triggers rt
   SET product_id = m.kanonisk_id
  FROM dedup_map m
 WHERE rt.product_id = m.dubblett_id;

-- 2b. Trigger-dubbletter efter ompekning (samma reservation + produkt två
-- gånger) — behåll en per par.
DELETE FROM reservation_triggers rt
 USING reservation_triggers rt2
 WHERE rt.product_id IS NOT NULL
   AND rt.product_id = rt2.product_id
   AND rt.reservation_id = rt2.reservation_id
   AND rt.id > rt2.id;

-- 3. Radera dubblettraderna
DELETE FROM products p
 USING dedup_map m
 WHERE p.id = m.dubblett_id;

-- 4. Lås invarianten (FULL unik — soft-delete-återaktivering ska träffa
-- samma rad, aldrig skapa en ny)
CREATE UNIQUE INDEX IF NOT EXISTS products_business_name_unit_key
  ON products (business_id, LOWER(TRIM(name)), unit);

COMMIT;

-- ── VERIFIERING (körs direkt efteråt) ──
-- (a) inga grupper kvar:
-- SELECT COUNT(*) FROM (SELECT 1 FROM products
--   GROUP BY business_id, LOWER(TRIM(name)), unit HAVING COUNT(*)>1) x;  -- → 0
-- (b) inga föräldralösa pekare:
-- SELECT COUNT(*) FROM quote_items qi LEFT JOIN products p ON p.id = qi.linked_product_id
--  WHERE qi.linked_product_id IS NOT NULL AND p.id IS NULL;               -- → 0
-- SELECT COUNT(*) FROM reservation_triggers rt LEFT JOIN products p ON p.id = rt.product_id
--  WHERE rt.product_id IS NOT NULL AND p.id IS NULL;                      -- → 0
-- (c) indexet finns:
-- SELECT indexname FROM pg_indexes WHERE indexname = 'products_business_name_unit_key';
