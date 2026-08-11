-- ═══════════════════════════════════════════════════════════════════════════
-- v112 — v96/v101:s RLS-mönster utsträckt till HELA det återstående schemat
-- (2026-08-11, upptäckt under en granskning av /api/pipeline-fixarna)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor. Kräver att v96 redan är
-- körd — funktionen public.is_business_member återanvänds härifrån.
--
-- ═══ VARFÖR ═══
--
-- Under granskning av en API-behörighetsfix upptäcktes att policyn
-- "Service role full access" (och varianter av den) på ett stort antal
-- tabeller SAKNAR sin `TO service_role`-klausul. Utan den appliceras
-- policyn på PUBLIC istället — inklusive `anon`-rollen. Kombinerat med att
-- `anon` OCH `authenticated` har fulla SELECT/INSERT/UPDATE/DELETE-grants
-- på samma tabeller (bekräftat via information_schema.role_table_grants)
-- betyder det att VEM SOM HELST som har den publika
-- NEXT_PUBLIC_SUPABASE_ANON_KEY (som per design ligger i webbläsarkoden,
-- den är inte hemlig) kan läsa OCH skriva data för ALLA företag i dessa
-- tabeller — utan inloggning, utan business_id-avgränsning, helt förbi
-- appens egna route-behörigheter.
--
-- Bekräftat live (inte teoretiskt) mot produktionsdatabasen för `deal`:
--   select policyname, roles, qual from pg_policies where tablename='deal';
--   → {"policyname":"Service role full access deal","roles":"{public}","qual":"true"}
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name='deal' and grantee in ('anon','authenticated');
--   → anon: SELECT, INSERT, UPDATE, DELETE (samma för authenticated)
--
-- Samma mönster verifierades sedan (policy + grants, båda live-kollade) på
-- alla 58 tabeller nedan. Det är inte ett enstaka missat fall — det är en
-- systemisk lucka som legat öppen sedan respektive tabell skapades.
--
-- Bland det som ligger öppet: `customer.personal_number` (personnummer i
-- klartext), `calendar_connection`s Google OAuth-tokens,
-- `rot_payment_request.xml_content` (den faktiska Skatteverket-inlämningen,
-- innehåller personnummer), `supplier_connection.credentials`
-- (leverantörs-API-nycklar), `partners.password_hash`/`api_key`/
-- `webhook_secret`, samtalstranskript (`transcript_turn.utterance`),
-- SMS-konversationer, och all finansiell pipeline-/faktura-data.
--
-- ═══ INDELNING ═══
--
-- 1. STANDARDTABELLER (47 st) — direkt business_id-kolumn, typ TEXT. Exakt
--    samma mönster som v96/v101: två policyer (tenant-medlem +
--    service_role), grants strama åt till authenticated/service_role.
--    OBS: partner_events HÖR INTE hemma här trots att den har en
--    business_id-kolumn — dess business_id är typad UUID, inte TEXT som
--    is_business_member() kräver. Den får ett eget block (5b) med en
--    explicit cast. Utan det avbryter HELA transaktionen med
--    "function public.is_business_member(uuid) does not exist" och inget
--    av de 58 tabellerna hinner låsas — verifierat direkt mot prod under
--    granskningen av det här utkastet.
--
-- 2. HYBRIDTABELLER (5 st) — har ett `is_system`-flagg vid sidan av
--    business_id. Det är avsiktligt delade systemstandarder (mallar,
--    pipeline-steg) som ALLA företag ska kunna LÄSA, men bara det egna
--    företaget ska kunna ÄNDRA. Standardmönstret hade dolt systemraderna
--    för företag som inte skapat dem — därför en egen läs-policy.
--
-- 3. JOIN-SCOPADE TABELLER (3 st) — saknar egen business_id-kolumn men har
--    en FK till en tabell som har en. Policyn görs via EXISTS-subquery mot
--    föräldratabellen.
--
-- 4. REFERRALS (1 st) — två möjliga business_id-kolumner (referrer/referred)
--    på samma rad, ingen FK-relation krävs, bara en OR-policy.
--
-- 5. PARTNERS (1 st) — INGEN tenant-koppling alls. Egen affärsentitet med
--    eget auth-flöde (lib/partners/auth.ts) och egna hemligheter
--    (password_hash, api_key, webhook_secret). Samma behandling som
--    business_integration_credentials i v96: service_role ENDAST, ingen
--    authenticated-åtkomst. Verifierat: alla 9 kodställen som läser
--    `partners` är server-side API-rutter/lib-moduler, inget
--    webbläsarkomponent-anrop hittades.
--
-- 6. TEMPLATE_CATEGORY — RÖRS INTE i den här migrationen. Enda tabellen av
--    de granskade 59 där den publika policyn är AVSIKTLIG och korrekt
--    avgränsad (ren namn/slug-referensdata, "Anyone can read categories",
--    SELECT-only, inga INSERT/UPDATE/DELETE-policyer existerar så de breda
--    grantsen är redan verkningslösa). En framtida, separat städning kan
--    strama åt grants defensivt om man vill — inget akut här.
--
-- Mönstret för (1)–(4) är identiskt med v96/v101: ersätt samtliga
-- befintliga policyer (flera tabeller har idag TVÅ dubblerade trasiga
-- policyer staplade på varandra — loopen tar bort alla oavsett antal).
-- Idempotent; kan köras om.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. STANDARDTABELLER — direkt business_id ──────────────────────────────
DO $rls_v112_standard$
DECLARE
  target_table TEXT;
  policy_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'action_log',
    'activity',
    'agent_context',
    'ai_learned_preferences',
    'allowance_reports',
    'automation_activity',
    'automation_settings',
    'business_counters',
    'business_insights',
    'business_preferences_legacy_v5',
    'calendar_connection',
    'call',
    'canvas_items',
    'case_record',
    'customer',
    'customer_activity',
    'customer_document',
    'deal',
    'deal_flow',
    'deal_flow_log',
    'emergency_escalation',
    'form_submissions',
    'fortnox_sync',
    'grossist_product',
    'human_followup_queue',
    'inbox_item',
    'invoice',
    'learning_events',
    'material_order',
    'pipeline_activity',
    'pipeline_automation',
    'pricing_intelligence',
    'reservation',
    'rot_payment_request',
    'schedule_entry',
    'sms_campaign',
    'sms_conversation',
    'supplier_connection',
    'time_off_request',
    'transcript',
    'v3_automation_logs',
    'v3_automation_rules',
    'v3_automation_settings',
    'vehicle_reports',
    'vehicles',
    'work_orders',
    'work_type'
  ]
  LOOP
    -- Tabeller som ännu inte finns i den här miljön hoppas över tyst —
    -- en disponibel testdatabas har inte nödvändigtvis alla (samma
    -- försiktighet som v101).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      RAISE NOTICE 'v112: tabellen % finns inte här — hoppar över', target_table;
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
$rls_v112_standard$;

