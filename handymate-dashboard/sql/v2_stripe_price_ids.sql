-- Seed Stripe price IDs för produktionsplanerna
-- Körs manuellt i Supabase SQL Editor.
--
-- Priserna är skapade i Stripe Dashboard (live mode) och kopplar
-- billing_plan-raden till rätt återkommande pris.
--
-- Matchar på name (Bas / Pro / Business) eftersom plan_id kan variera
-- mellan miljöer.

UPDATE billing_plan
SET stripe_price_id = 'price_1TEqXkEOkbEJyOgC5dpXPePq'
WHERE name IN ('Bas', 'Starter');

UPDATE billing_plan
SET stripe_price_id = 'price_1TEqYCEOkbEJyOgCJYGPslmR'
WHERE name IN ('Pro', 'Professional');

UPDATE billing_plan
SET stripe_price_id = 'price_1TEqYcEOkbEJyOgCdxP0TOOG'
WHERE name = 'Business';

-- Verifiering — alla tre planer ska ha stripe_price_id satt
SELECT plan_id, name, price_sek, stripe_price_id
FROM billing_plan
ORDER BY sort_order;
