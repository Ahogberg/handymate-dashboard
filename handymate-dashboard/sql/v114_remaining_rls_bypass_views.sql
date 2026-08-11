-- ═══════════════════════════════════════════════════════════════════════════
-- v114 — de återstående åtta views:erna som kringgår RLS (uppföljning v113)
-- (2026-08-11)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor. Kräver v96 körd
-- (is_business_member).
--
-- ═══ VARFÖR ═══
--
-- v113 satte security_invoker på tre views. En granskning av det utkastet
-- körde Supabase egen säkerhetsrådgivare (security advisor) och hittade
-- ÅTTA TILL views med identisk ägar-bypass av RLS, alla med fulla
-- anon-grants:
--
--   active_leads, agent_activity, automation_history, automation_preview,
--   business_current_usage, lead_pipeline_stats, mobile_user_plan,
--   pending_actions
--
-- ═══ VAD SOM FAKTISKT BEHÖVER GÖRAS ═══
--
-- Sju av de åtta läser ENDAST från bastabeller som redan är korrekt
-- skyddade (leads, agent_runs, automation_queue, automation_rules,
-- scheduled_actions, business_config — samt lead_activities, som
-- active_leads också joinar via en korrelerad subquery för last_activity;
-- kontrollerad separat, samma säkra mönster) — verifierat genom att läsa
-- deras faktiska RLS-policyer (pg_policies.qual), inte bara att
-- roles-kolumnen säger "public". Tabellerna ovan har policyer formulerade
-- som `roles={public}` men med ett EGET auth.uid()-baserat villkor i qual
-- (`business_id IN (SELECT ... WHERE business_config.user_id = auth.uid())`)
-- — ett äldre, annat men LIKA giltigt sätt att skriva samma spärr som
-- is_business_member() gör. Med auth.uid() = NULL (anon-frågor) blir det
-- villkoret alltid falskt. De behöver INGEN ändring. Enda felet är att
-- views:erna ovanpå dem kör som ägaren och därmed aldrig ens frågar efter
-- villkoret.
--
-- business_current_usage är undantaget: den läser även business_usage, som
-- har RLS PÅSLAGET men NOLL policyer (samma läge som de tre stödtabellerna
-- i v113) — deny-all redan idag för direkt åtkomst, men skulle bli tomt
-- även för legitima ägare om security_invoker sattes på viewn utan att
-- först ge tabellen en riktig policy. Samma ordning som v113: policy
-- FÖRST, security_invoker sedan.
--
-- Kolumntyp kontrollerad: business_usage.business_id är text — matchar
-- is_business_member(text), ingen cast behövs (skiljer sig från
-- partner_events-bugden i v112).
--
-- active_leads och mobile_user_plan är, till skillnad från de andra sex,
-- "auto-updatable" enligt Postgres (enkla en-tabells-views utan
-- aggregering) — INSERT/UPDATE/DELETE hade faktiskt fungerat genom dem.
-- Ingen kodplats i handymate-dashboard använder någon av de åtta
-- views:erna (verifierat via grep av app/api/** och lib/** — noll
-- träffar). mobile_user_plan LÄSES av handymate-mobile (lib/api.ts:
-- fetchUserPlan()) — bara efter en riktig inloggad session, aldrig som
-- anon, så SELECT-till-authenticated (vilket den här migrationen ger)
-- täcker det befintliga användningsfallet.
--
-- Idempotent; kan köras om.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. business_usage — samma mönster som v113:s tre stödtabeller ────────
DO $rls_v114_business_usage$
DECLARE
  policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='business_usage') THEN
    ALTER TABLE public.business_usage ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='business_usage'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.business_usage', policy_name);
    END LOOP;

    CREATE POLICY business_usage_tenant_member
      ON public.business_usage
      FOR ALL TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));

    CREATE POLICY business_usage_service_role
      ON public.business_usage
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    REVOKE ALL ON TABLE public.business_usage FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_usage TO authenticated;
    GRANT ALL ON TABLE public.business_usage TO service_role;
  END IF;
END
$rls_v114_business_usage$;

-- ─── 2. security_invoker på alla åtta views ────────────────────────────────
ALTER VIEW public.active_leads SET (security_invoker = true);
ALTER VIEW public.agent_activity SET (security_invoker = true);
ALTER VIEW public.automation_history SET (security_invoker = true);
ALTER VIEW public.automation_preview SET (security_invoker = true);
ALTER VIEW public.business_current_usage SET (security_invoker = true);
ALTER VIEW public.lead_pipeline_stats SET (security_invoker = true);
ALTER VIEW public.mobile_user_plan SET (security_invoker = true);
ALTER VIEW public.pending_actions SET (security_invoker = true);

-- ─── 3. Strama åt grants — ingen kodplats i appen använder någon av dem ────
REVOKE ALL ON TABLE public.active_leads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.active_leads TO authenticated;

REVOKE ALL ON TABLE public.agent_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agent_activity TO authenticated;

REVOKE ALL ON TABLE public.automation_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.automation_history TO authenticated;

REVOKE ALL ON TABLE public.automation_preview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.automation_preview TO authenticated;

REVOKE ALL ON TABLE public.business_current_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.business_current_usage TO authenticated;

REVOKE ALL ON TABLE public.lead_pipeline_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lead_pipeline_stats TO authenticated;

REVOKE ALL ON TABLE public.mobile_user_plan FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mobile_user_plan TO authenticated;

REVOKE ALL ON TABLE public.pending_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pending_actions TO authenticated;

COMMIT;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
-- 1. Alla åtta ska ha security_invoker = true.
SELECT relname, reloptions
FROM pg_class
WHERE relname IN (
  'active_leads','agent_activity','automation_history','automation_preview',
  'business_current_usage','lead_pipeline_stats','mobile_user_plan','pending_actions'
)
AND relnamespace = 'public'::regnamespace;

-- 2. Ingen ska längre ha ett grant till anon.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND table_name IN (
    'active_leads','agent_activity','automation_history','automation_preview',
    'business_current_usage','lead_pipeline_stats','mobile_user_plan','pending_actions',
    'business_usage'
  );
-- Förväntat resultat: 0 rader.

-- 3. business_usage-policyn.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'business_usage';
