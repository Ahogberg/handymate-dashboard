-- v61: Introducera 'comp' som subscription_status-värde för pilot-businesses
-- med gratis-access (co-founder/partner/investor-comp).
--
-- Bakgrund: 2026-05-30 Bee-business-inventering avslöjade att
-- biz_21wswuhrbhy (Bee Service pilot) har subscription_status='trial'
-- trots co-founder-pilot-status (ingen Stripe-betalning förväntas, ingen
-- trial löper ut). Drift mellan business-modell och DB-status.
--
-- 'comp' = comped/sponsored access. Behandlas som active i
-- checkSubscriptionStatus (lib/auth.ts). BillingStatusBanner visar
-- ingen banner (filtrerar bara 'trialing'/'past_due').
--
-- ÅTGÄRD-1: Uppdatera Bee Service (förstå pilot)
--   UPDATE business_config SET subscription_status = 'comp'
--   WHERE business_id = 'biz_21wswuhrbhy';
--
-- ÅTGÄRD-2: Framtida comped-businesses sätts till 'comp' vid skapande
-- istället för 'trial'. Onboarding-flödet bör ha valbart "Comp-pilot"
-- (admin-only).
--
-- Ingen schema-ändring krävs — subscription_status är TEXT utan
-- CHECK-constraint (verifierat via grep — bara v14_consolidate_plans
-- rensade tomma värden).

UPDATE business_config
SET subscription_status = 'comp'
WHERE business_id = 'biz_21wswuhrbhy'
  AND subscription_status = 'trial';

-- Verifiera (kör efter UPDATE):
-- SELECT business_id, business_name, subscription_status, is_pilot
-- FROM business_config
-- WHERE business_id = 'biz_21wswuhrbhy';
-- Förvänta: subscription_status = 'comp', is_pilot = true
