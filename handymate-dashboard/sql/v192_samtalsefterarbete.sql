-- v192 — Samtalsefterarbete V2: nya korttyper ur samtal + utgående samtal via Handymate.
-- MANUELL migration (MCP efter "kör"). Innehåller en UPDATE (direction-normalisering).
--
-- Del 1: manage_call_processing — VERBATIM kopia av v180 rad 65-152. Enda
--        funktionella ändringen är publish-vitlistan (raden "NOT IN (...)"): kort av
--        typerna create_ata_draft (ÄTA-utkast ur samtal, Daniel) och project_log_note
--        (dagboksrad via godkännande, Matte) får publiceras i samma batch.
--        Utan detta kastar RPC:n 'invalid_card' för HELA batchen — därför måste den
--        här migrationen köras FÖRE koden som producerar korten deployas.
-- Del 2: call_recording får deal_id / initiated_by_user_id / call_status för
--        "Ring via Handymate" (utgående samtal där kund, deal och uppringare är
--        kända redan när raden skapas) + index på elks_recording_id som
--        recording-webhooken slår upp på.
-- Del 3: incoming-routen sparade 46elks råvärde 'incoming' i direction medan
--        analysen jämför mot 'inbound'. Normaliseras här; koden skriver nu literal.
BEGIN;

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
        IF card->>'approval_type' NOT IN ('meeting_summary','meeting_followup','create_quote_draft','customer_fact','create_ata_draft','project_log_note')
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

ALTER TABLE public.call_recording
  ADD COLUMN IF NOT EXISTS deal_id text,
  ADD COLUMN IF NOT EXISTS initiated_by_user_id text,
  -- 'initiated' | 'answered' | 'connected' | 'no_answer' | 'busy' | 'failed' | 'craftsman_no_answer'
  ADD COLUMN IF NOT EXISTS call_status text;
CREATE INDEX IF NOT EXISTS idx_call_recording_elks_id ON public.call_recording (elks_recording_id);
CREATE INDEX IF NOT EXISTS idx_call_recording_deal ON public.call_recording (deal_id) WHERE deal_id IS NOT NULL;

UPDATE public.call_recording SET direction = 'inbound' WHERE direction = 'incoming';

COMMIT;

-- Verifiering (kör direkt efteråt):
--   SELECT pg_get_functiondef('public.manage_call_processing(text,text,text,text,jsonb)'::regprocedure)
--            LIKE '%''project_log_note''%' AS whitelist_ok,
--          (SELECT prosecdef FROM pg_proc WHERE proname='manage_call_processing') AS security_definer_ok,
--          (SELECT count(*) FROM public.call_recording WHERE direction='incoming') AS incoming_left,   -- 0
--          (SELECT count(*) FROM information_schema.columns WHERE table_name='call_recording'
--             AND column_name IN ('deal_id','initiated_by_user_id','call_status')) AS new_columns;      -- 3