-- ─── 2. HYBRIDTABELLER — business_id + is_system (delade systemstandarder) ─
-- SELECT: företagets EGNA rader ELLER systemrader (is_system = true).
-- INSERT/UPDATE/DELETE: bara företagets egna rader — ingen tenant ska
-- kunna redigera/radera en systemstandard.
DO $rls_v112_hybrid$
DECLARE
  target_table TEXT;
  policy_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'allowance_types',
    'checklist_template',
    'form_templates',
    'pipeline_stage',
    'pipeline_stages'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      RAISE NOTICE 'v112: tabellen % finns inte här — hoppar över', target_table;
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
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id) OR is_system IS TRUE)',
      target_table || '_tenant_read',
      target_table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id))',
      target_table || '_tenant_insert',
      target_table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id))',
      target_table || '_tenant_update',
      target_table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_business_member(business_id))',
      target_table || '_tenant_delete',
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
$rls_v112_hybrid$;

-- ─── 3. JOIN-SCOPADE TABELLER — ingen egen business_id, ärver via FK ───────

-- sms_campaign_recipient → sms_campaign.business_id (via campaign_id)
DO $sms_recipient_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sms_campaign_recipient') THEN
    ALTER TABLE public.sms_campaign_recipient ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='sms_campaign_recipient'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.sms_campaign_recipient', policy_name);
    END LOOP;
  END IF;
END
$sms_recipient_cleanup$;

