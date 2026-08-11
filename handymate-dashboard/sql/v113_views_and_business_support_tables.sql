-- ═══════════════════════════════════════════════════════════════════════════
-- v113 — täpp till views som kringgår RLS + tre stödtabeller till business_full
-- (2026-08-11, uppföljning till v112)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor. Kräver v96 (is_business_member)
-- och v101 (call_recording) redan körda.
--
-- ═══ VARFÖR ═══
--
-- v112 låste 58 bastabeller, men tre VIEWS kringgår RLS helt oavsett vad
-- som händer med bastabellerna:
--   - call_recordings_with_details (samtalstranskript, AI-sentiment, kund-
--     namn/telefon — joinar call_recording + customer + business_config)
--   - recordings_needing_review (samma data, filtrerad — byggd OVANPÅ
--     call_recordings_with_details)
--   - business_full (i princip hela business_config + telefonnummer +
--     aktiva integrationer — joinar business_config + business_onboarding +
--     business_phone_numbers + business_credentials)
--
-- Orsaken: en Postgres-view körs som VIEW-ÄGAREN, inte som den som frågar
-- den, om inte `security_invoker = true` är satt (stöds från PG15;
-- databasen kör PG 17.6). Ägaren träffas inte av RLS. Så även när
-- underliggande tabeller är korrekt låsta (customer, business_config,
-- call_recording — alla redan fixade i v96/v101/v112) så läcker VIEW:en
-- ändå allt, eftersom RLS-kontrollen aldrig triggas för ägaren.
--
-- Bekräftat: alla tre views har fulla anon-grants (SELECT/INSERT/UPDATE/
-- DELETE) precis som bastabellerna hade innan v96/v101/v112.
--
-- ═══ EN KOMPLIKATION — tre stödtabeller till business_full ═══
--
-- business_full joinar även business_onboarding, business_phone_numbers och
-- business_credentials (leverantörs-typ-flaggor, inte hemligheterna själva
-- — de ligger numera i business_integration_credentials sedan v96). Dessa
-- tre har RLS PÅSLAGET men INGEN policy alls — vilket enligt Postgres
-- standardbeteende betyder DENY ALL för alla roller utom ägaren (grants
-- till anon/authenticated finns, men biter aldrig eftersom RLS blockerar
-- innan grants ens blir relevanta). De är alltså redan säkra mot DIREKT
-- åtkomst — men att sätta security_invoker på business_full utan att FÖRST
-- ge dem en riktig authenticated-policy hade gjort business_full tomt även
-- för legitima företagsägare. Den här migrationen ger dem samma
-- tenant_member + service_role-mönster som allt annat, INNAN
-- security_invoker sätts.
--
-- Idempotent; kan köras om.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Ge de tre stödtabellerna till business_full riktiga policyer ──────
DO $rls_v113_support$
DECLARE
  target_table TEXT;
  policy_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'business_onboarding',
    'business_phone_numbers',
    'business_credentials'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      RAISE NOTICE 'v113: tabellen % finns inte här — hoppar över', target_table;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    FOR policy_name IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, target_table);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id))',
      target_table || '_tenant_member',
      target_table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      target_table || '_service_role',
      target_table
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', target_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', target_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', target_table);
  END LOOP;
END
$rls_v113_support$;

-- ─── 2. Tvinga de tre views:erna att respektera RLS (security_invoker) ─────
-- Ordningen spelar roll: call_recordings_with_details måste sättas FÖRE
-- recordings_needing_review, eftersom den senare läser den förra — men
-- security_invoker måste sättas på VARJE nivå oavsett, annars kör den
-- yttre viewn som ägare igen så fort den träffar den inre.
ALTER VIEW public.call_recordings_with_details SET (security_invoker = true);
ALTER VIEW public.recordings_needing_review SET (security_invoker = true);
ALTER VIEW public.business_full SET (security_invoker = true);

-- ─── 3. Strama åt views:ernas egna grants ──────────────────────────────────
-- Ingen av de tre är auto-updatable (flertabells-joins, korrelerade
-- subqueries) — INSERT/UPDATE/DELETE-grantsen har alltid varit
-- verkningslösa i praktiken, men rensas bort för att matcha mönstret
-- överallt annars: authenticated får bara det de faktiskt kan göra.
REVOKE ALL ON TABLE public.call_recordings_with_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.call_recordings_with_details TO authenticated;

REVOKE ALL ON TABLE public.recordings_needing_review FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.recordings_needing_review TO authenticated;

REVOKE ALL ON TABLE public.business_full FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.business_full TO authenticated;

COMMIT;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
-- 1. Views:erna ska ha security_invoker = true.
SELECT c.relname, c.reloptions
FROM pg_class c
WHERE c.relname IN ('call_recordings_with_details', 'recordings_needing_review', 'business_full')
  AND c.relnamespace = 'public'::regnamespace;
-- Förväntat: reloptions innehåller {security_invoker=true} på alla tre.

-- 2. Ingen av de tre views:erna eller stödtabellerna ska längre ha ett
--    grant till anon.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND table_name IN (
    'call_recordings_with_details', 'recordings_needing_review', 'business_full',
    'business_onboarding', 'business_phone_numbers', 'business_credentials'
  );
-- Förväntat resultat: 0 rader.

-- 3. Policyerna på stödtabellerna.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('business_onboarding', 'business_phone_numbers', 'business_credentials')
ORDER BY tablename, policyname;

-- 4. Ögonkontroll i appen efteråt (inloggad som ägare):
--    /dashboard/inkorg → Samtal-fliken visar fortfarande transkript +
--      AI-sentiment för EGNA samtal (bekräftar att security_invoker inte
--      av misstag blockerade legitim åtkomst).
--    Onboarding-flödet (om åtkomligt) visar fortfarande rätt steg-status.
--    Telefonnummer-inställningarna visar fortfarande företagets nummer.
