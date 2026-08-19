-- v156_billing_yearly.sql — Årsavtal (Andreas-beslut 2026-08-19).
--
-- Permanent årsplan: "betala för 10 månader, få 12" (2 månader på köpet).
--   Firman (professional):  59 950 kr/år
--   Storfirman (business): 119 950 kr/år
--   starter/Bas säljs inte publikt — inget årspris.
--
-- Körs manuellt i Supabase SQL Editor. Idempotent + additiv, rör INGA
-- befintliga rader/priser (starter/professional/business förblir
-- oförändrade — de får bara en ny kolumn med default 'monthly').
--
-- billing_plan-schemat (sql/billing.sql): plan_id TEXT PK, name TEXT,
-- price_sek INTEGER, stripe_price_id TEXT, limits JSONB, features JSONB,
-- sort_order INTEGER. Ingen intervall-kolumn fanns — tillagd nedan.

-- 1. Ny kolumn: vilket faktureringsintervall raden gäller. DEFAULT 'monthly'
--    backfyller alla befintliga rader (starter/professional/business) utan
--    att röra deras pris eller stripe_price_id.
ALTER TABLE billing_plan
  ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly'
  CHECK (billing_interval IN ('monthly', 'yearly'));

-- 2. Nya rader för årsavtal — EGNA plan_id (professional_yearly/
--    business_yearly), inte samma plan_id som månadsraderna. Detta är
--    medvetet: koden håller isär "vilken billing_plan-rad prissätter
--    checkouten" (kan vara en årsrad) från "vilken plan_id skrivs till
--    business_config.subscription_plan" (förblir ALLTID basplanen,
--    se app/api/billing/onboarding-checkout/route.ts och
--    app/api/billing/checkout/route.ts) — subscription_plan läses som
--    PlanType ('starter'|'professional'|'business') på 40+ ställen i
--    kodbasen (feature-gates, SMS-kvoter, agentgrindar m.m.), och hade
--    en yearly-suffixad plan_id läckt dit hade den fail-closed nollat allt
--    det för varje årskund.
--
--    limits/features klonas från respektive månadsrad (samma funktions-
--    omfattning — bara faktureringen skiljer). stripe_price_id lämnas
--    NULL tills Andreas skapat priset i Stripe Dashboard — checkout-
--    rutterna failar CLOSED (400, svensk text) på NULL, aldrig tyst
--    fallback till fel pris.
INSERT INTO billing_plan (plan_id, name, price_sek, stripe_price_id, limits, features, sort_order, billing_interval)
SELECT 'professional_yearly', name, 59950, NULL, limits, features, 4, 'yearly'
FROM billing_plan
WHERE plan_id = 'professional'
ON CONFLICT (plan_id) DO NOTHING;

INSERT INTO billing_plan (plan_id, name, price_sek, stripe_price_id, limits, features, sort_order, billing_interval)
SELECT 'business_yearly', name, 119950, NULL, limits, features, 5, 'yearly'
FROM billing_plan
WHERE plan_id = 'business'
ON CONFLICT (plan_id) DO NOTHING;

-- 3. Stripe-pris-ID:na — KLISTRA IN MANUELLT när Andreas skapat priserna i
--    Stripe Dashboard, kör sedan dessa två rader separat (avsiktligt
--    kommentarerade ut — filen ovan får köras som den är utan att sätta
--    en falsk platshållare som stripe_price_id):
--
--    Products → Firman (professional) → Add price → Recurring yearly 59 950 SEK
--    UPDATE billing_plan SET stripe_price_id = 'price_XXX' WHERE plan_id = 'professional_yearly';
--
--    Products → Storfirman (business) → Add price → Recurring yearly 119 950 SEK
--    UPDATE billing_plan SET stripe_price_id = 'price_XXX' WHERE plan_id = 'business_yearly';

-- Verifiering:
--   SELECT plan_id, name, price_sek, stripe_price_id, billing_interval, sort_order
--   FROM billing_plan
--   ORDER BY sort_order;
--
--   -- Förväntat: starter/professional/business = 'monthly' med oförändrade
--   -- priser + befintliga stripe_price_id; professional_yearly/
--   -- business_yearly = 'yearly', 59950/119950, stripe_price_id NULL tills
--   -- UPDATE-satserna ovan körts.
