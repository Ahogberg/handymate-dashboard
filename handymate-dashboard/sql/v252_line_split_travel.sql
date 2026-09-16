-- v252_line_split_travel.sql — obligatorisk delning arbete/material/resa per offertrad.
-- Claude-utkast 2026-09-16 till briefen docs/strategy/ARTIKLAR_MALLAR_ROT_BRIEF.md. INTE körd.
--
-- Bakgrund: ROT ges bara på arbetskostnaden (Skatteverket), aldrig på material eller resor.
-- v67 införde labor_amount/material_amount som frivilliga; i produktion har 10 av 122 rader
-- en delning, och fakturamotorn läser den inte. Denna migration gör delningen obligatorisk
-- (labor + material + travel = total på varje item-rad), lägger till resa som tredje del,
-- backfillar befintliga rader efter kategori/enhet/flagga och låser invarianten med en CHECK.
--
-- Rör inte: quotes.rot_deduction på redan sparade offerter (räknas om vid nästa sparning),
-- quote_templates.job_type_slug (v187: uttryckligt val, aldrig namngissning — seedningen
-- sätter det framåt i kod), kärnans tabeller.
-- Idempotent: kan köras flera gånger.
BEGIN;

-- ── 1. Artikeln bär delningen: arbetsandel (v67) + reseandel (ny), summa ≤ 1 ──
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_travel_share NUMERIC;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_default_travel_share_check;
ALTER TABLE public.products ADD CONSTRAINT products_default_travel_share_check
  CHECK (default_travel_share IS NULL OR (default_travel_share >= 0 AND default_travel_share <= 1));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_share_sum_check;
ALTER TABLE public.products ADD CONSTRAINT products_share_sum_check
  CHECK (COALESCE(default_labor_share, 0) + COALESCE(default_travel_share, 0) <= 1);
COMMENT ON COLUMN public.products.default_travel_share IS
  'Andel av priset som är resa/framkörning (0–1). Aldrig ROT-grundande. Summan med default_labor_share är högst 1; resten är material.';

-- Backfill av artiklar som saknar andel: arbete → 1, material/hyra → 0. Resartiklar känns igen
-- på namnet med en snäv lista (inte "res%": det träffar reservdelar) och blir 100 % resa, aldrig ROT.
UPDATE public.products SET default_labor_share = 1
  WHERE default_labor_share IS NULL AND category = 'arbete';
UPDATE public.products SET default_labor_share = 0
  WHERE default_labor_share IS NULL AND category IN ('material', 'hyra');
UPDATE public.products SET default_travel_share = 1, default_labor_share = 0, rot_eligible = false, rut_eligible = false
  WHERE COALESCE(default_travel_share, 0) = 0
    AND (name ILIKE 'resa%' OR name ILIKE 'resor%' OR name ILIKE 'restid%' OR name ILIKE 'framkörning%'
         OR name ILIKE 'servicebil%' OR name ILIKE 'milersättning%' OR name ILIKE 'utkörning%');
UPDATE public.products SET default_travel_share = 0 WHERE default_travel_share IS NULL;
ALTER TABLE public.products ALTER COLUMN default_travel_share SET DEFAULT 0;

-- ── 2. Komponenter får en tredje typ ──
ALTER TABLE public.product_components DROP CONSTRAINT IF EXISTS product_components_component_type_check;
ALTER TABLE public.product_components ADD CONSTRAINT product_components_component_type_check
  CHECK (component_type IN ('arbete', 'material', 'resa'));

-- ── 3. Offertraden: tre belopp som alltid summerar till radens total ──
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS travel_amount NUMERIC;
COMMENT ON COLUMN public.quote_items.travel_amount IS
  'Resa/framkörning i kronor på raden. labor_amount + material_amount + travel_amount = total för varje item-rad (quote_items_split_sum). Aldrig ROT-grundande.';

-- Backfill A: rader som redan har en arbetsdel (v67) får resten som material och 0 resa.
UPDATE public.quote_items
   SET travel_amount = COALESCE(travel_amount, 0),
       material_amount = round(COALESCE(total, 0) - labor_amount - COALESCE(travel_amount, 0), 2)
 WHERE item_type = 'item' AND labor_amount IS NOT NULL
   AND (material_amount IS NULL OR travel_amount IS NULL
        OR abs(labor_amount + COALESCE(material_amount, 0) + COALESCE(travel_amount, 0) - COALESCE(total, 0)) >= 0.01);

-- Backfill B: rader utan arbetsdel klassas i ordning: kategori → enhet → ROT/RUT-flagga → material.
-- Systemkategorierna kommer från v13 (arbete_* är ROT-grundande; material_*, hyra, ue, resa, ovrigt är det inte).
UPDATE public.quote_items q
   SET labor_amount    = CASE WHEN c.cls = 'labor'  THEN COALESCE(q.total, 0) ELSE 0 END,
       material_amount = CASE WHEN c.cls = 'material' THEN COALESCE(q.total, 0) ELSE 0 END,
       travel_amount   = CASE WHEN c.cls = 'travel' THEN COALESCE(q.total, 0) ELSE 0 END
  FROM (
    SELECT id,
           CASE WHEN category_slug LIKE 'arbete\_%' THEN 'labor'
                WHEN category_slug = 'resa' THEN 'travel'
                WHEN category_slug LIKE 'material\_%' OR category_slug IN ('hyra', 'ue', 'ovrigt') THEN 'material'
                WHEN lower(COALESCE(unit, '')) IN ('tim', 'timmar', 'timme', 'hour', 'hours', 'h') THEN 'labor'
                WHEN COALESCE(is_rot_eligible, false) OR COALESCE(is_rut_eligible, false) THEN 'labor'
                ELSE 'material' END AS cls
      FROM public.quote_items WHERE item_type = 'item' AND labor_amount IS NULL
  ) c
 WHERE q.id = c.id;

-- Invarianten. NOT VALID först så att en avvikande rad syns i loggen i stället för att stoppa
-- migrationen; VALIDATE direkt efter (produktion 2026-09-16: 0 rader avviker).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quote_items'::regclass AND conname = 'quote_items_split_sum') THEN
    ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_split_sum CHECK (
      item_type <> 'item' OR (
        labor_amount IS NOT NULL AND material_amount IS NOT NULL AND travel_amount IS NOT NULL
        AND abs(labor_amount + material_amount + travel_amount - COALESCE(total, 0)) < 0.01
      )
    ) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.quote_items VALIDATE CONSTRAINT quote_items_split_sum;

-- ── 4. Offerthuvudet: resesumma bredvid labor_total/material_total ──
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS travel_total NUMERIC DEFAULT 0;
UPDATE public.quotes q SET travel_total = s.travel
  FROM (SELECT quote_id, round(SUM(COALESCE(travel_amount, 0)), 2) AS travel
          FROM public.quote_items WHERE item_type = 'item' GROUP BY quote_id) s
 WHERE q.quote_id = s.quote_id AND COALESCE(q.travel_total, 0) IS DISTINCT FROM s.travel;

COMMIT;

-- Read-only verifiering efter körning:
--   SELECT count(*) FROM quote_items WHERE item_type='item' AND (labor_amount IS NULL OR material_amount IS NULL OR travel_amount IS NULL);  -- 0
--   SELECT conname, convalidated FROM pg_constraint WHERE conname IN ('quote_items_split_sum','products_share_sum_check');   -- båda true
--   SELECT count(*) FROM products WHERE default_travel_share = 1;  -- resartiklarna
