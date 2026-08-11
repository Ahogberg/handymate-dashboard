-- ═══════════════════════════════════════════════════════════════════════════
-- v115 — den andra vågen: 38 ytterligare tabeller med samma trasiga RLS
-- (2026-08-11, uppföljning till v112/v113/v114)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor. Kräver v96 körd
-- (is_business_member).
--
-- ═══ VARFÖR ═══
--
-- Efter v112 (58 tabeller) beställdes en andra, bredare svep av HELA
-- schemat. Den hittade 38 tabeller till med samma mönster: en policy som
-- appliceras på PUBLIC (inklusive anon) istället för att vara begränsad
-- till authenticated/service_role, kombinerat med fulla anon-grants.
--
-- Bekräftat AKTIVT utnyttjat (inte bara teoretiskt) — dessa läses/skrivs
-- direkt av webbläsarens Supabase-klient idag, inte bara via service_role-
-- API:er: `quotes` (innehåller personnummer, fastighetsbeteckning,
-- signatur-data), `sms_log`, `notification`, `email_conversations`.
--
-- Två tabeller ur det ursprungliga fyndet visade sig INTE vara trasiga vid
-- närmare granskning (`push_tokens`, `invoice_reminders`) — de har
-- `roles={public}` men ett riktigt auth.uid()-baserat villkor i policyns
-- USING-sats (samma mönster som `leads`/`agent_runs`/`automation_queue`/
-- `automation_rules`/`scheduled_actions`, som också granskades och visade
-- sig redan vara korrekt skyddade trots ytligt samma symptom). De rörs
-- INTE här.
--
-- ═══ INDELNING ═══
--
-- 1. STANDARDTABELLER (31 st) — direkt business_id, typ TEXT. Samma mönster
--    som v96/v101/v112.
--
-- 2. JOIN-SCOPADE TABELLER (2 st) — agent_handoffs (via thread_id →
--    agent_threads.id) och customer_tag_assignment (via customer_id →
--    customer.customer_id).
--
-- 3. GLOBAL REFERENSDATA MED LÅSTA SKRIVNINGAR (2 st) — billing_plan
--    (abonnemangskatalog) och quote_categories (ROT/RUT-kategorier). Till
--    skillnad från template_category (som redan hade en korrekt avgränsad
--    publik läs-policy) hade dessa två INGEN RLS alls — även SKRIVNINGAR
--    var öppna för anon. Läsning öppnas för authenticated (inte anon —
--    ingen bekräftad publik yta behöver dem oinloggat; enkelt att öppna
--    vidare senare om det visar sig behövas), skrivning låses till
--    service_role.
--
-- 4. SERVICE_ROLE-ENDAST, INGEN TENANT-KOPPLING (2 st) — admin_audit_log
--    (superadmins granskningslogg — target_business_id är VAD som
--    påverkades, inte VEM som får se raden) och idempotency_cache
--    (agent-verktygs deduplicering, ingen affärskoppling i schemat alls).
--    Samma behandling som partners fick i v112.
--
-- 5. LANDING_LEADS — nytt mönster, inte sett i v96/v101/v112/v113/v114.
--    Handymates EGEN marknadsförings-lead-capture (inte en kunds kund).
--    Måste tillåta publik INSERT (det är hela syftet — ett formulär på den
--    publika landningssidan) men LÄSNING måste vara service_role-endast,
--    annars kan vem som helst skrapa hela leadlistan.
--
-- Utanför scope här (flaggat, inte löst): `price_list` inkluderas som
-- standardtabell — bekräftat aktivt använd via 9 kodställen
-- (app/api/price-list/seed-from-onboarding m.fl.), inte en död v1-rest som
-- först misstänktes. `fortnox_api_log` inkluderas som standardtabell —
-- loggar request/response-payloads mot Fortnox, som rimligen kan innehålla
-- känslig data even om inga rå tokens bekräftats; standardbehandlingen
-- (rollgrind) är korrekt oavsett vad som visar sig ligga i payloaden.
--
-- Idempotent; kan köras om.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. STANDARDTABELLER — direkt business_id ──────────────────────────────
DO $rls_v115_standard$
DECLARE
  target_table TEXT;
  policy_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'task_activity_log',
    'notification',
    'quote_items',
    'sms_log',
    'quotes',
    'quote_templates',
    'agent_threads',
    'auto_approve_daily_count',
    'communication_log',
    'custom_quote_categories',
    'customer_message',
    'customer_tag',
    'email_conversations',
    'email_template',
    'fortnox_api_log',
    'gmail_imported_message',
    'inventory',
    'inventory_transaction',
    'job_template',
    'nurture_enrollment',
    'nurture_sequence',
    'price_list',
    'quote_standard_texts',
    'sms_queue',
    'storefront',
    'subcontractor',
    'subcontractor_assignment',
    'thread_message',
    'travel_entry',
    'warranty',
    'widget_conversation'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      RAISE NOTICE 'v115: tabellen % finns inte här — hoppar över', target_table;
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
$rls_v115_standard$;

