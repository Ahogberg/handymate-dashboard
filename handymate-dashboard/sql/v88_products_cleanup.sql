-- v88: produktbanken — kategoristädning
-- Kör manuellt i Supabase SQL Editor. Idempotent, säker att köra flera gånger.
-- =============================================================================
--
-- Bakgrund (kartläggning 2026-08-05): products.category är förorenad. Fyra
-- olika värdesystem har skrivits till samma kolumn — v12:s original
-- ('material'/'arbete'/'hyra'/'övrigt'), v13:s offertkategori-slugs
-- ('material_bygg', 'arbete_el', ...), fri text från CSV-importen, och
-- v67-migreringens värden. Det är exakt den kolumn AI-offertgeneratorn
-- grupperar prislistan på (lib/ai-quote-generator.ts:120-128), så skräp där
-- ger sämre AI-offerter.
--
-- RLS-härdningen ligger MEDVETET i en egen fil (v89_products_rls.sql) —
-- den behöver verifieras mot en riktig session innan den körs.
--
-- Verifiering efter körning:
--   SELECT category, COUNT(*) FROM products GROUP BY category ORDER BY 2 DESC;
--     → endast arbete / material / hyra / övrigt ska förekomma

UPDATE products
SET category = CASE
  -- Redan kanoniska värden lämnas orörda
  WHEN category IN ('arbete', 'material', 'hyra', 'övrigt') THEN category

  -- v13:s offertkategori-slugs
  WHEN category LIKE 'arbete_%'   THEN 'arbete'
  WHEN category LIKE 'material_%' THEN 'material'

  -- Engelska och legacy-varianter från import och äldre kod
  WHEN LOWER(category) IN ('labor', 'work', 'service', 'tjänst', 'tjanst') THEN 'arbete'
  WHEN LOWER(category) IN ('rental', 'maskin')                             THEN 'hyra'
  WHEN LOWER(category) IN ('ue', 'resa', 'ovrigt', 'other', 'övrig')       THEN 'övrigt'

  -- Allt annat (fri CSV-text, tomt) → övrigt. Hantverkaren kan omkategorisera
  -- i produktbanken; poängen är att AI-prompten slutar gruppera på skräp.
  ELSE 'övrigt'
END
WHERE category IS NULL
   OR category NOT IN ('arbete', 'material', 'hyra', 'övrigt');
