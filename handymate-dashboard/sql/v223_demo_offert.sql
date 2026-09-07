-- v223: Demo-offerten på handymate.se — "Skicka en offert till dig själv"
--       (Varumärkeslagret yta 9, 2026-09-08)
--
-- Körs manuellt i Supabase SQL Editor. Koden är FAIL-CLOSED: POST
-- /api/public/demo-quote skapar INGENTING om raden nedan saknas eller om
-- is_demo_tenant inte är true (svar 503 "Kunde inte skicka"). Pushen
-- kraschar alltså inte utan migrationen — blocket på landningen fungerar
-- bara inte förrän den körts.
--
-- ═══ VARFÖR ═══
--
-- Besökaren på handymate.se skriver namn + mobil och får en RIKTIG offert-
-- SMS från demo-företaget "Ekström Bygg AB", öppnar den riktiga portalen,
-- kan godkänna, och ser sedan vad som hände (projekt skapat, affär vunnen).
-- Det är samma kod som riktiga hantverkares kunder möter — inget mockat.
--
-- Demo-företaget är därför ett vanligt business_config med tre särdrag:
--   is_demo_tenant = true     städningen (demo_quote_cleanup) vägrar annars
--   agents_globally_paused    ingen agent ska ringa/skriva åt Ekström
--   automation_settings av    ingen offertpåminnelse till besökaren
-- Ingen business_users-rad: ingen kan logga in som Ekström.
--
-- ═══ KOLLA FÖRST ═══
--   ls sql | grep v22    -- v223 ska vara ledigt (Codex delar serien)

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_config') IS NULL THEN
    RAISE EXCEPTION 'v223 kräver business_config';
  END IF;
  IF to_regclass('public.automation_settings') IS NULL THEN
    RAISE EXCEPTION 'v223 kräver automation_settings';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'business_config' AND column_name = 'is_demo_tenant'
  ) THEN
    RAISE EXCEPTION 'v223 kräver business_config.is_demo_tenant (v158)';
  END IF;
END $$;

-- ─── 1. Demo-företaget ──────────────────────────────────────────────────
-- Idempotent: körs den igen skrivs bara skyddsflaggorna om, inte namn/adress
-- (så en manuell justering i UI:t överlever en omkörning).
-- phone_number lämnas NULL med flit: "Frågor? Ring …"-raden i offert-SMS:et
-- utelämnas då — vi hittar inte på ett nummer som ingen svarar på.
INSERT INTO business_config (
  business_id, business_name, org_number, address, f_skatt_registered,
  accent_color, default_vat_rate, rot_enabled, industry,
  subscription_plan, subscription_status, is_active,
  is_demo_tenant, agents_globally_paused, onboarding_completed_at
) VALUES (
  'biz_demo_ekstrom', 'Ekström Bygg AB', '556123-4567', 'Nacka', true,
  '#F59E0B', 25, true, 'hantverkare',
  'business', 'active', true,
  true, true, now()
)
ON CONFLICT (business_id) DO UPDATE SET
  is_demo_tenant = true,
  agents_globally_paused = true,
  subscription_plan = EXCLUDED.subscription_plan,
  subscription_status = EXCLUDED.subscription_status,
  is_active = true;

-- ─── 2. Automationer av ─────────────────────────────────────────────────
-- quote-follow-up-cronen hoppar över företag med sms_auto_enabled = false
-- eller sms_quote_followup = false. Besökaren ska få exakt två SMS: offerten
-- och "se vad som hände" — aldrig en påminnelse dagen efter.
INSERT INTO automation_settings (
  business_id, sms_auto_enabled, sms_quote_followup, sms_booking_confirmation,
  sms_day_before_reminder, sms_on_the_way, sms_job_completed, sms_invoice_reminder,
  sms_review_request, ai_analyze_calls, ai_create_leads, ai_auto_move_deals,
  auto_approve_enabled
) VALUES (
  'biz_demo_ekstrom', false, false, false,
  false, false, false, false,
  false, false, false, false,
  false
)
ON CONFLICT (business_id) DO UPDATE SET
  sms_auto_enabled = false,
  sms_quote_followup = false,
  auto_approve_enabled = false,
  updated_at = now();

