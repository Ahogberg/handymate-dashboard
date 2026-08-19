-- V158: Demo-raderingen ikapp OperatingExperiment (Demo-etapp D4)
--
-- KÖRS MANUELLT i Supabase SQL Editor. CREATE OR REPLACE på exakt samma
-- funktion som sql/v99_demo_reset_transaction.sql och sql/v155_demo_reset_
-- v2.sql skapade — samma signatur, samma SECURITY DEFINER, samma två grindar
-- (is_demo_tenant FÖRST, sedan owner/admin via auth.uid()), samma audit-rad.
-- V99:s och V155:s filer RÖRS INTE och kan stå kvar orörda i repot som
-- historik (samma disciplin som V155:s filhuvud beskrev för V99); det är
-- DENNA fil databasen kör sist.
--
-- ═══ VARFÖR ═══
--
-- OperatingExperiment Etapp 1+2 (sql/v157_operating_experiment.sql, byggd
-- och körd 2026-08-19) lägger en NY business_id-skopad tabell —
-- operating_experiment — som V155:s manifest inte kände till (den fanns inte
-- när V155 skrevs). Demo-etapp D4 seedar nu två operating_experiment-rader
-- (ett aktivt och ett redovisningsklart försök, se lib/demo/seed-demo-
-- account.ts steg 9h) på demokontot vid varje reset. Utan den här
-- migrationen skulle "Återställ demon" lämna gårdagens försök kvar —
-- samma läcka V155:s filhuvud beskrev för de tabeller som byggdes mellan
-- V99 och V155.
--
-- ═══ VAR OPERATING_EXPERIMENT PLACERAS I MANIFESTET ═══
--
-- operating_experiment (sql/v157) har EN FK: business_id REFERENCES
-- business_config(business_id) ON DELETE CASCADE. Ingen annan tabell
-- refererar operating_experiment.id (resulting_rule_id är en ren TEXT-
-- pekare till business_knowledge.id, ingen FK). Tabellen är alltså ett
-- rent löv utan beroenden ÅT NÅGOT HÅLL inom demo-manifestet — den kan stå
-- var som helst bland de fristående business_id-skopade tabellerna nedan.
-- Placerad tillsammans med de andra fristående Etapp-tabellerna (mission,
-- cost_event, fuel_ledger) för läsbarhetens skull, inte av nödvändighet.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mission') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v144_mission.sql (public.mission saknas)';
  END IF;
  IF to_regclass('public.mission_mandate') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v150_mission_mandate.sql (public.mission_mandate saknas)';
  END IF;
  IF to_regclass('public.jobbpass') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v154_jobbpass.sql (public.jobbpass saknas)';
  END IF;
  IF to_regclass('public.cost_event') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v100_cogs_matare.sql (public.cost_event saknas)';
  END IF;
  IF to_regclass('public.meeting_job') IS NULL OR to_regclass('public.meeting_segment') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v119_meeting_v2.sql (public.meeting_job/meeting_segment saknas)';
  END IF;
  IF to_regclass('public.invoice_evidence_manifest') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v148_invoice_evidence_manifest.sql (public.invoice_evidence_manifest saknas)';
  END IF;
  IF to_regclass('public.next_best_action') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v132_next_best_action.sql (public.next_best_action saknas)';
  END IF;
  IF to_regclass('public.fuel_ledger') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v133_fuel_ledger.sql (public.fuel_ledger saknas)';
  END IF;
  IF to_regclass('public.business_twin_forecast') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v139_business_twin_forecast.sql (public.business_twin_forecast saknas)';
  END IF;
  IF to_regclass('public.customer_fact') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v122_customer_fact.sql (public.customer_fact saknas)';
  END IF;
  IF to_regclass('public.project_outcome') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v73_efterkalkyl.sql (public.project_outcome saknas)';
  END IF;
  IF to_regclass('public.project_lesson') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v121_project_lesson.sql (public.project_lesson saknas)';
  END IF;
  IF to_regclass('public.customer_activity') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver att public.customer_activity finns (se lib/compliance/communication-trail.ts)';
  END IF;
  -- NY (v158): OperatingExperiment Etapp 1 — se filhuvudet.
  IF to_regclass('public.operating_experiment') IS NULL THEN
    RAISE EXCEPTION 'v158 kräver sql/v157_operating_experiment.sql (public.operating_experiment saknas)';
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
  -- Oförändrad från v99/v155 — RÖR ALDRIG denna grind.
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
  -- Oförändrad från v99/v155 — RÖR ALDRIG denna grind.
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
    'v158'
  );

  -- EXPLICIT DELETE-MANIFEST, löv till rot. Inga dynamiska tabellnamn och
  -- inga exception-block: ett fel avbryter RPC-transaktionen och bevarar det
  -- gamla demotillståndet i sin helhet.

  -- ── Grupp 0 (v155): måste raderas FÖRE pending_approvals/agent_runs/
  --    customer nedan — se v155:s filhuvud "dolda FK-landminor".
  DELETE FROM public.next_best_action WHERE business_id = p_business_id;
  DELETE FROM public.lead_activities WHERE business_id = p_business_id;
  DELETE FROM public.automation_queue WHERE business_id = p_business_id;
  -- call_recording: flyttad hit från TypeScript i v155 — se v155:s filhuvud.
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

  -- ── Grupp 1 (v155): fristående business_id-skopade tabeller ────
  -- (Mission/Mandate, COGS, Bränsle, Mötesassistenten, kommunikations-
  -- loggar, automation, leads, dokument, tidrapportering, Jobbpass,
  -- efterkalkyl/lärdom/kundfakta.) Ingen av dessa har en blockerande
  -- NO ACTION-FK mot en tabell som redan raderats ovan.
  DELETE FROM public.mission_mandate WHERE business_id = p_business_id;
  DELETE FROM public.mission WHERE business_id = p_business_id;
  DELETE FROM public.cost_event WHERE business_id = p_business_id;
  DELETE FROM public.fuel_ledger WHERE business_id = p_business_id;
  -- operating_experiment (NY, v158): FK bara mot business_config (ON DELETE
  -- CASCADE), inget refererar operating_experiment.id — rent löv, se
  -- filhuvudet. Fristående precis som cost_event/fuel_ledger ovan.
  DELETE FROM public.operating_experiment WHERE business_id = p_business_id;
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
  -- project_document: se v155:s filhuvud "dolda FK-landminor" punkt 2 —
  -- måste ligga före project nedan.
  DELETE FROM public.project_document WHERE business_id = p_business_id;
  DELETE FROM public.project_milestone WHERE business_id = p_business_id;
  DELETE FROM public.work_orders WHERE business_id = p_business_id;
  -- business_twin_forecast: se v155:s filhuvud — måste ligga före project_outcome.
  DELETE FROM public.business_twin_forecast WHERE business_id = p_business_id;
  DELETE FROM public.jobbpass WHERE business_id = p_business_id;
  DELETE FROM public.project_outcome WHERE business_id = p_business_id;
  DELETE FROM public.project_lesson WHERE business_id = p_business_id;
  -- customer_fact: självrefererande superseded_by-kedja raderas i EN
  -- DELETE-sats (samma mönster som redan kördes framgångsrikt i TS-
  -- städningen sedan 2026-08-12 — flyttad in i v155 oförändrad).
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
  'V158 demo-only atomisk radering (utökar V155:s manifest med OperatingExperiment/operating_experiment, sql/v157). Seedas fortsatt i TypeScript; kräver owner/admin-JWT.';

