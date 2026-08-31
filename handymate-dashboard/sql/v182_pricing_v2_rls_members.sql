-- v182 (Prisslingan V2, pass 2 / D2): kundprissättningslagrets RLS släpper
-- in AKTIVA ANSTÄLLDA, inte bara ägaren.
--
-- Bakgrund: v14-policyerna täcker enbart business_config.user_id = ägaren.
-- Offert-editorns kundprislist-prefill (app/dashboard/quotes/new/page.tsx)
-- läser price_lists_v2 klient-side med anon-nyckeln — en ANSTÄLLD fick
-- alltid tomt svar och därmed TYST FEL PRISBILD för kunder med egen
-- prislista. Samma UNION-mönster som products (v89) använder.
--
-- Additiv behörighetsutvidgning — ingen data rörs. service_role-policyerna
-- (v14 rad 85-87) lämnas orörda.

DROP POLICY IF EXISTS "User segments" ON customer_segments;
CREATE POLICY "User segments" ON customer_segments FOR ALL USING (
  business_id IN (
    SELECT business_id FROM business_config WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM business_users WHERE user_id = auth.uid() AND is_active = true
  )
);

DROP POLICY IF EXISTS "User contract_types" ON contract_types;
CREATE POLICY "User contract_types" ON contract_types FOR ALL USING (
  business_id IN (
    SELECT business_id FROM business_config WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM business_users WHERE user_id = auth.uid() AND is_active = true
  )
);

DROP POLICY IF EXISTS "User price_lists_v2" ON price_lists_v2;
CREATE POLICY "User price_lists_v2" ON price_lists_v2 FOR ALL USING (
  business_id IN (
    SELECT business_id FROM business_config WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM business_users WHERE user_id = auth.uid() AND is_active = true
  )
);

DROP POLICY IF EXISTS "User price_list_items_v2" ON price_list_items_v2;
CREATE POLICY "User price_list_items_v2" ON price_list_items_v2 FOR ALL USING (
  business_id IN (
    SELECT business_id FROM business_config WHERE user_id = auth.uid()
    UNION
    SELECT business_id FROM business_users WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Verifiering (körs efteråt):
-- SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
--  WHERE polrelid IN ('customer_segments'::regclass, 'contract_types'::regclass,
--                     'price_lists_v2'::regclass, 'price_list_items_v2'::regclass)
--    AND polname LIKE 'User %';
-- → alla fyra ska innehålla business_users-UNION:en.