CREATE POLICY sms_campaign_recipient_tenant_member
  ON public.sms_campaign_recipient
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sms_campaign sc
    WHERE sc.campaign_id = sms_campaign_recipient.campaign_id
      AND public.is_business_member(sc.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sms_campaign sc
    WHERE sc.campaign_id = sms_campaign_recipient.campaign_id
      AND public.is_business_member(sc.business_id)
  ));

CREATE POLICY sms_campaign_recipient_service_role
  ON public.sms_campaign_recipient
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.sms_campaign_recipient FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sms_campaign_recipient TO authenticated;
GRANT ALL ON TABLE public.sms_campaign_recipient TO service_role;

-- transcript_turn → transcript.business_id (via transcript_id)
DO $transcript_turn_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='transcript_turn') THEN
    ALTER TABLE public.transcript_turn ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='transcript_turn'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.transcript_turn', policy_name);
    END LOOP;
  END IF;
END
$transcript_turn_cleanup$;

CREATE POLICY transcript_turn_tenant_member
  ON public.transcript_turn
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transcript t
    WHERE t.transcript_id = transcript_turn.transcript_id
      AND public.is_business_member(t.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transcript t
    WHERE t.transcript_id = transcript_turn.transcript_id
      AND public.is_business_member(t.business_id)
  ));

CREATE POLICY transcript_turn_service_role
  ON public.transcript_turn
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.transcript_turn FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transcript_turn TO authenticated;
GRANT ALL ON TABLE public.transcript_turn TO service_role;

-- supplier_pricelist → supplier.business_id (via supplier_id)
-- OBS: supplier ska redan vara låst av v101 — den här policyn förutsätter det.
DO $supplier_pricelist_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='supplier_pricelist') THEN
    ALTER TABLE public.supplier_pricelist ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='supplier_pricelist'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.supplier_pricelist', policy_name);
    END LOOP;
  END IF;
END
$supplier_pricelist_cleanup$;

CREATE POLICY supplier_pricelist_tenant_member
  ON public.supplier_pricelist
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.supplier s
    WHERE s.supplier_id = supplier_pricelist.supplier_id
      AND public.is_business_member(s.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.supplier s
    WHERE s.supplier_id = supplier_pricelist.supplier_id
      AND public.is_business_member(s.business_id)
  ));

CREATE POLICY supplier_pricelist_service_role
  ON public.supplier_pricelist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.supplier_pricelist FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_pricelist TO authenticated;
GRANT ALL ON TABLE public.supplier_pricelist TO service_role;

-- ─── 4. REFERRALS — två möjliga business_id-kolumner på samma rad ─────────
DO $referrals_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='referrals') THEN
    ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='referrals'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.referrals', policy_name);
    END LOOP;
  END IF;
END
$referrals_cleanup$;

CREATE POLICY referrals_tenant_member
  ON public.referrals
  FOR ALL
  TO authenticated
  USING (
    public.is_business_member(referrer_business_id)
    OR public.is_business_member(referred_business_id)
  )
  WITH CHECK (
    public.is_business_member(referrer_business_id)
    OR public.is_business_member(referred_business_id)
  );

CREATE POLICY referrals_service_role
  ON public.referrals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referrals TO authenticated;
GRANT ALL ON TABLE public.referrals TO service_role;

-- ─── 4b. PARTNER_EVENTS — business_id-kolumnen är typad UUID, inte TEXT ────
-- (sql/v14_partners.sql:18). is_business_member() kräver TEXT, så anropet
-- castas explicit. Root cause (inte fixat här, bara dokumenterat): koden
-- som skriver hit (lib/partners/webhook.ts) skickar business_config.
-- business_id-strängar ("biz_...") in i en uuid-kolumn — troligen tyst
-- misslyckade inserts hittills (tabellen har 0 rader idag). Värt en egen,
-- separat kolumntyp-fix senare; ur RLS-synvinkel räcker casten.
DO $partner_events_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='partner_events') THEN
    ALTER TABLE public.partner_events ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='partner_events'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.partner_events', policy_name);
    END LOOP;
  END IF;
END
$partner_events_cleanup$;