COMMIT;

-- ============================================================================
-- VERIFIERING efter körning
-- ============================================================================
--
-- 1. Funktionen pekar på v158, samma grindar som förut:
--   SELECT prosrc FROM pg_proc WHERE proname = 'reset_demo_tenant';
--   -- förväntat: innehåller "'v158'" och "is_demo_tenant IS TRUE"
--
-- 2. Behörigheterna är oförändrade:
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name = 'reset_demo_tenant';
--   -- förväntat: authenticated | EXECUTE (och ingen rad för anon/public)
--
-- 3. Full radräkning demokontot ska vara noll på operating_experiment direkt
--    efter en körning av /api/admin/demo-reset (kör EFTER ett reset, före
--    D4-seeden hunnit lägga tillbaka nya rader):
--   SELECT count(*) FROM public.operating_experiment WHERE business_id = 'biz_0lovw5vcwzqn';
--   -- förväntat: 0
--
-- 4. Efter en fullständig reset (inkl. seedningen) ska demokontot visa
--    EXAKT två operating_experiment-rader: ett aktivt och ett avslutat:
--   SELECT status, job_type, jsonb_array_length(enrolled_project_ids) AS enrolled
--   FROM public.operating_experiment WHERE business_id = 'biz_0lovw5vcwzqn' ORDER BY created_at;
--   -- förväntat: ('active', 'badrum', 2), ('concluded', 'badrum', 1)
-- ============================================================================
