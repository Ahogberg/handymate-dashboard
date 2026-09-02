-- v195: push_subscriptions fanns aldrig i produktion (2026-09-02).
--
-- sql/v2_push_subscriptions.sql kördes aldrig: information_schema saknade
-- tabellen 2026-09-02, så varje POST /api/push/subscribe (PWA/web-push)
-- har fallerat tyst och /api/push/send har svarat subscription_query_failed
-- för web-kanalen. Bara Expo-tokens (push_tokens) har fungerat.
--
-- Samma tabell som v2, men UTAN v2:s öppna policy (USING (true) — hade
-- exponerat alla prenumerationer för anon). Skrivs och läses enbart via
-- service_role (getServerSupabase) — RLS på, inga policyer, inga grants.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id text NOT NULL,
  user_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_business ON public.push_subscriptions (business_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_business_user ON public.push_subscriptions (business_id, user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_policy ON public.push_subscriptions;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated, PUBLIC;

-- Facit efter körning:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'push_subscriptions';  → true
--   SELECT count(*) FROM pg_policies WHERE tablename = 'push_subscriptions';   → 0
