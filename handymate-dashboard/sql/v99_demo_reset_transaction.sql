-- V99: Atomisk och auditerad radering för demokontots reset
--
-- KÖRS MANUELLT i Supabase SQL Editor före nästa demo.
-- Seedningen stannar i lib/demo/seed-demo-account.ts. Den här RPC:n gör bara
-- den destruktiva delen atomisk: om en enda DELETE misslyckas rullas samtliga
-- DELETEs och den påbörjade auditraden tillbaka.

-- Databasen är den sista grinden. Route-lagrets DEMO_BUSINESS_ID räcker inte
-- för en SECURITY DEFINER-funktion som även kan anropas direkt.
ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS is_demo_tenant BOOLEAN NOT NULL DEFAULT FALSE;

-- Det befintliga, dokumenterade demokontot (sql/demo-konto-setup.sql).
UPDATE public.business_config
SET is_demo_tenant = TRUE
WHERE business_id = 'biz_0lovw5vcwzqn';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_config
    WHERE business_id = 'biz_0lovw5vcwzqn'
      AND is_demo_tenant IS TRUE
  ) THEN
    RAISE EXCEPTION 'V99: det dokumenterade demokontot kunde inte flaggas';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.demo_reset_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  actor_user_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN,
  error_text TEXT,
  reset_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_demo_reset_audit_business_started
  ON public.demo_reset_audit (business_id, started_at DESC);

ALTER TABLE public.demo_reset_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_reset_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.demo_reset_audit FROM anon;
REVOKE ALL ON TABLE public.demo_reset_audit FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.demo_reset_audit TO service_role;

-- Ingen authenticated-policy: auditen innehåller inga kunddata men är ändå
-- intern driftdata. Appen använder service_role och den äger hela livscykeln.
DROP POLICY IF EXISTS demo_reset_audit_service_role ON public.demo_reset_audit;
CREATE POLICY demo_reset_audit_service_role
  ON public.demo_reset_audit
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

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
    'v99'
  );

  -- EXPLICIT DELETE-MANIFEST, löv till rot. Inga dynamiska tabellnamn och
  -- inga exception-block: ett fel avbryter RPC-transaktionen och bevarar det
  -- gamla demotillståndet i sin helhet.
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

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_tenant(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_demo_tenant(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_tenant(TEXT) TO authenticated;

COMMENT ON FUNCTION public.reset_demo_tenant(TEXT) IS
  'V99 demo-only atomisk radering. Seedas fortsatt i TypeScript; kräver owner/admin-JWT.';
