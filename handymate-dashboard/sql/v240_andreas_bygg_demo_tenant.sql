-- v240: Andreas eget testkonto räknas inte som grundarkund.
--
-- Beslut Andreas 2026-09-17. "Andreas Bygg" (biz_q3wwbkkogs,
-- andreastestar@gmail.com) har en aktiv Stripe-prenumeration och
-- is_demo_tenant = false — så isFoundersOfferAvailable() räknade det som
-- plats 1 av 20. En verklig grundarplats hade gått till spillo på ett
-- testkonto: den påhittade räknaren beslutsfilen varnar för, fast åt andra
-- hållet.
--
-- Flaggan är säker att sätta: demoåterställningen (app/api/admin/demo-reset)
-- är grindad på DEMO_BUSINESS_ID i miljön, inte på flaggan. Flaggan i sig
-- undantar bara kontot från grundarräkningen (founders-offer.ts) och
-- benchmarken (lib/benchmark/readiness.ts), och låter demoverktygen köras
-- mot det om någon uttryckligen gör det.
--
-- Avgränsad med WHERE på business_id. Idempotent.

UPDATE public.business_config
SET is_demo_tenant = TRUE
WHERE business_id = 'biz_q3wwbkkogs'
  AND business_name = 'Andreas Bygg';
