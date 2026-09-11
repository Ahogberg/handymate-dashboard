-- V225: Demo-resetten fungerar igen — fortnox_token_expires_at flyttade
--
-- KÖRS MANUELLT i Supabase SQL Editor. CREATE OR REPLACE på exakt samma
-- funktion som v99/v155/v158 skapade — samma signatur, samma SECURITY DEFINER,
-- samma två grindar (is_demo_tenant FÖRST, sedan owner/admin via auth.uid()),
-- samma audit-rad, samma raderingsmanifest. Föregående filer RÖRS INTE och
-- står kvar som historik; det är DENNA fil databasen kör sist.
--
-- ═══ FELET ═══
--
-- "Återställ demon" har svarat "Demon kunde inte återställas" och skrivit
-- error_text = 'delete_transaction_failed' i demo_reset_audit. Raderings-
-- manifestet var aldrig problemet — det går igenom rent (verifierat med en
-- torrkörning av samtliga 61 DELETE-satser mot demotenanten, rullad tillbaka).
--
-- Felet satt i funktionens SISTA sats, Fortnox-simlägets städning:
--
--   UPDATE public.business_config
--   SET ..., fortnox_token_expires_at = NULL
--
-- Den kolumnen finns inte på business_config. Fortnox-hemligheterna flyttades
-- till public.business_integration_credentials (v96, "Fortnox-hemligheter
-- flyttas och kan bara läsas av service_role" — facit i
-- tests/permission-contract.spec.ts), och tokenutgången följde med. Kvar på
-- business_config finns bara de fyra statusfälten.
--
-- PL/pgSQL planerar satsen först vid exekvering, så felet var osynligt vid
-- CREATE FUNCTION och slog 42703 (undefined_column) varje körning. Eftersom
-- hela RPC:n är EN transaktion rullade också raderingen tillbaka — demokontot
-- blev aldrig skadat, men det gick heller aldrig att återställa. Auditraden
-- säger 'delete_transaction_failed' för att TypeScript-lagret skriver den
-- koden för ALLA RPC-fel (lib/demo/seed-demo-account.ts steg 1), inte för att
-- en DELETE felade.
--
-- Samma fel finns i v158 och v155; v99-raden i auditen från 2026-08-13 har
-- sannolikt samma orsak. Det har alltså aldrig fungerat efter v96.
--
-- ═══ FIXEN ═══
--
-- 1. Den okända kolumnen bort ur business_config-UPDATE:n.
-- 2. Tokenfälten nollas i business_integration_credentials i stället, så den
--    ursprungliga garantin består: efter en reset finns inget kvarglömt token
--    bakom ett fortnox_connected = FALSE.
--
-- Inget annat i funktionen ändras.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_integration_credentials') IS NULL THEN
    RAISE EXCEPTION 'v225 kräver public.business_integration_credentials (v96)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_integration_credentials'
      AND column_name = 'fortnox_token_expires_at'
  ) THEN
    RAISE EXCEPTION 'v225 kräver business_integration_credentials.fortnox_token_expires_at';
  END IF;
  -- Grinden som faktiskt gick sönder: om kolumnen NÅGON GÅNG kommer tillbaka
  -- till business_config ska den här migrationen inte tysta över det.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_config'
      AND column_name = 'fortnox_token_expires_at'
  ) THEN
    RAISE EXCEPTION 'business_config.fortnox_token_expires_at finns igen — granska v225 innan den körs';
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
    'v225'
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
      fortnox_last_synced_at = NULL
  WHERE business_id = p_business_id
    AND is_demo_tenant IS TRUE;

  -- Tokenutgången bor sedan v96 i business_integration_credentials, inte på
  -- business_config. Samma garanti som förut — inget kvarglömt token bakom ett
  -- fortnox_connected = FALSE — men mot den tabell kolumnen faktiskt ligger i.
  -- UPDATE, inte DELETE: raden får leva, hemligheterna töms.
  UPDATE public.business_integration_credentials
  SET fortnox_access_token = NULL,
      fortnox_refresh_token = NULL,
      fortnox_token_expires_at = NULL,
      updated_at = NOW()
  WHERE business_id = p_business_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_tenant(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_demo_tenant(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_tenant(TEXT) TO authenticated;

COMMENT ON FUNCTION public.reset_demo_tenant(TEXT) IS
  'V225 demo-only atomisk radering (v158:s manifest oförändrat; Fortnox-tokenstädningen flyttad till business_integration_credentials där kolumnen faktiskt bor). Seedas fortsatt i TypeScript; kräver owner/admin-JWT.';

COMMIT;

-- ============================================================================
-- VERIFIERING efter körning
-- ============================================================================
--
-- 1. Funktionen pekar på v225 och rör inte längre den okända kolumnen:
--   SELECT prosrc LIKE '%''v225''%' AS ar_v225,
--          prosrc LIKE '%fortnox_token_expires_at = NULL%' AS nollar_token,
--          prosrc LIKE '%business_config%fortnox_token_expires_at%' AS ror_gamla_kolumnen
--   FROM pg_proc WHERE proname = 'reset_demo_tenant';
--   -- förväntat: true, true, false
--
-- 2. Grindarna är oförändrade:
--   SELECT prosrc LIKE '%is_demo_tenant IS TRUE%' AS demogrind,
--          prosrc LIKE '%owner or admin required%' AS rollgrind
--   FROM pg_proc WHERE proname = 'reset_demo_tenant';
--   -- förväntat: true, true
--
-- 3. Behörigheterna är oförändrade:
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name = 'reset_demo_tenant';
--   -- förväntat: authenticated | EXECUTE (och ingen rad för anon/public)
--
-- 4. Kör "Återställ" i presentatörsbalken. Auditen ska visa ok = true:
--   SELECT started_at, ok, error_text, reset_version FROM public.demo_reset_audit
--   ORDER BY started_at DESC LIMIT 1;
--   -- förväntat: ok = true, error_text = NULL, reset_version = 'v225'
--
-- 5. Uppdraget (steg 9i i seeden) ska ha landat:
--   SELECT status, goal_kr, deadline FROM public.mission
--   WHERE business_id = 'biz_0lovw5vcwzqn' ORDER BY created_at DESC;
--   -- förväntat: en 'active' + tre 'completed'
-- ============================================================================
