-- 2026-09-06: Codex nya testkonto för onboardingprovet (#13/#17) sätts till
-- comp-status så provet kan fortsätta förbi betalsteget utan Stripe.
-- Samma status som pilotkontot Bee Service. Avgränsat till ett business_id.
UPDATE business_config
   SET subscription_status = 'comp'
 WHERE business_id = 'biz_xb8go6hz7q'
   AND business_name = 'TEST Codex – onboarding El';
