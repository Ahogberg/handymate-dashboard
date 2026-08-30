-- Samtalsefterarbete V1. MANUELL migration, kör inte via appen.
-- Lagringspolicy måste granskas och leverantörernas radering verifieras före
-- aktivering. Den här filen aktiverar INGEN gallring och raderar INGA rader.
BEGIN;

ALTER TABLE public.call_recording
  ADD COLUMN IF NOT EXISTS call_processing jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.project(project_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_deleted_at timestamptz;

-- These server-owned fields must not be forgeable through authenticated table
-- grants. A retained tombstone must never acquire new raw data through an old
-- editor. The trigger is INVOKER: it sees the actual database role.
CREATE OR REPLACE FUNCTION public.guard_call_processing_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.call_processing <> '{}'::jsonb OR NEW.raw_deleted_at IS NOT NULL OR NEW.project_id IS NOT NULL THEN
        RAISE EXCEPTION 'call_fields_server_owned';
      END IF;
    ELSIF NEW.call_processing IS DISTINCT FROM OLD.call_processing
      OR NEW.raw_deleted_at IS DISTINCT FROM OLD.raw_deleted_at
      OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'call_fields_server_owned';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.raw_deleted_at IS NOT NULL AND (NEW.raw_deleted_at IS DISTINCT FROM OLD.raw_deleted_at
      OR NEW.transcript IS NOT NULL OR NEW.transcript_text IS NOT NULL
      OR NEW.transcript_segments IS NOT NULL OR NEW.transcript_summary IS NOT NULL
      OR NEW.ai_analysis IS NOT NULL OR NEW.recording_url IS NOT NULL) THEN
      RAISE EXCEPTION 'call_raw_data_expired';
    END IF;
    IF OLD.call_processing ? 'version' AND NEW.raw_deleted_at IS NULL
      AND NEW.transcript IS DISTINCT FROM OLD.transcript THEN
      RAISE EXCEPTION 'call_transcript_already_analyzed';
    END IF;
  END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project p WHERE p.project_id=NEW.project_id
      AND p.business_id=NEW.business_id AND p.customer_id=NEW.customer_id
  ) THEN RAISE EXCEPTION 'call_project_mismatch'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_call_processing_fields ON public.call_recording;
CREATE TRIGGER guard_call_processing_fields BEFORE INSERT OR UPDATE ON public.call_recording
  FOR EACH ROW EXECUTE FUNCTION public.guard_call_processing_fields();

