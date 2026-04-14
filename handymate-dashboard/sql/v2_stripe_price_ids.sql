-- Seed Stripe price IDs för produktionsplanerna
-- Körs manuellt i Supabase SQL Editor.
--
-- Priserna är skapade i Stripe Dashboard (live mode) och kopplar
-- billing_plan-raden till rätt återkommande pris.

UPDATE billing_plan
SET stripe_price_id = 'price_1TEqXkEOkbEJyOgC5dpXPePq'
WHERE plan_id = 'starter';

UPDATE billing_plan
SET stripe_price_id = 'price_1TEqYCEOkbEJyOgCJYGPslmR'
WHERE plan_id = 'professional';

UPDATE billing_plan
SET stripe_price_id = 'price_1TEqYcEOkbEJyOgCdxP0TOOG'
WHERE plan_id = 'business';

-- Verifiering
SELECT plan_id, name, price_sek, stripe_price_id
FROM billing_plan
ORDER BY sort_order;
