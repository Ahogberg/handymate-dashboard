-- v168: Supabase security advisor-fynd (2026-08-25, pre-launch-svepet):
-- fyra SECURITY DEFINER-funktioner är exekverbara via PostgREST
-- (/rest/v1/rpc/...) av anon och/eller authenticated:
--
--   seed_automation_rules(p_business_id)    ← anon + authenticated
--   seed_lead_scoring_rules(p_business_id)  ← anon + authenticated
--   handle_new_user()                       ← anon + authenticated (triggerfunktion)
--   cleanup_expired_impersonation_tokens()  ← anon + authenticated
--
-- Risken: en ANONYM aktör kan seeda default-automationsregler (varav flera
-- enabled=true med SMS-kanal) in i VILKEN tenant som helst genom att gissa/
-- känna till ett business_id. ON CONFLICT DO NOTHING begränsar skadan till
-- att ÅTERSKAPA regler en kund medvetet raderat — men tenant-konfiguration
-- ska aldrig vara anon-skrivbar överhuvudtaget. handle_new_user är en
-- triggerfunktion (ofarlig att anropa direkt — kraschar utan triggerkontext
-- — men ska inte vara exponerad). cleanup_expired... raderar bara redan
-- utgångna tokens (ofarlig) men följer samma princip.
--
-- reset_demo_tenant GRANSKAD och LÄMNAD ORÖRD: funktionskroppen har redan
-- en dubbel fail-closed-grind (is_demo_tenant-flaggan + owner/admin-
-- medlemskap via auth.uid()) som första exekverbara rader — den är
-- avsiktligt authenticated-anropbar (demo-reset-knappen) och säker.
--
-- Seed-funktionerna anropas i produktion endast server-side (service_role,
-- lib/seed-defaults.ts vid onboarding-avslut) — service_role påverkas inte
-- av dessa REVOKEs.
--
-- Facit-verifiering (kör EFTER migrationen):
--   SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_exec
--   FROM pg_proc p CROSS JOIN pg_roles r
--   WHERE p.proname IN ('seed_automation_rules','seed_lead_scoring_rules','handle_new_user','cleanup_expired_impersonation_tokens')
--     AND r.rolname IN ('anon','authenticated');
--   -- alla rader ska visa can_exec = false

REVOKE EXECUTE ON FUNCTION public.seed_automation_rules(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_lead_scoring_rules(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_impersonation_tokens() FROM anon, authenticated;