-- Samma recording_id är navet; inget nytt samtals-/approval-system.
CREATE TABLE IF NOT EXISTS public.call_retention_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id text NOT NULL,
  recording_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('raw_purged','audio_pointer_cleared')),
  created_at timestamptz NOT NULL DEFAULT now(),
  legal_review_ref text NOT NULL,
  provider_deletion_ref text NOT NULL
);
ALTER TABLE public.call_retention_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_retention_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.call_retention_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.call_retention_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.manage_call_processing(
  p_business_id text, p_recording_id text, p_operation text, p_token text,
  p_data jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r public.call_recording%ROWTYPE;
  s jsonb;
  card jsonb;
  n integer := 0;
  added integer;
  next_phase text;
BEGIN
  SELECT * INTO r FROM public.call_recording
    WHERE recording_id = p_recording_id AND business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recording_not_found'; END IF;
  s := COALESCE(r.call_processing, '{}'::jsonb);
  IF r.raw_deleted_at IS NOT NULL THEN RETURN jsonb_build_object('status','expired','state',s); END IF;

  IF p_operation = 'claim' THEN
    IF s->>'phase' = 'complete' THEN RETURN jsonb_build_object('status','complete','state',s); END IF;
    IF (s->>'lease_until')::timestamptz > now() THEN RETURN jsonb_build_object('status','busy','state',s); END IF;
    -- Historical, potentially half-created batches must not be guessed/rebuilt.
    IF NOT (s ? 'version') AND (
      EXISTS (SELECT 1 FROM public.pending_approvals WHERE business_id=p_business_id AND payload @> jsonb_build_object('recording_id',p_recording_id))
      OR EXISTS (SELECT 1 FROM public.ai_suggestion WHERE recording_id=p_recording_id)
    ) THEN RETURN jsonb_build_object('status','legacy','state',s); END IF;
    IF p_token IS NULL OR length(p_token) < 20 THEN RAISE EXCEPTION 'invalid_token'; END IF;
    s := s || jsonb_build_object('phase','processing','version',1,'token',p_token,
      'lease_until',now()+interval '6 minutes','error_code',null);
  ELSE
    IF s->>'token' IS DISTINCT FROM p_token OR p_token IS NULL
      OR (s->>'lease_until')::timestamptz <= now() THEN RAISE EXCEPTION 'stale_worker'; END IF;
    IF p_operation = 'checkpoint' THEN
      -- Only these two fields may be supplied; never overwrite locks or statuses.
      IF p_data ? 'result' THEN s := s || jsonb_build_object('result',p_data->'result'); END IF;
      IF p_data ? 'pipeline' THEN s := s || jsonb_build_object('pipeline',p_data->'pipeline'); END IF;
    ELSIF p_operation = 'publish' THEN
      IF jsonb_typeof(p_data->'cards') IS DISTINCT FROM 'array'
        OR jsonb_array_length(p_data->'cards') > 40 THEN RAISE EXCEPTION 'invalid_cards'; END IF;
      IF (SELECT count(*) FROM jsonb_array_elements(p_data->'cards') c WHERE c->>'approval_type'='meeting_summary') <> 1
        THEN RAISE EXCEPTION 'missing_summary'; END IF;
      FOR card IN SELECT * FROM jsonb_array_elements(p_data->'cards') LOOP
        IF card->>'approval_type' NOT IN ('meeting_summary','meeting_followup','create_quote_draft','customer_fact')
          OR card->>'approval_type' IS NULL OR card->>'id' IS NULL
          OR card->'payload'->>'recording_id' IS DISTINCT FROM p_recording_id THEN RAISE EXCEPTION 'invalid_card'; END IF;
        IF EXISTS (SELECT 1 FROM public.pending_approvals a WHERE a.id=card->>'id'
          AND (a.business_id<>p_business_id OR a.payload->>'recording_id' IS DISTINCT FROM p_recording_id
            OR a.approval_type IS DISTINCT FROM card->>'approval_type')) THEN RAISE EXCEPTION 'card_collision'; END IF;
        INSERT INTO public.pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,
          expires_at,routed_agent,routing_role,routed_business_user_id)
        VALUES(card->>'id',p_business_id,card->>'approval_type',card->>'title',card->>'description',card->'payload',
          'pending',COALESCE(card->>'risk_level','high'),now()+interval '7 days',
          card->'payload'->>'routed_agent','owner_admin',card->>'routed_business_user_id')
        ON CONFLICT (id) DO NOTHING;
        GET DIAGNOSTICS added = ROW_COUNT;
        n := n + added;
      END LOOP;
      -- Only amend the informational summary of a still-pending batch, never a
      -- proposal/execution result that a person already reviewed.
      UPDATE public.pending_approvals a SET payload = a.payload || jsonb_build_object(
        'pipeline_action',s->'pipeline'->>'action', 'lead_id',s->'pipeline'->>'leadId',
        'deal_id',s->'pipeline'->>'dealId', 'analysis_partial',COALESCE((p_data->>'pipeline_failed')::boolean,false),
        'forslag',(SELECT count(*) FROM public.pending_approvals b WHERE b.business_id=p_business_id
          AND b.payload->>'recording_id'=p_recording_id AND b.approval_type<>'meeting_summary'))
      WHERE a.business_id=p_business_id AND a.payload->>'recording_id'=p_recording_id
        AND a.approval_type='meeting_summary' AND a.status='pending';
      next_phase := CASE WHEN COALESCE((p_data->>'pipeline_failed')::boolean,false) THEN 'partial' ELSE 'complete' END;
      s := s || jsonb_build_object('phase',next_phase,'finished_at',now(),
        'error_code',CASE WHEN next_phase='partial' THEN 'pipeline_failed' ELSE NULL END);
      UPDATE public.call_recording SET transcript_summary=s->'result'->>'summary', analyzed_at=now()
        WHERE recording_id=p_recording_id AND business_id=p_business_id;
    ELSIF p_operation = 'notify' THEN
      IF s->>'phase' NOT IN ('complete','partial') THEN RAISE EXCEPTION 'not_published'; END IF;
      IF s ? 'notified_at' THEN RETURN jsonb_build_object('claimed',false); END IF;
      -- At-most-once attempt; this is NOT a claim of delivery.
      s := s || jsonb_build_object('notified_at',now());
    ELSIF p_operation = 'release' THEN
      s := (s - 'token' - 'lease_until') || jsonb_build_object('error_code',p_data->>'error_code');
      IF p_data ? 'error_code' THEN s := s || jsonb_build_object('phase','failed'); END IF;
    ELSE RAISE EXCEPTION 'invalid_operation'; END IF;
  END IF;
  UPDATE public.call_recording SET call_processing=s WHERE recording_id=p_recording_id AND business_id=p_business_id;
  RETURN jsonb_build_object('status',CASE WHEN p_operation='claim' THEN 'claimed' ELSE s->>'phase' END,
    'state',s,'cards_created',n,'claimed',true);
