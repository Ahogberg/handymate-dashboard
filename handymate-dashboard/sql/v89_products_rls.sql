-- v89: RLS-härdning av produktbanken
-- Kör manuellt i Supabase SQL Editor — MEN LÄS VARNINGEN FÖRST.
-- =============================================================================
--
-- VARFÖR: products har haft en helt öppen policy sedan sql/v12_products.sql:36
-- (FOR ALL USING (true) WITH CHECK (true)), till skillnad från v67:s tabeller
-- som är business-scopade. Produktbanken innehåller hantverkarens inköpspriser
-- och marginaler — den bör inte vara läsbar tvärs kunder.
--
-- ⚠️ VARNING — VERIFIERA FÖRE KÖRNING I PROD:
-- products är den ENDA av dessa tabeller som läses direkt av webbläsaren med
-- anon-nyckeln (app/dashboard/quotes/_shared/usePriceListLookup.ts:37-43), som
-- matar snabbvalsknapparna i offert-editorn. Alla andra business-scopade
-- policyer i repot (v14, v67) träffas bara av service_role-anrop och har
-- därför aldrig testats mot en riktig webbläsarsession.
--
-- Om policyn inte matchar den inloggade användaren blir snabbvalsknapparna
-- TOMMA — tyst, utan felmeddelande. Policyn nedan täcker därför BÅDE ägaren
-- (business_config.user_id) och teammedlemmar (business_users.user_id), och
-- castar båda sidor till text eftersom business_users.user_id är TEXT medan
-- auth.uid() är uuid.
--
-- GÖR SÅ HÄR:
--   1. Kör filen.
--   2. Logga in som ÄGARE → öppna Ny offert → kontrollera att
--      snabbvalsknapparna under radlistan fortfarande visar artiklar.
--   3. Logga in som ANSTÄLLD (om sådan finns) → samma kontroll.
--   4. Om någon lista är tom: kör återställningen längst ned i filen och
--      hör av dig — då stämmer inte user_id-kopplingen som antas här.

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Den öppna policyn från v12
DROP POLICY IF EXISTS "products_all" ON products;

DROP POLICY IF EXISTS "Service products" ON products;
CREATE POLICY "Service products" ON products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "User products" ON products;
CREATE POLICY "User products" ON products FOR ALL USING (
  business_id IN (
    SELECT business_id FROM business_config WHERE user_id::text = auth.uid()::text
    UNION
    SELECT business_id FROM business_users  WHERE user_id::text = auth.uid()::text
  )
);

-- Verifiering:
--   SELECT polname FROM pg_policy WHERE polrelid = 'products'::regclass;
--     → Service products, User products
--
-- ÅTERSTÄLLNING om snabbvalsknapparna blir tomma:
--   DROP POLICY IF EXISTS "User products" ON products;
--   DROP POLICY IF EXISTS "Service products" ON products;
--   CREATE POLICY "products_all" ON products FOR ALL USING (true) WITH CHECK (true);
