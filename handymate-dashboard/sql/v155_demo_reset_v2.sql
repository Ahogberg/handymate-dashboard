-- V155: Demo-raderingen ikapp produkten (Demo-etapp D1)
--
-- KÖRS MANUELLT i Supabase SQL Editor. CREATE OR REPLACE på exakt samma
-- funktion som sql/v99_demo_reset_transaction.sql skapade — samma signatur,
-- samma SECURITY DEFINER, samma två grindar (is_demo_tenant FÖRST, sedan
-- owner/admin via auth.uid()), samma audit-rad. V99:s fil rörs INTE och kan
-- stå kvar orörd i repot som historik; det är DENNA fil databasen kör sist.
--
-- ═══ VARFÖR ═══
--
-- V99:s DELETE-manifest (2026-08-xx) täcker de ~25 tabeller som fanns då.
-- Sedan dess har produkten byggt ut Mission (v144/v150), Jobbpass (v154),
-- COGS-mätaren (v100), Mötesassistenten V2 (v119), fakturaunderlaget (v148),
-- Next Best Action (v132), Bränsle (v133), Business Twin (v139) — och en rad
-- äldre tabeller (leads, sms/e-post-loggar, dokument, tidrapportering m.fl.)
-- som ALDRIG stod i manifestet trots att de bär business_id-skopad demodata.
-- Ett reset som inte rensar dem läcker gårdagens demo in i morgondagens.
--
-- KRITISKAST: mission har ett UNIKT INDEX som tillåter högst EN aktiv rad
-- per company (idx_mission_one_active, v144). Om gårdagens demo fick ett
-- bekräftat uppdrag ("Ge teamet ett uppdrag") och raden aldrig städas,
-- blockerar unik-indexet nästa demos uppdrag med en tyst 23505-kollision.
--
-- ═══ TVÅ TIDIGARE TS-STÄDADE TABELLER FLYTTAS IN HÄR ═══
--
-- call_recording/project_outcome/project_lesson/customer_fact städades
-- tidigare i TypeScript (lib/demo/seed-demo-account.ts, steg 0b) EFTERSOM
-- V99:s RPC inte kände till dem. Nu när RPC:n ändå skrivs om äger den hela
-- raderingen atomiskt — TS-stegets separata, icke-transaktionella pre-städ
-- tas bort i samma ändring (se seed-demo-account.ts). call_recording MÅSTE
-- ligga FÖRE customer nedan: tabellen bär en NO ACTION-foreignkey mot
-- customer.customer_id (call_recording_customer_id_fkey, verifierad mot
-- prod — se den borttagna TS-kommentaren för historiken) som annars skulle
-- fälla raderingen av public.customer med en FK-violation.
--
-- ═══ TVÅ DOLDA FK-LANDMINOR SOM STYR ORDNINGEN NEDAN ═══
--
-- 1. next_best_action.top_approval_id REFERENCES pending_approvals(id) UTAN
--    ON DELETE-klausul (v132) ⇒ NO ACTION. automation_queue.agent_run_id
--    REFERENCES agent_runs(run_id) UTAN ON DELETE (sql/automation_rules.sql)
--    ⇒ NO ACTION, och automation_queue.customer_id / lead_activities.
--    agent_run_id har samma öde. Alla FYRA måste raderas FÖRE pending_
--    approvals/agent_runs/customer — därför ligger de allra först nedan,
--    före ens den ursprungliga v99-blocket.
-- 2. project_document.project_id REFERENCES project(project_id) skrevs UTAN
--    ON DELETE i sql/rot_rut_documents.sql. sql/v71_add_missing_fks.sql
--    FÖRSÖKTE senare mjuka upp den till ON DELETE SET NULL, men dess
--    IF NOT EXISTS-vakt (pg_constraint där conname='project_document_
--    project_id_fkey') matchade redan Postgres egen auto-genererade
--    constraint-namn från den ursprungliga, ovillkorade REFERENCES — så
--    ändringen blev ett no-op och NO ACTION gäller fortfarande. Samma
--    försiktighet gäller invoice_reminders.invoice_id (NO ACTION, ingen
--    senare mjukning alls). Båda ligger därför FÖRE project/invoice nedan,
--    inte bara av stil utan av nödvändighet.
--
-- business_twin_forecast ligger MEDVETET före project_outcome: dess CHECK-
-- constraint kräver project_outcome_id IS NOT NULL när status='verified'.
-- Raderas project_outcome före business_twin_forecast skulle FK:ns egen
-- ON DELETE SET NULL trigga en UPDATE som bryter det CHECK:et på en
-- 'verified'-rad. Genom att radera hela business_twin_forecast-raden
-- FÖRST (ingen UPDATE, bara en DELETE) undviks problemet helt.
--
-- Övriga nya tabeller saknar blockerande FK mot business_config/customer/
-- project/invoice/agent_runs/pending_approvals (verifierat tabell för
-- tabell mot sql/-filerna, se respektive migration) — de placeras ändå
-- löv-till-rot enligt samma disciplin som det ursprungliga manifestet.
--
-- meeting_segment saknar egen business_id-kolumn (bara job_id, sql/
-- v119_meeting_v2.sql) — raderas via en delfråga mot meeting_job, inte en
-- dynamisk tabellreferens (fortsatt inga dynamiskt byggda tabellnamn).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mission') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v144_mission.sql (public.mission saknas)';
  END IF;
  IF to_regclass('public.mission_mandate') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v150_mission_mandate.sql (public.mission_mandate saknas)';
  END IF;
  IF to_regclass('public.jobbpass') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v154_jobbpass.sql (public.jobbpass saknas)';
  END IF;
  IF to_regclass('public.cost_event') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v100_cogs_matare.sql (public.cost_event saknas)';
  END IF;
  IF to_regclass('public.meeting_job') IS NULL OR to_regclass('public.meeting_segment') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v119_meeting_v2.sql (public.meeting_job/meeting_segment saknas)';
  END IF;
  IF to_regclass('public.invoice_evidence_manifest') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v148_invoice_evidence_manifest.sql (public.invoice_evidence_manifest saknas)';
  END IF;
  IF to_regclass('public.next_best_action') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v132_next_best_action.sql (public.next_best_action saknas)';
  END IF;
  IF to_regclass('public.fuel_ledger') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v133_fuel_ledger.sql (public.fuel_ledger saknas)';
  END IF;
  IF to_regclass('public.business_twin_forecast') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v139_business_twin_forecast.sql (public.business_twin_forecast saknas)';
  END IF;
  IF to_regclass('public.customer_fact') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v122_customer_fact.sql (public.customer_fact saknas)';
  END IF;
  IF to_regclass('public.project_outcome') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v73_efterkalkyl.sql (public.project_outcome saknas)';
  END IF;
  IF to_regclass('public.project_lesson') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver sql/v121_project_lesson.sql (public.project_lesson saknas)';
  END IF;
  IF to_regclass('public.customer_activity') IS NULL THEN
    RAISE EXCEPTION 'v155 kräver att public.customer_activity finns (se lib/compliance/communication-trail.ts)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reset_demo_tenant(p_business_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_audit_id UUID := gen_random_uuid();
BEGIN
  -- FÖRSTA exekverbara raden i funktionskroppen: fail closed före audit/DELETE.
  -- Oförändrad från v99 — RÖR ALDRIG denna grind.
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_config
    WHERE business_id = p_business_id
      AND is_demo_tenant IS TRUE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Demo reset denied: tenant is not explicitly demo-flagged';
  END IF;

  -- Route-grinden är UX/API-skyddet; RPC:n upprepar även rollgrinden så en
  -- autentiserad demo-anställd inte kan anropa funktionen direkt.
  -- Oförändrad från v99 — RÖR ALDRIG denna grind.
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.business_users
    WHERE business_id = p_business_id
      -- business_users.user_id är TEXT i repots produktionsschema.
      AND user_id = auth.uid()::TEXT
      AND is_active IS TRUE
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Demo reset denied: owner or admin required';
  END IF;

  INSERT INTO public.demo_reset_audit (
    id,
    business_id,
    actor_user_id,
    started_at,
    finished_at,
    ok,
    error_text,
    reset_version
  ) VALUES (
    v_audit_id,
    p_business_id,
    auth.uid(),
    clock_timestamp(),
    NULL,
    NULL,
    NULL,
    'v155'
  );

  -- EXPLICIT DELETE-MANIFEST, löv till rot. Inga dynamiska tabellnamn och
  -- inga exception-block: ett fel avbryter RPC-transaktionen och bevarar det
  -- gamla demotillståndet i sin helhet.

  -- ── Grupp 0 (NY, v155): måste raderas FÖRE pending_approvals/agent_runs/
  --    customer nedan — se filhuvudets "dolda FK-landminor" punkt 1.
  DELETE FROM public.next_best_action WHERE business_id = p_business_id;
  DELETE FROM public.lead_activities WHERE business_id = p_business_id;
  DELETE FROM public.automation_queue WHERE business_id = p_business_id;
  -- call_recording: flyttad hit från TypeScript (steg 0b) — se filhuvudet.
  DELETE FROM public.call_recording WHERE business_id = p_business_id;
  DELETE FROM public.customer_activity WHERE business_id = p_business_id;

  -- ── Ursprungliga v99-blocket, ordagrant oförändrat ──────────────────
  DELETE FROM public.thread_message WHERE business_id = p_business_id;
  DELETE FROM public.agent_handoffs
    WHERE thread_id IN (
      SELECT id FROM public.agent_threads WHERE business_id = p_business_id
    );
  DELETE FROM public.agent_threads WHERE business_id = p_business_id;
  DELETE FROM public.agent_messages WHERE business_id = p_business_id;
  DELETE FROM public.agent_memories WHERE business_id = p_business_id;
  DELETE FROM public.business_knowledge WHERE business_id = p_business_id;
  DELETE FROM public.notification WHERE business_id = p_business_id;
  DELETE FROM public.pending_approvals WHERE business_id = p_business_id;
  DELETE FROM public.agent_runs WHERE business_id = p_business_id;
  DELETE FROM public.pipeline_activity WHERE business_id = p_business_id;

  -- ── Grupp 1 (NY, v155): fristående business_id-skopade tabeller ────
  -- (Mission/Mandate, COGS, Bränsle, Mötesassistenten, kommunikations-
  -- loggar, automation, leads, dokument, tidrapportering, Jobbpass,
  -- efterkalkyl/lärdom/kundfakta.) Ingen av dessa har en blockerande
  -- NO ACTION-FK mot en tabell som redan raderats ovan.
  DELETE FROM public.mission_mandate WHERE business_id = p_business_id;
  DELETE FROM public.mission WHERE business_id = p_business_id;
  DELETE FROM public.cost_event WHERE business_id = p_business_id;
  DELETE FROM public.fuel_ledger WHERE business_id = p_business_id;
  -- meeting_segment saknar egen business_id-kolumn — delfråga mot meeting_job.
  DELETE FROM public.meeting_segment
    WHERE job_id IN (SELECT id FROM public.meeting_job WHERE business_id = p_business_id);
  DELETE FROM public.meeting_job WHERE business_id = p_business_id;
  DELETE FROM public.sms_log WHERE business_id = p_business_id;
  DELETE FROM public.sms_conversation WHERE business_id = p_business_id;
  DELETE FROM public.sms_queue WHERE business_id = p_business_id;
  DELETE FROM public.communication_log WHERE business_id = p_business_id;
  DELETE FROM public.automation_activity WHERE business_id = p_business_id;
  DELETE FROM public.inbox_item WHERE business_id = p_business_id;
  DELETE FROM public.nurture_enrollment WHERE business_id = p_business_id;
  -- leads: customer_id REFERENCES customer(customer_id) UTAN ON DELETE
  -- (NO ACTION) — måste ligga före customer nedan.
  DELETE FROM public.leads WHERE business_id = p_business_id;
  DELETE FROM public.travel_entry WHERE business_id = p_business_id;
  DELETE FROM public.customer_document WHERE business_id = p_business_id;
  -- email_conversations: customer_id REFERENCES customer(customer_id) UTAN
  -- ON DELETE (NO ACTION, sql/v9_gmail_polling.sql) — måste ligga före
  -- customer nedan.
  DELETE FROM public.email_conversations WHERE business_id = p_business_id;
  DELETE FROM public.time_checkins WHERE business_id = p_business_id;
  DELETE FROM public.quote_tracking_events WHERE business_id = p_business_id;
  -- invoice_reminders: invoice_id REFERENCES invoice(invoice_id) UTAN
  -- ON DELETE (NO ACTION, sql/invoice_overhaul.sql) — måste ligga före
  -- invoice nedan.
  DELETE FROM public.invoice_reminders WHERE business_id = p_business_id;
  DELETE FROM public.invoice_evidence_manifest WHERE business_id = p_business_id;
  DELETE FROM public.project_events WHERE business_id = p_business_id;
  -- project_document: se filhuvudets "dolda FK-landminor" punkt 2 — måste
  -- ligga före project nedan.
  DELETE FROM public.project_document WHERE business_id = p_business_id;
  DELETE FROM public.project_milestone WHERE business_id = p_business_id;
  DELETE FROM public.work_orders WHERE business_id = p_business_id;
  -- business_twin_forecast: se filhuvudet — måste ligga före project_outcome.
  DELETE FROM public.business_twin_forecast WHERE business_id = p_business_id;
  DELETE FROM public.jobbpass WHERE business_id = p_business_id;
  DELETE FROM public.project_outcome WHERE business_id = p_business_id;
  DELETE FROM public.project_lesson WHERE business_id = p_business_id;
  -- customer_fact: självrefererande superseded_by-kedja raderas i EN
  -- DELETE-sats (samma mönster som redan kördes framgångsrikt i TS-
  -- städningen sedan 2026-08-12 — flyttad hit oförändrad, ingen ny risk).
  DELETE FROM public.customer_fact WHERE business_id = p_business_id;

  -- ── Ursprungliga v99-blocket, ordagrant oförändrat ──────────────────
  DELETE FROM public.project_log WHERE business_id = p_business_id;
  DELETE FROM public.project_photos WHERE business_id = p_business_id;
  DELETE FROM public.project_checklist WHERE business_id = p_business_id;
  DELETE FROM public.time_entry WHERE business_id = p_business_id;
  DELETE FROM public.project_material WHERE business_id = p_business_id;
  DELETE FROM public.project_change WHERE business_id = p_business_id;
  DELETE FROM public.schedule_entry WHERE business_id = p_business_id;
  DELETE FROM public.booking WHERE business_id = p_business_id;

  DELETE FROM public.quote_items WHERE business_id = p_business_id;
  DELETE FROM public.invoice WHERE business_id = p_business_id;
  DELETE FROM public.project WHERE business_id = p_business_id;
  DELETE FROM public.quotes WHERE business_id = p_business_id;
  DELETE FROM public.deal WHERE business_id = p_business_id;
  DELETE FROM public.customer WHERE business_id = p_business_id;

  -- Ett gammalt manifest får aldrig överleva och peka på rader som just
  -- raderats. Övriga företagsinställningar lämnas orörda.
  DELETE FROM public.business_preferences
  WHERE business_id = p_business_id
    AND key = 'demo_manifest';

  -- Fortnox-SIMLÄGET (D3, app/api/admin/demo-fortnox-sim): utan denna
  -- städning skulle "Återställ demon" radera de simulerade fakturorna/
  -- kunderna ovan men lämna kontot som "Fortnox ansluten" med
  -- synkstatistik som pekar på raderade rader. Loggtabellerna töms och de
  -- fem statuskolumnerna nollas — det ENDA business_config-ingreppet i
  -- hela funktionen, avsiktligt begränsat till simulationens egna fält
  -- (grinden ovan garanterar redan is_demo_tenant).
  DELETE FROM public.fortnox_api_log WHERE business_id = p_business_id;
  DELETE FROM public.fortnox_sync WHERE business_id = p_business_id;
  UPDATE public.business_config
  SET fortnox_connected = FALSE,
      fortnox_company_name = NULL,
      fortnox_connected_at = NULL,
      fortnox_last_synced_at = NULL,
      fortnox_token_expires_at = NULL
  WHERE business_id = p_business_id
    AND is_demo_tenant IS TRUE;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_tenant(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_demo_tenant(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_tenant(TEXT) TO authenticated;

COMMENT ON FUNCTION public.reset_demo_tenant(TEXT) IS
  'V155 demo-only atomisk radering (utökar V99:s manifest med Mission/Jobbpass/COGS/Mötesassistenten/NBA/Bränsle/Business Twin + tidigare TS-städade tabeller). Seedas fortsatt i TypeScript; kräver owner/admin-JWT.';

COMMIT;

-- ============================================================================
-- VERIFIERING efter körning
-- ============================================================================
--
-- 1. Funktionen pekar på v155, samma grindar som förut:
--   SELECT prosrc FROM pg_proc WHERE proname = 'reset_demo_tenant';
--   -- förväntat: innehåller "'v155'" och "is_demo_tenant IS TRUE"
--
-- 2. Behörigheterna är oförändrade:
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name = 'reset_demo_tenant';
--   -- förväntat: authenticated | EXECUTE (och ingen rad för anon/public)
--
-- 3. Full radräkning demokontot ska vara noll på ALLA nya tabeller direkt
--    efter en körning av /api/admin/demo-reset (kör var och en):
--   SELECT count(*) FROM public.mission WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.mission_mandate WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.jobbpass WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.cost_event WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.meeting_job WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.meeting_segment ms
--     JOIN public.meeting_job mj ON mj.id = ms.job_id
--     WHERE mj.business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.invoice_evidence_manifest WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.customer_activity WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.next_best_action WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.fuel_ledger WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.business_twin_forecast WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.leads WHERE business_id = 'biz_0lovw5vcwzqn';
--   SELECT count(*) FROM public.customer_fact WHERE business_id = 'biz_0lovw5vcwzqn';
--   -- förväntat: 0 på samtliga (kör EFTER ett reset — före seedningen har
--   -- hunnit lägga tillbaka nya rader, dvs kontrollera direkt efter
--   -- POST /api/admin/demo-reset men innan du agerar i UI:t)
--
-- 4. Inget aktivt uppdrag överlever ett reset (den kritiska bugg denna
--    migration finns till för att fixa):
--   SELECT count(*) FROM public.mission
--   WHERE business_id = 'biz_0lovw5vcwzqn' AND status = 'active';
--   -- förväntat: 0 direkt efter reset (innan D2-seeden ev. skapar en ny)
-- ============================================================================