END $$;
REVOKE ALL ON FUNCTION public.manage_call_processing(text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_call_processing(text,text,text,text,jsonb) TO service_role;

-- Gallringsaktivering per företag + granskningsreferenser hålls i befintlig
-- business_preferences, key='call_retention_policy'. Ingen default innebär ja.
-- Funktionen är bara lokal rådatagallring; påstår ALDRIG leverantörsradering.
CREATE OR REPLACE FUNCTION public.purge_call_raw_data(p_business_id text, p_recording_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.call_recording%ROWTYPE; policy jsonb;
BEGIN
  SELECT value::jsonb INTO policy FROM public.business_preferences
    WHERE business_id=p_business_id AND key='call_retention_policy';
  IF policy->>'enabled' IS DISTINCT FROM 'true'
    OR COALESCE(policy->>'legal_review_ref','')=''
    OR COALESCE(policy->>'provider_deletion_ref','')=''
    OR policy->>'transcript_days' IS DISTINCT FROM '30' THEN RAISE EXCEPTION 'retention_not_approved'; END IF;
  SELECT * INTO r FROM public.call_recording
    WHERE business_id=p_business_id AND recording_id=p_recording_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recording_not_found'; END IF;
  IF r.raw_deleted_at IS NOT NULL THEN RETURN false; END IF;
  IF r.source IS DISTINCT FROM 'phone' OR r.created_at > now()-interval '30 days'
    OR (r.call_processing->>'lease_until')::timestamptz > now() THEN RETURN false; END IF;
  -- Raw transcript has multiple historical aliases. Clear ALL of them plus
  -- cached extraction/analysis, not just the field read by the current UI.
  UPDATE public.call_recording SET transcript=NULL,transcript_text=NULL,transcript_segments=NULL,
    transcript_summary=NULL,ai_analysis=NULL,recording_url=NULL,auto_actions_taken=NULL,
    call_processing=jsonb_build_object('phase','expired','version',1,'purged_at',now()),raw_deleted_at=now()
    WHERE business_id=p_business_id AND recording_id=p_recording_id;
  -- Unreviewed suggestions expire; never leave full source text in old cards.
  -- Confirmed business facts/documents are separate records/purposes and remain.
  UPDATE public.pending_approvals SET
    title='Förslag från gallrat samtal',
    description=NULL,
    payload=jsonb_strip_nulls(jsonb_build_object('recording_id',p_recording_id,'source_expired',true,
      'customer_id',payload->'customer_id','project_id',payload->'project_id','routed_agent',payload->'routed_agent',
      'execution_result',CASE WHEN payload ? 'execution_result' THEN jsonb_build_object(
        'outcome',payload->'execution_result'->'outcome','executed_at',payload->'execution_result'->'executed_at',
        'artifacts',payload->'execution_result'->'artifacts') ELSE NULL END)),
    status=CASE WHEN status='pending' THEN 'expired' ELSE status END
    WHERE business_id=p_business_id AND payload->>'recording_id'=p_recording_id;
  UPDATE public.ai_suggestion SET title='Förslag från gallrat samtal',source_text=NULL,description=NULL,suggested_data='{}'::jsonb,
    status=CASE WHEN status='pending' THEN 'rejected' ELSE status END
    WHERE recording_id=p_recording_id AND business_id=p_business_id;
  INSERT INTO public.call_retention_audit(business_id,recording_id,operation,legal_review_ref,provider_deletion_ref)
    VALUES(p_business_id,p_recording_id,'raw_purged',policy->>'legal_review_ref',policy->>'provider_deletion_ref');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.purge_call_raw_data(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_call_raw_data(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_call_audio_pointer(p_business_id text,p_recording_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy jsonb; n integer;
BEGIN
  SELECT value::jsonb INTO policy FROM public.business_preferences WHERE business_id=p_business_id AND key='call_retention_policy';
  IF policy->>'enabled' IS DISTINCT FROM 'true' OR COALESCE(policy->>'legal_review_ref','')=''
    OR COALESCE(policy->>'provider_deletion_ref','')='' OR policy->>'transcript_days' IS DISTINCT FROM '30'
    THEN RAISE EXCEPTION 'retention_not_approved'; END IF;
  UPDATE public.call_recording SET recording_url=NULL
    WHERE business_id=p_business_id AND recording_id=p_recording_id AND source='phone'
      AND transcribed_at IS NOT NULL AND transcript IS NOT NULL AND recording_url IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    INSERT INTO public.call_retention_audit(business_id,recording_id,operation,legal_review_ref,provider_deletion_ref)
      VALUES(p_business_id,p_recording_id,'audio_pointer_cleared',policy->>'legal_review_ref',policy->>'provider_deletion_ref');
  END IF;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.clear_call_audio_pointer(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_call_audio_pointer(text,text) TO service_role;

COMMIT;
