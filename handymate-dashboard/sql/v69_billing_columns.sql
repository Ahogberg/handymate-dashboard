-- v69_billing_columns.sql — täpper två schema-glapp som audit 2026-07-08 fann.
--
-- Körs manuellt i Supabase SQL Editor (Handymate-projektet).
-- Idempotent + additiv. Koden är redan gjord RESILIENT mot att dessa saknas
-- (webhookens billing_period_* skrivs best-effort separat från statusskrivningen,
-- och limits-läsningen tål avsaknad) — men detta gör datat komplett.

-- 1. business_config: prenumerationsperiod (webhooken vill logga dessa).
--    Utan dem skrevs de tidigare i SAMMA update som subscription_status:'active'
--    → hela uppdateringen avvisades → aktiveringen misslyckades tyst. Koden är
--    nu delad, men kolumnerna behövs för att perioden ska sparas alls.
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_period_end   TIMESTAMPTZ;

-- 2. billing_plan: usage-/limit-metadata som lib/usage-tracking.ts + billing-route
--    läser via plan.limits. Prod-tabellen saknar kolumnen (audit: 42703).
--    JSONB så varje plan kan bära sina gränser (t.ex. {"users": 5, "quotes": null}).
ALTER TABLE billing_plan
  ADD COLUMN IF NOT EXISTS limits JSONB DEFAULT '{}'::jsonb;

-- Seed rimliga gränser per plan (matchar features-texterna). Justera fritt.
UPDATE billing_plan SET limits = '{"users": 1}'::jsonb            WHERE plan_id = 'starter'      AND (limits IS NULL OR limits = '{}'::jsonb);
UPDATE billing_plan SET limits = '{"users": 5}'::jsonb            WHERE plan_id = 'professional' AND (limits IS NULL OR limits = '{}'::jsonb);
UPDATE billing_plan SET limits = '{"users": null}'::jsonb         WHERE plan_id = 'business'     AND (limits IS NULL OR limits = '{}'::jsonb);

-- Verifiering:
--   SELECT plan_id, limits FROM billing_plan ORDER BY sort_order;
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'business_config' AND column_name LIKE 'billing_period%';
