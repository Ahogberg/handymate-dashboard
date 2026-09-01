-- v190 — Lås partnerattributionen i databasen (P0-6 i PARTNER_REVENUE_REALITY_AUDIT_2026-09-01)
--
-- Bakgrund: v112 gav `referrals_tenant_member` FOR ALL till `authenticated` för medlemmar i
-- antingen hänvisande ELLER hänvisat företag. Den hänvisade kundens inloggade användare
-- kunde därmed via PostgREST skriva om partner_id, referrer_type, status och converted_at
-- på sin egen referral-rad — den rad som provisionsmotorn använder som ekonomiskt facit.
-- `business_config.referred_by` (attributionskoden) låg på samma sätt på en tenant-
-- redigerbar rad; RLS skyddar raden, inte enskilda kolumner.
--
-- Verifierat 2026-09-01: exakt EN kodväg läser referrals med tenant-klienten
-- (app/dashboard/referral/page.tsx, ren SELECT). Alla skrivningar går via service role
-- (app/api/auth/route.ts, app/api/billing/webhook/route.ts, lib/referral/discounts.ts,
-- app/api/partners/referral/route.ts). Policyn kan alltså stramas till SELECT utan att
-- någon existerande väg går sönder.
--
-- Ingen data ändras. Inga rader raderas.

BEGIN;

-- 1. referrals: tenanten får läsa sina egna hänvisningar, aldrig skriva dem.
DROP POLICY IF EXISTS referrals_tenant_member ON public.referrals;

CREATE POLICY referrals_tenant_member
  ON public.referrals
  FOR SELECT
  TO authenticated
  USING (
    public.is_business_member(referrer_business_id)
    OR public.is_business_member(referred_business_id)
  );

-- referrals_service_role (v112) består oförändrad: FOR ALL TO service_role.

-- 2. business_config.referred_by: kolumnprivilegier är additiva ovanpå ett redan beviljat
--    tabell-UPDATE, så en REVOKE (referred_by) biter inte. En radtrigger gör kolumnen
--    oföränderlig för allt utom service role / databasägaren.
--
--    SECURITY INVOKER (default) är avsiktligt: PostgREST gör SET LOCAL ROLE till JWT:ns
--    roll, så current_user är 'authenticated' för tenantanrop och 'service_role' för
--    serverkod. Med SECURITY DEFINER hade current_user blivit funktionsägaren och
--    kontrollen alltid passerat.
CREATE OR REPLACE FUNCTION public.protect_business_config_referred_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'referred_by är låst: partnerattributionen kan bara ändras av Handymate'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_business_config_referred_by ON public.business_config;

CREATE TRIGGER trg_protect_business_config_referred_by
  BEFORE UPDATE OF referred_by ON public.business_config
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_business_config_referred_by();

COMMIT;

-- Verifiering (körs efteråt):
--
-- SELECT policyname, cmd, roles::text FROM pg_policies
--  WHERE tablename = 'referrals' ORDER BY policyname;
--   → referrals_service_role | ALL    | {service_role}
--   → referrals_tenant_member | SELECT | {authenticated}
--
-- SELECT tgname, tgenabled FROM pg_trigger
--  WHERE tgrelid = 'public.business_config'::regclass AND tgname LIKE 'trg_protect%';
--   → trg_protect_business_config_referred_by | O
--
-- Beteendeprov (rullas tillbaka, ingen data rörs):
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<user_id på en tenant>","role":"authenticated"}', true);
--   UPDATE public.business_config SET referred_by = 'P-HACK-0000' WHERE business_id = '<dennes business_id>';
--   → ERROR 42501 referred_by är låst
-- ROLLBACK;