CREATE POLICY partner_events_tenant_member
  ON public.partner_events
  FOR ALL
  TO authenticated
  USING (public.is_business_member(business_id::text))
  WITH CHECK (public.is_business_member(business_id::text));

CREATE POLICY partner_events_service_role
  ON public.partner_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.partner_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.partner_events TO authenticated;
GRANT ALL ON TABLE public.partner_events TO service_role;

-- ─── 5. PARTNERS — ingen tenant-koppling, egen affärsentitet med egna ─────
-- hemligheter (password_hash, api_key, webhook_secret). service_role ENDAST,
-- samma behandling som business_integration_credentials i v96. Partner-
-- inloggning/dashboard går via lib/partners/auth.ts + egna API-rutter, inte
-- via Supabase Auth eller webbläsarens Supabase-klient.
DO $partners_cleanup$
DECLARE policy_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='partners') THEN
    ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='partners'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.partners', policy_name);
    END LOOP;
  END IF;
END
$partners_cleanup$;

CREATE POLICY partners_service_role
  ON public.partners
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.partners FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partners TO service_role;

COMMIT;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
-- 1. Policyerna: varje tabell ska sakna 'public' i roles-listan.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'action_log','activity','agent_context','ai_learned_preferences',
    'allowance_reports','automation_activity','automation_settings',
    'business_counters','business_insights','business_preferences_legacy_v5',
    'calendar_connection','call','canvas_items','case_record','customer',
    'customer_activity','customer_document','deal','deal_flow','deal_flow_log',
    'emergency_escalation','form_submissions','fortnox_sync','grossist_product',
    'human_followup_queue','inbox_item','invoice','learning_events',
    'material_order','partner_events','pipeline_activity','pipeline_automation',
    'pricing_intelligence','reservation','rot_payment_request','schedule_entry',
    'sms_campaign','sms_conversation','supplier_connection','time_off_request',
    'transcript','v3_automation_logs','v3_automation_rules',
    'v3_automation_settings','vehicle_reports','vehicles','work_orders',
    'work_type',
    'allowance_types','checklist_template','form_templates','pipeline_stage',
    'pipeline_stages',
    'sms_campaign_recipient','transcript_turn','supplier_pricelist',
    'referrals','partners'
  )
ORDER BY tablename, policyname;

-- 2. Ingen av dessa 58 tabeller ska längre ha ett grant till anon.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND table_name IN (
    'action_log','activity','agent_context','ai_learned_preferences',
    'allowance_reports','automation_activity','automation_settings',
    'business_counters','business_insights','business_preferences_legacy_v5',
    'calendar_connection','call','canvas_items','case_record','customer',
    'customer_activity','customer_document','deal','deal_flow','deal_flow_log',
    'emergency_escalation','form_submissions','fortnox_sync','grossist_product',
    'human_followup_queue','inbox_item','invoice','learning_events',
    'material_order','partner_events','pipeline_activity','pipeline_automation',
    'pricing_intelligence','reservation','rot_payment_request','schedule_entry',
    'sms_campaign','sms_conversation','supplier_connection','time_off_request',
    'transcript','v3_automation_logs','v3_automation_rules',
    'v3_automation_settings','vehicle_reports','vehicles','work_orders',
    'work_type',
    'allowance_types','checklist_template','form_templates','pipeline_stage',
    'pipeline_stages',
    'sms_campaign_recipient','transcript_turn','supplier_pricelist',
    'referrals','partners'
  );
-- Förväntat resultat: 0 rader.

-- 3. Ögonkontroll i appen efteråt (inloggad som ägare OCH som anställd):
--    /dashboard/pipeline      — deals syns, går att flytta/redigera
--    /dashboard/customers/[id]— kundhistorik, aktivitet, dokument syns
--    /dashboard/invoices      — fakturor syns och går att skapa
--    /dashboard/inkorg        — samtal, SMS, transkript syns
--    /dashboard/schema        — bokningar syns
--    /dashboard/team          — personal, tidrapporter, reseräkningar
--    Partner-dashboarden (/partner/login → /partner/dashboard) — funkar
--    fortfarande, går via service_role-API:er, inte direkt klientläsning.
--    Tomt/trasigt någonstans = policyn biter fel; hör av dig innan något
--    mer ändras.
