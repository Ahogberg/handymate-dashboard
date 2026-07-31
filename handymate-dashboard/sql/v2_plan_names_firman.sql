-- v2_plan_names_firman.sql
-- Svenska plannamn (Andreas-beslut 2026-07-31): Professional -> "Firman",
-- Business -> "Storfirman", Starter -> "Bas" (legacy-visning för befintliga
-- konton). Endast VISNINGSNAMN — plan_id, Stripe-objekt och all gating
-- använder oförändrade nycklar. UI:t matchar numera på plan_id, så
-- namnbytet är riskfritt oavsett ordning mot deployen.
--
-- Körs manuellt i Supabase SQL Editor.

UPDATE billing_plan SET name = 'Firman'    WHERE plan_id = 'professional';
UPDATE billing_plan SET name = 'Storfirman' WHERE plan_id = 'business';
UPDATE billing_plan SET name = 'Bas'        WHERE plan_id = 'starter';

-- Verifiering: ska visa Bas / Firman / Storfirman
SELECT plan_id, name, price_sek FROM billing_plan ORDER BY sort_order;
