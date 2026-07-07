-- v67_produktbank.sql — Produktbank: kategorier (2 nivåer), komponenter,
-- snapshot-kolumner på quote_items + migrering av gamla prislisterader.
--
-- Körs manuellt i Supabase SQL Editor (Handymate-projektet!).
-- Idempotent: kan köras flera gånger utan skada.
--
-- Bakgrund (tasks/produktbank-spec.md): utökar v12 products i stället för
-- ett femte prissystem. quote_items.linked_product_id (v47) återanvänds.
-- Snapshot-principen: offerten kopierar in allt den behöver vid skapande —
-- produktändringar rör ALDRIG befintliga offerter.

-- ============================================================
-- 1. Kategorier — exakt 2 nivåer (huvudrubrik → underrubrik)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES product_categories(id) ON DELETE CASCADE, -- NULL = huvudrubrik
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_categories_biz
  ON product_categories(business_id, parent_id);

-- 2-nivåersregeln enforc:as i API:t; triggern är backstopp så att djupare
-- träd aldrig kan uppstå ens vid direktskrivning.
CREATE OR REPLACE FUNCTION enforce_two_level_categories() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT parent_id FROM product_categories WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Max två kategorinivåer';
    END IF;
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Kategori kan inte vara sin egen förälder';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_two_level_categories ON product_categories;
CREATE TRIGGER trg_two_level_categories
  BEFORE INSERT OR UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION enforce_two_level_categories();

-- ============================================================
-- 2. products — utökning av v12
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_labor_share NUMERIC
    CHECK (default_labor_share IS NULL OR (default_labor_share >= 0 AND default_labor_share <= 1));

COMMENT ON COLUMN products.default_labor_share IS
  'Andel av priset som är arbete (0–1) för ENKLA produkter utan komponenter. 0 = ren material (giltigt värde!), 1 = rent arbete, NULL = ingen split (legacy-beteende). Sammansatta produkter härleder andelen från komponenterna.';

-- Artikelnr = befintliga sku-kolumnen. Unikt per business, case-insensitivt,
-- NULL tillåts (produkt utan artikelnr).
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique
  ON products (business_id, LOWER(sku)) WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)
  WHERE category_id IS NOT NULL;

-- ============================================================
-- 3. Komponenter — INTERNA, expanderar aldrig till synliga offertrader
-- ============================================================
CREATE TABLE IF NOT EXISTS product_components (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  component_type TEXT NOT NULL CHECK (component_type IN ('arbete', 'material')),
  description TEXT NOT NULL,                     -- "Målningsarbete", "Grundfärg"
  quantity_per_unit NUMERIC NOT NULL DEFAULT 1,  -- 0.13 (tim per kvm), 0.1 (liter per kvm)
  unit TEXT NOT NULL DEFAULT 'st',               -- komponentens egen enhet (tim/l/kg/st)
  unit_cost NUMERIC NOT NULL DEFAULT 0,          -- kr per komponentenhet (intern kalkyl)
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_components_product
  ON product_components(product_id);

-- ============================================================
-- 4. quote_items — snapshot-kolumner (Del B-kärnan)
-- ============================================================
-- labor_amount/material_amount är AUKTORITATIVA för ROT-basen när de finns.
-- Härledningsordning (öres-invariant per konstruktion):
--   labor_amount = round2(total × arbetsandel)
--   material_amount = total − labor_amount   (härledd, aldrig egen beräkning)
-- Rader utan labor_amount (alla befintliga + fritext + AI) → motorn använder
-- radens total precis som idag. Noll beteendeändring för befintlig data.
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS labor_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS material_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS component_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS show_components_to_customer BOOLEAN DEFAULT false;

COMMENT ON COLUMN quote_items.component_snapshot IS
  'Fryst kopia av produktens komponenter + namn/sku/pris/labor_share vid infogningsögonblicket. Offerten är juridiskt fristående — produktändringar efteråt påverkar ALDRIG denna rad.';

-- ============================================================
-- 5. RLS på nya tabeller (v14-mönstret)
-- ============================================================
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service product_categories" ON product_categories;
CREATE POLICY "Service product_categories" ON product_categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service product_components" ON product_components;
CREATE POLICY "Service product_components" ON product_components
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "User product_categories" ON product_categories;
CREATE POLICY "User product_categories" ON product_categories FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
DROP POLICY IF EXISTS "User product_components" ON product_components;
CREATE POLICY "User product_components" ON product_components FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);

-- ============================================================
-- 6. Migrering: gamla prislisterader → produktbanken (dubblettskyddad)
-- ============================================================
-- Christoffers 5 rader i price_list_items_v2 (+ ev. andra businesses) blir
-- produkter. price_lists_v2 (timpriser/påslag per kundsegment) RÖRS INTE —
-- den är kundprissättningslagret och lever vidare separat.
INSERT INTO products (business_id, name, unit, sales_price, rot_eligible, rut_eligible, category, is_active)
SELECT pli.business_id, pli.name, COALESCE(pli.unit, 'st'), pli.price,
       COALESCE(pli.is_rot_eligible, false), COALESCE(pli.is_rut_eligible, false),
       CASE WHEN pli.unit IN ('tim', 'h', 'timmar', 'hour') THEN 'arbete' ELSE 'övrigt' END,
       true
FROM price_list_items_v2 pli
WHERE pli.name IS NOT NULL AND pli.price IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.business_id = pli.business_id
      AND LOWER(p.name) = LOWER(pli.name)
  );

-- Verifiering efter körning (förväntat: Bee får 5 produkter):
--   SELECT business_id, COUNT(*) FROM products GROUP BY business_id;
--   SELECT name, unit, sales_price, rot_eligible, category FROM products
--     WHERE business_id = 'biz_21wswuhrbhy';