-- ─── 2. JOIN-SCOPADE TABELLER ───────────────────────────────────────────────

-- agent_handoffs → agent_threads.id (via thread_id, nullable). En rad med
-- thread_id IS NULL matchar aldrig EXISTS-satsen och blir därmed osynlig
-- för authenticated (bara service_role ser den) — bara 1 rad i tabellen
-- idag, acceptabel kant.
DO $agent_handoffs_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='agent_handoffs') THEN
    ALTER TABLE public.agent_handoffs ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='agent_handoffs'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.agent_handoffs', policy_name);
    END LOOP;
  END IF;
END
$agent_handoffs_cleanup$;

CREATE POLICY agent_handoffs_tenant_member
  ON public.agent_handoffs
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_threads at
    WHERE at.id = agent_handoffs.thread_id
      AND public.is_business_member(at.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_threads at
    WHERE at.id = agent_handoffs.thread_id
      AND public.is_business_member(at.business_id)
  ));

CREATE POLICY agent_handoffs_service_role
  ON public.agent_handoffs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.agent_handoffs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_handoffs TO authenticated;
GRANT ALL ON TABLE public.agent_handoffs TO service_role;

-- customer_tag_assignment → customer.customer_id (via customer_id)
DO $customer_tag_assignment_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customer_tag_assignment') THEN
    ALTER TABLE public.customer_tag_assignment ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='customer_tag_assignment'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_tag_assignment', policy_name);
    END LOOP;
  END IF;
END
$customer_tag_assignment_cleanup$;

CREATE POLICY customer_tag_assignment_tenant_member
  ON public.customer_tag_assignment
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customer c
    WHERE c.customer_id = customer_tag_assignment.customer_id
      AND public.is_business_member(c.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.customer c
    WHERE c.customer_id = customer_tag_assignment.customer_id
      AND public.is_business_member(c.business_id)
  ));

CREATE POLICY customer_tag_assignment_service_role
  ON public.customer_tag_assignment
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.customer_tag_assignment FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_tag_assignment TO authenticated;
GRANT ALL ON TABLE public.customer_tag_assignment TO service_role;

-- ─── 3. GLOBAL REFERENSDATA — läsning för authenticated, skrivning för service_role ──

DO $billing_plan_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='billing_plan') THEN
    ALTER TABLE public.billing_plan ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='billing_plan'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.billing_plan', policy_name);
    END LOOP;
  END IF;
END
$billing_plan_cleanup$;

CREATE POLICY billing_plan_authenticated_read
  ON public.billing_plan FOR SELECT TO authenticated USING (true);
CREATE POLICY billing_plan_service_role
  ON public.billing_plan FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.billing_plan FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.billing_plan TO authenticated;
GRANT ALL ON TABLE public.billing_plan TO service_role;