-- ─── 3. Städfunktionen ──────────────────────────────────────────────────
-- Anropas av underhållscronen (lib/demo/demo-quote-cleanup.ts) med
-- p_older_than_days = 7: en besökares kund + offert + projekt + affär lever
-- en vecka (offertens giltighetstid), sedan raderas allt. Personuppgifter
-- (namn, mobilnummer) ska inte ligga kvar längre än demon behöver dem.
--
-- Vägrar på allt som inte är markerat demo — funktionen kan aldrig städa
-- en riktig hantverkares kunder även om någon anropar den med fel id.
--
-- Ordningen är FK-säker (prod 2026-09-08): deal→pipeline_activity,
-- deal_automation_tasks, customer_document CASCADE:ar; quotes→quote_items
-- CASCADE:ar; project→work_orders/jobbpass CASCADE:ar, övriga SET NULL.
-- customer_activity, sms_conversation, quotes → customer är NO ACTION och
-- tas därför bort explicit före kunden.
CREATE OR REPLACE FUNCTION public.demo_quote_cleanup(
  p_business_id text,
  p_older_than_days integer DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 0 = städa allt nu (efter skarptest); cronen skickar alltid 7
  v_cutoff     timestamptz := now() - make_interval(days => GREATEST(p_older_than_days, 0));
  v_is_demo    boolean;
  v_customers  text[];
  v_quotes     text[];
  v_projects   text[];
  v_deals      text[];
  n_customers  integer := 0;
  n_quotes     integer := 0;
  n_projects   integer := 0;
  n_deals      integer := 0;
BEGIN
  SELECT is_demo_tenant INTO v_is_demo
  FROM business_config WHERE business_id = p_business_id;

  IF v_is_demo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'demo_quote_cleanup: % är inte markerat som demo-företag (is_demo_tenant)', p_business_id;
  END IF;

  SELECT COALESCE(array_agg(customer_id), '{}') INTO v_customers
  FROM customer WHERE business_id = p_business_id AND created_at < v_cutoff;

  SELECT COALESCE(array_agg(quote_id), '{}') INTO v_quotes
  FROM quotes
  WHERE business_id = p_business_id
    AND (customer_id = ANY (v_customers) OR created_at < v_cutoff);

  SELECT COALESCE(array_agg(project_id), '{}') INTO v_projects
  FROM project
  WHERE business_id = p_business_id
    AND (customer_id = ANY (v_customers) OR quote_id = ANY (v_quotes) OR created_at < v_cutoff);

  SELECT COALESCE(array_agg(id), '{}') INTO v_deals
  FROM deal
  WHERE business_id = p_business_id
    AND (customer_id = ANY (v_customers) OR quote_id = ANY (v_quotes) OR created_at < v_cutoff);

  -- Spår utan FK, kopplade via id-kolumner
  DELETE FROM quote_tracking_events WHERE business_id = p_business_id AND quote_id = ANY (v_quotes);
  DELETE FROM project_milestone     WHERE business_id = p_business_id AND project_id = ANY (v_projects);
  DELETE FROM sms_log               WHERE business_id = p_business_id AND (customer_id = ANY (v_customers) OR created_at < v_cutoff);
  DELETE FROM sms_conversation      WHERE business_id = p_business_id AND (customer_id = ANY (v_customers) OR created_at < v_cutoff);
  DELETE FROM customer_activity     WHERE business_id = p_business_id AND (customer_id = ANY (v_customers) OR created_at < v_cutoff);

  -- Företagsomfattande spår: bara demo-företaget, bara äldre än gränsen
  DELETE FROM pending_approvals WHERE business_id = p_business_id AND created_at < v_cutoff;
  DELETE FROM notification      WHERE business_id = p_business_id AND created_at < v_cutoff;
  DELETE FROM cost_event        WHERE business_id = p_business_id AND created_at < v_cutoff;

  -- Huvudraderna i FK-ordning
  DELETE FROM project  WHERE business_id = p_business_id AND project_id = ANY (v_projects);
  GET DIAGNOSTICS n_projects = ROW_COUNT;

  DELETE FROM quotes   WHERE business_id = p_business_id AND quote_id = ANY (v_quotes);
  GET DIAGNOSTICS n_quotes = ROW_COUNT;

  DELETE FROM deal     WHERE business_id = p_business_id AND id = ANY (v_deals);
  GET DIAGNOSTICS n_deals = ROW_COUNT;

  DELETE FROM customer WHERE business_id = p_business_id AND customer_id = ANY (v_customers);
  GET DIAGNOSTICS n_customers = ROW_COUNT;

  RETURN jsonb_build_object(
    'customers', n_customers,
    'quotes', n_quotes,
    'projects', n_projects,
    'deals', n_deals,
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.demo_quote_cleanup(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_quote_cleanup(text, integer) TO service_role;

COMMIT;

-- ═══ VERIFIERA ═══
-- SELECT business_id, business_name, is_demo_tenant, agents_globally_paused,
--        subscription_plan, subscription_status, phone_number
-- FROM business_config WHERE business_id = 'biz_demo_ekstrom';
-- SELECT sms_auto_enabled, sms_quote_followup FROM automation_settings WHERE business_id = 'biz_demo_ekstrom';
-- SELECT public.demo_quote_cleanup('biz_demo_ekstrom', 7);   -- {"customers":0,...}
-- SELECT public.demo_quote_cleanup('biz_finns_inte', 7);     -- ska KASTA (inte demo)
