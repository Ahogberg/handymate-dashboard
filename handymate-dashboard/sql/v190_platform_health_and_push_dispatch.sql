-- v190: Driftsynlighet + push-dedupe (2026-09-01).
--
-- Två små tabeller, båda service_role-only (RLS på, inga policyer, inga
-- grants till anon/authenticated — samma låsning som v96). Koden är
-- fail-soft tills den här filen körts: kreditbevakningen loggar att den
-- inte kunde spara, push-dedupen släpper igenom (som idag).
--
-- 1. platform_health_check — senaste utfallet per plattformskontroll
--    (46elks-saldo, Anthropic-kredit, Stripe-nyckel, databas). Skrivs av
--    /api/cron/credit-watch, läses av /api/health. Plattformsnivå, inget
--    business_id — det är därför automation_activity (NOT NULL business_id
--    + FK) inte duger.
--
-- 2. push_dispatch_log — en rad per skickad push från sendApprovalPush
--    (lib/notifications/approval-push.ts). Dedupe-nyckeln
--    (approval_type|objekt|mottagare) slås upp inom klassens fönster innan
--    nästa push går iväg. Samma händelse ger då högst en push per mottagare
--    och dedupefönster (Teamet i fickan, V1-kontraktet).

CREATE TABLE IF NOT EXISTS public.platform_health_check (
  check_key text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('ok', 'warn', 'error')),
  summary text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_health_check ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_health_check FROM anon, authenticated, PUBLIC;

CREATE TABLE IF NOT EXISTS public.push_dispatch_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  approval_type text NOT NULL,
  push_class text NOT NULL,
  target_user_id text,
  delivered boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_dispatch_log_dedupe_idx
  ON public.push_dispatch_log (business_id, dedupe_key, sent_at DESC);

ALTER TABLE public.push_dispatch_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_dispatch_log FROM anon, authenticated, PUBLIC;

-- Facit efter körning:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('platform_health_check','push_dispatch_log');
--   → båda relrowsecurity = true
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name IN ('platform_health_check','push_dispatch_log')
--      AND grantee IN ('anon','authenticated');
--   → 0 rader
