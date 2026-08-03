-- Migrations-koll 2026-08-03 — alla just nu kända EJ BEKRÄFTAT körda filer,
-- gamla sprinten + dagens Storfirman-paritetskörning.
-- Kör i Supabase SQL Editor (HANDYMATE-projektet). Klistra HELA resultatet
-- till Claude. Varje rad svarar "är detta redan gjort i prod?" —
-- true/rätt-värde = redan kört, false/fel-värde = kvarstår.

-- ── Från förra sprinten ──────────────────────────────────────────────

SELECT
  'v2_plan_names_firman: billing_plan.name = Firman' AS migration,
  EXISTS (SELECT 1 FROM billing_plan WHERE plan_id = 'professional' AND name = 'Firman') AS kord

UNION ALL
SELECT 'v2_business_preferences_unique: key/value-formen finns',
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'business_preferences' AND column_name = 'key')

UNION ALL
SELECT 'demo-auth-email: auth.users har demo@handymate.se',
  EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@handymate.se')

UNION ALL
SELECT 'demo-email-align: business_config.contact_email uppdaterad',
  EXISTS (SELECT 1 FROM business_config
          WHERE business_id = 'biz_0lovw5vcwzqn' AND contact_email = 'demo@handymate.se')

-- ── Från dagens Storfirman-paritetskörning ───────────────────────────

UNION ALL
SELECT 'v76: time_checkins.business_user_id finns',
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_checkins' AND column_name = 'business_user_id')

UNION ALL
SELECT 'v77: pending_approvals.routing_role finns',
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pending_approvals' AND column_name = 'routing_role');

-- ── Extra: v77:s RLS-koll (kör separat, samma resultat som i själva
--    migrationsfilens steg 4 — bara två policies ska finnas kvar och
--    ingen får ha qual = 'true') ──────────────────────────────────────
SELECT policyname, cmd, qual FROM pg_policies
WHERE tablename = 'pending_approvals' ORDER BY policyname;