DO $quote_categories_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='quote_categories') THEN
    ALTER TABLE public.quote_categories ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='quote_categories'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.quote_categories', policy_name);
    END LOOP;
  END IF;
END
$quote_categories_cleanup$;

CREATE POLICY quote_categories_authenticated_read
  ON public.quote_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY quote_categories_service_role
  ON public.quote_categories FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.quote_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.quote_categories TO authenticated;
GRANT ALL ON TABLE public.quote_categories TO service_role;

-- ─── 4. SERVICE_ROLE-ENDAST — ingen tenant-koppling ────────────────────────

DO $admin_audit_log_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_audit_log') THEN
    ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='admin_audit_log'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.admin_audit_log', policy_name);
    END LOOP;
  END IF;
END
$admin_audit_log_cleanup$;

CREATE POLICY admin_audit_log_service_role
  ON public.admin_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_audit_log TO service_role;

DO $idempotency_cache_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='idempotency_cache') THEN
    ALTER TABLE public.idempotency_cache ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='idempotency_cache'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.idempotency_cache', policy_name);
    END LOOP;
  END IF;
END
$idempotency_cache_cleanup$;

CREATE POLICY idempotency_cache_service_role
  ON public.idempotency_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.idempotency_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.idempotency_cache TO service_role;

-- ─── 5. LANDING_LEADS — publik INSERT, service_role-läsning ────────────────
-- Handymates egen marknadsförings-lead-capture (inte en kunds kund). Måste
-- tillåta anonym INSERT (det publika formuläret på landningssidan skickar
-- utan inloggning) men ingen — varken anon eller authenticated — ska kunna
-- LÄSA hela leadlistan.
DO $landing_leads_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='landing_leads') THEN
    ALTER TABLE public.landing_leads ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='landing_leads'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.landing_leads', policy_name);
    END LOOP;
  END IF;
END
$landing_leads_cleanup$;

CREATE POLICY landing_leads_public_insert
  ON public.landing_leads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY landing_leads_service_role
  ON public.landing_leads FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.landing_leads FROM PUBLIC, anon, authenticated;
GRANT INSERT ON TABLE public.landing_leads TO anon, authenticated;
GRANT ALL ON TABLE public.landing_leads TO service_role;

COMMIT;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
-- 1. Ingen av de 38 tabellerna ska längre ha SELECT/UPDATE/DELETE-grant
--    till anon (landing_leads är avsiktligt undantaget — den ska ha
--    INSERT, men INTE SELECT/UPDATE/DELETE).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND table_name IN (
    'task_activity_log','notification','quote_items','sms_log','quotes',
    'quote_templates','agent_threads','auto_approve_daily_count',
    'communication_log','custom_quote_categories','customer_message',
    'customer_tag','email_conversations','email_template','fortnox_api_log',
    'gmail_imported_message','inventory','inventory_transaction',
    'job_template','nurture_enrollment','nurture_sequence','price_list',
    'quote_standard_texts','sms_queue','storefront','subcontractor',
    'subcontractor_assignment','thread_message','travel_entry','warranty',
    'widget_conversation','agent_handoffs','customer_tag_assignment',
    'billing_plan','quote_categories','admin_audit_log','idempotency_cache',
    'landing_leads'
  );
-- Förväntat resultat: exakt 1 rad — landing_leads / INSERT. Allt annat = fel.

-- 2. Policyerna på de sju specialtabellerna.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'agent_handoffs','customer_tag_assignment','billing_plan',
    'quote_categories','admin_audit_log','idempotency_cache','landing_leads'
  )
ORDER BY tablename, policyname;

-- 3. Ögonkontroll i appen efteråt (inloggad som ägare):
--    /dashboard/customers/[id] — offerter, e-postkonversationer, SMS-logg syns
--    /dashboard/settings/phone — notiser syns
--    /dashboard/email — e-postkonversationer syns och går att skriva i
--    Landningssidans lead-formulär (handymate-landing-repot, separat) —
--      går fortfarande att skicka in utan inloggning.
