-- v229: demoresetens Fortnox-städning pekade på en kolumn som inte finns.
--
-- Bakgrund (2026-09-11). v227 rättade rollgrinden (uuid mot text) och ligger
-- körd i produktion — funktionen innehåller 'user_id::TEXT = auth.uid()::TEXT'.
-- Men resetten misslyckas fortfarande. demo_reset_audit har fyra rader, alla
-- ok = false med delete_transaction_failed, de tre senaste 2026-09-10.
--
-- Orsaken är den sista satsen i funktionen: den nollar
-- business_config.fortnox_token_expires_at. Den kolumnen finns inte på
-- business_config i produktion (den bor i business_integration_credentials
-- sedan v96), så satsen ger 42703 och river hela transaktionen.
--
-- Codex skrev samma rättelse som v225_demo_reset_v4 på en sidobranch. Den
-- filen går INTE att köra som den är av två skäl: numret v225 är upptaget av
-- v225_hemsideforslag_utgangna på main, och den bygger på v158 och saknar
-- därmed v227:s castfix — att köra den hade återinfört rollgrindsbuggen.
--
-- Den här filen är v227 med exakt två ändringar: tokenstädningen flyttad till
-- rätt tabell, och versionsstämpeln. Manifestet, båda grindarna, auditraden
-- och castfixen är ordagrant oförändrade.

DO $guard$
BEGIN
  IF to_regclass('public.business_integration_credentials') IS NULL THEN
    RAISE EXCEPTION 'v229 kräver public.business_integration_credentials (v96)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_integration_credentials'
      AND column_name = 'fortnox_token_expires_at'
  ) THEN
    RAISE EXCEPTION 'v229 kräver business_integration_credentials.fortnox_token_expires_at';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_config'
      AND column_name = 'fortnox_token_expires_at'
  ) THEN
    RAISE EXCEPTION 'business_config.fortnox_token_expires_at finns igen — granska v229 innan den körs';
  END IF;
END
$guard$;

-- v227: demoresetens rollgrind jämförde uuid mot text och föll på VARJE anrop.
--
-- Bakgrund (2026-09-10). Andreas frågade om demokontot har all byggd
-- funktionalitet med demodata. Svaret var nej, och roten var inte seedarens
-- täckning — det var att RESETEN aldrig har lyckats.
--
-- demo_reset_audit har EN rad i hela historien: 2026-08-13 07:30,
-- ok = false, reset_version 'v99', error_text 'delete_transaction_failed'.
-- Ett prov av reset_demo_tenant('biz_0lovw5vcwzqn') i en rullad transaktion
-- gav i dag exakt samma fel, nu med orsaken utskriven:
--
--   ERROR 42883: operator does not exist: uuid = text
--   CONTEXT: PL/pgSQL function reset_demo_tenant(text) line 21 at IF
--
-- Raden är rollgrinden, ärvd oförändrad genom v99 → v155 → v158:
--
--   -- business_users.user_id är TEXT i repots produktionsschema.
--   AND user_id = auth.uid()::TEXT
--
-- Kommentaren stämmer inte. Mot information_schema i produktion är
-- business_users.user_id av typen UUID; det är business_id och id som är
-- TEXT. Casten låg alltså på fel sida, jämförelsen blev uuid = text, och
-- PostgreSQL har ingen sådan operator. Undantaget kastas FÖRE grinden kan
-- utvärderas, hela transaktionen rullas tillbaka, och anroparen får bara
-- 'delete_transaction_failed' utan att veta varför.
--
-- Följden: demoresetten har varit trasig sedan funktionen driftsattes.
-- Demokontots data är ett månadsgammalt delvis tillstånd — 11 affärer men
-- 1 kund och 0 leads, och 0 time_entry / 0 project_material trots att
-- seedaren skriver båda.
--
-- Rättningen castar BÅDA sidor till text i stället för att lita på
-- kolumntypen. Avsiktligt mer defensivt än `user_id = auth.uid()`: felet
-- föddes ur att repots antagande om typen inte stämde med miljön, och samma
-- funktion körs mot både produktions- och testprojektet, som inte behöver ha
-- samma typ. En text-mot-text-jämförelse är korrekt i båda fallen.
--
-- INGET annat ändras. Prov i en rullad transaktion mot produktion, före och
-- efter, med felet fångat och returnerat som data:
--
--   före:  42883  operator does not exist: uuid = text
--   efter: 42501  Demo reset denied: owner or admin required
--
-- Det är precis rätt utfall: grinden GÅR nu att utvärdera, och den nekar
-- fortfarande en anropare utan auth.uid(). Båda grindarna är verifierat kvar
-- i den driftsatta källan efter körning (is_demo_tenant + owner/admin),
-- funktionen är fortfarande SECURITY DEFINER, och längden växte med exakt
-- sex tecken — de i '::TEXT'.
--
-- Kör: hela filen.

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
      -- v227: business_users.user_id är UUID i produktion, inte TEXT — den
      -- gamla kommentaren var faktiskt fel. Båda sidor castas nu, så
      -- jämförelsen är korrekt oavsett kolumntyp i miljön.
      AND user_id::TEXT = auth.uid()::TEXT
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
    'v229'
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

  -- v229: tokenfälten bor i business_integration_credentials (v96), inte på
  -- business_config. Raden ovan försökte nolla en kolumn som inte finns, och
  -- 42703 fällde hela transaktionen — därav delete_transaction_failed på
  -- samtliga fyra försök i demo_reset_audit. Städningen görs nu på rätt
  -- tabell, så demon inte lämnas med levande Fortnox-token efter en reset.
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
  'v229 demo-only atomisk radering. v227:s manifest, grindar och castfix oförändrade; Fortnox-tokenstädningen flyttad till business_integration_credentials där kolumnen faktiskt bor. Seedas fortsatt i TypeScript; kräver owner/admin-JWT.';

-- Verifiering efter körning:
--   SELECT position('business_integration_credentials' in pg_get_functiondef(p.oid)) > 0 AS fortnoxfix,
--          position('user_id::TEXT = auth.uid()::TEXT' in pg_get_functiondef(p.oid)) > 0 AS castfix
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'reset_demo_tenant';
--   -- Tryck sedan Återställ i demon och kontrollera:
--   SELECT ok, reset_version, error_text FROM demo_reset_audit ORDER BY started_at DESC LIMIT 1;
