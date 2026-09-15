-- v249_outbound_intents.sql — H3b durable outbound promises.
-- Draft by Claude for review before Codex implements. Requires v246 (H3a channel notices) and v248 (H1/H2).
-- Lock order: 'autonomy:<business>' may take 'outbound:<business>', never the reverse.
-- This never takes financial_lock: an SMS must not serialise against invoice work.
BEGIN;

CREATE TABLE public.outbound_intents (
  id                  TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id         TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  kind                TEXT        NOT NULL CHECK (kind IN ('sms','email','push')),
  source              TEXT        NOT NULL CHECK (source IN ('approval','automation_log','autonomy','cron','manual')),
  source_id           TEXT        NOT NULL,
  -- The producer composes it, e.g. 'reminder:<invoice>:3'. One promise per key, forever.
  dedupe_key          TEXT        NOT NULL,
  -- Address or E.164 only. The message body is never stored here; the source row owns it.
  recipient           TEXT        NOT NULL,
  template            TEXT        NOT NULL,
  autonomy_key        TEXT        NULL CHECK (autonomy_key IS NULL OR autonomy_key IN ('invoice_reminder','booking_reminder','quote_followup_sms','review_request')),
  status              TEXT        NOT NULL CHECK (status IN ('pending','attempting','sent','failed','skipped','unknown')),
  attempts            INT         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  attempt_token       TEXT        NULL,
  claimed_at          TIMESTAMPTZ NULL,
  finished_at         TIMESTAMPTZ NULL,
  -- Pre-flight defer and failure backoff share one field; the sweeper honours it.
  not_before          TIMESTAMPTZ NULL,
  defer_reason        TEXT        NULL CHECK (defer_reason IS NULL OR defer_reason IN ('saldo','konfiguration','mottagare','kontrollfel')),
  -- Set when off arrived while the provider call was already in flight. Never a second send.
  cancel_requested_at TIMESTAMPTZ NULL,
  last_error          TEXT        NULL,
  provider_ref        TEXT        NULL,
  context             JSONB       NULL,
  resolution          JSONB       NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, dedupe_key),
  CHECK (NOT (status = 'pending' AND attempt_token IS NOT NULL)),
  CHECK (status <> 'attempting' OR (claimed_at IS NOT NULL AND attempt_token IS NOT NULL)),
  CHECK ((status IN ('sent','failed','skipped','unknown')) = (finished_at IS NOT NULL))
);
CREATE INDEX outbound_intents_open ON public.outbound_intents (business_id, kind, created_at)
  WHERE status IN ('pending','attempting','failed');
CREATE INDEX outbound_intents_due ON public.outbound_intents (not_before NULLS FIRST, created_at)
  WHERE status IN ('pending','failed','attempting');
CREATE INDEX outbound_intents_unknown ON public.outbound_intents (business_id, finished_at) WHERE status = 'unknown';
CREATE INDEX outbound_intents_source ON public.outbound_intents (business_id, source, source_id);

CREATE FUNCTION public.outbound_lock(p_business_id TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF nullif(btrim(p_business_id),'') IS NULL THEN RAISE EXCEPTION 'outbound_business_required' USING ERRCODE='check_violation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('outbound:'||p_business_id,0));
END $fn$;

-- Authoritative grant read. A key with no control row falls back to the legacy JSON, like isAutonomous does.
CREATE FUNCTION public.outbound_autonomy_granted(p_business_id TEXT, p_key TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE g BOOLEAN;
BEGIN
  IF p_key IS NULL THEN RETURN TRUE; END IF;
  SELECT granted INTO g FROM public.autonomy_controls WHERE business_id=p_business_id AND key=p_key;
  IF FOUND THEN RETURN g; END IF;
  RETURN EXISTS (SELECT 1 FROM public.v3_automation_settings
    WHERE business_id=p_business_id AND earned_autonomy->p_key->>'status'='autonomous');
END $fn$;

-- ── Producer. Idempotent per dedupe_key; a revoked key never gets a promise. ──
CREATE FUNCTION public.record_outbound_intent(
  p_business_id TEXT, p_kind TEXT, p_source TEXT, p_source_id TEXT, p_dedupe_key TEXT,
  p_recipient TEXT, p_template TEXT, p_autonomy_key TEXT, p_context JSONB, p_defer_reason TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE i public.outbound_intents%ROWTYPE; v_id TEXT;
BEGIN
  PERFORM public.outbound_lock(p_business_id);
  IF nullif(btrim(p_dedupe_key),'') IS NULL OR nullif(btrim(p_recipient),'') IS NULL OR nullif(btrim(p_template),'') IS NULL THEN
    RAISE EXCEPTION 'outbound_intent_fields_required' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO i FROM public.outbound_intents x WHERE x.business_id=p_business_id AND x.dedupe_key=p_dedupe_key;
  IF FOUND THEN
    IF (i.kind,i.source,i.source_id,i.recipient,i.template,i.autonomy_key,i.context)
      IS DISTINCT FROM (p_kind,p_source,p_source_id,p_recipient,p_template,p_autonomy_key,p_context) THEN
      RAISE EXCEPTION 'outbound_dedupe_conflict' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object('id',i.id,'status',i.status,'created',false);
  END IF;
  IF NOT public.outbound_autonomy_granted(p_business_id, p_autonomy_key) THEN
    RETURN jsonb_build_object('created',false,'blocked',true,'reason','autonomy_revoked');
  END IF;
  INSERT INTO public.outbound_intents (business_id,kind,source,source_id,dedupe_key,recipient,template,autonomy_key,status,context,
      not_before,defer_reason,last_error)
    VALUES (p_business_id,p_kind,p_source,p_source_id,p_dedupe_key,p_recipient,p_template,p_autonomy_key,'pending',p_context,
      CASE WHEN p_defer_reason IS NOT NULL THEN clock_timestamp()+interval '10 minutes' END, p_defer_reason,
      CASE WHEN p_defer_reason IS NOT NULL THEN 'kanalen var pausad: '||p_defer_reason END)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'status','pending','created',true,'deferred',p_defer_reason IS NOT NULL);
END $fn$;

-- Preflight may fail on any attempt, including a sweep after recovery. It is
-- not a provider failure and must not consume the three provider attempts.
CREATE FUNCTION public.defer_outbound_intent(p_business_id TEXT, p_id TEXT, p_attempt_token TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE i public.outbound_intents%ROWTYPE;
BEGIN
  PERFORM public.outbound_lock(p_business_id);
  IF p_reason IS NULL OR p_reason NOT IN ('saldo','konfiguration','mottagare','kontrollfel') THEN
    RAISE EXCEPTION 'outbound_defer_reason_invalid' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO i FROM public.outbound_intents WHERE business_id=p_business_id AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbound_intent_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  IF p_attempt_token IS NULL THEN
    IF i.status <> 'pending' THEN RETURN jsonb_build_object('deferred',false,'status',i.status); END IF;
  ELSIF i.status<>'attempting' OR i.attempt_token IS DISTINCT FROM p_attempt_token THEN
    RAISE EXCEPTION 'outbound_attempt_stale' USING ERRCODE='check_violation';
  END IF;
  IF i.cancel_requested_at IS NOT NULL OR NOT public.outbound_autonomy_granted(p_business_id,i.autonomy_key) THEN
    UPDATE public.outbound_intents SET status='skipped',finished_at=clock_timestamp()
      WHERE business_id=p_business_id AND id=p_id;
    RETURN jsonb_build_object('deferred',false,'status','skipped');
  END IF;
  UPDATE public.outbound_intents SET status='pending',attempt_token=NULL,claimed_at=NULL,finished_at=NULL,
    attempts=attempts-CASE WHEN i.status='attempting' THEN 1 ELSE 0 END,
    defer_reason=p_reason,not_before=clock_timestamp()+interval '10 minutes'
    WHERE business_id=p_business_id AND id=p_id;
  RETURN jsonb_build_object('deferred',true,'status','pending');
END $fn$;

-- ── Claim. p_ids = the synchronous path (send now); NULL = the sweeper's turn for this business. ──
CREATE FUNCTION public.claim_outbound_intents(
  p_business_id TEXT, p_ids TEXT[], p_max_attempts INT, p_stale_minutes INT, p_limit INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_unknown JSONB; v_cancelled JSONB; v_claimed JSONB;
BEGIN
  PERFORM public.outbound_lock(p_business_id);
  IF p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 OR p_stale_minutes IS NULL OR p_stale_minutes NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'outbound_claim_limits_invalid' USING ERRCODE='check_violation';
  END IF;
  -- An attempt that never finished may already have reached the customer. Never retried automatically.
  WITH expired AS (
    UPDATE public.outbound_intents SET status='unknown', finished_at=clock_timestamp(),
        last_error='försöket avslutades aldrig inom '||p_stale_minutes||' min; leveransen är okänd och kräver en människa'
      WHERE business_id=p_business_id AND status='attempting'
        AND claimed_at < clock_timestamp()-make_interval(mins=>p_stale_minutes)
        AND (p_ids IS NULL OR id = ANY(p_ids)) RETURNING id)
  SELECT COALESCE(jsonb_agg(id),'[]'::jsonb) INTO v_unknown FROM expired;
  -- Off wins over anything not yet handed to a provider, at claim time too.
  WITH cancelled AS (
    UPDATE public.outbound_intents SET status='skipped', finished_at=clock_timestamp(),
        last_error=COALESCE(last_error,'självständiga utskick är avstängda')
      WHERE business_id=p_business_id AND status IN ('pending','failed')
        AND autonomy_key IS NOT NULL AND NOT public.outbound_autonomy_granted(p_business_id,autonomy_key)
        AND (p_ids IS NULL OR id = ANY(p_ids)) RETURNING id)
  SELECT COALESCE(jsonb_agg(id),'[]'::jsonb) INTO v_cancelled FROM cancelled;
  WITH due AS (
    SELECT id FROM public.outbound_intents
      WHERE business_id=p_business_id
        AND (status='pending' OR (status='failed' AND attempts < p_max_attempts))
        AND (not_before IS NULL OR not_before <= clock_timestamp())
        AND (p_ids IS NULL OR id = ANY(p_ids))
      ORDER BY created_at, id LIMIT LEAST(GREATEST(COALESCE(p_limit,25),1),200)),
  c AS (
    UPDATE public.outbound_intents SET status='attempting', attempts=attempts+1, attempt_token=gen_random_uuid()::TEXT,
        claimed_at=clock_timestamp(), finished_at=NULL, not_before=NULL, defer_reason=NULL
      WHERE business_id=p_business_id AND id IN (SELECT id FROM due)
      RETURNING id,kind,source,source_id,recipient,template,autonomy_key,attempts,attempt_token,context)
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb) INTO v_claimed FROM c;
  RETURN jsonb_build_object('claimed',v_claimed,'unknown_ids',v_unknown,'cancelled_ids',v_cancelled);
END $fn$;

-- ── Finish. Token-fenced and terminal; a lost acknowledgement becomes 'unknown' at the next claim, never a second send. ──
CREATE FUNCTION public.finish_outbound_intent(
  p_business_id TEXT, p_id TEXT, p_attempt_token TEXT, p_status TEXT, p_provider_ref TEXT, p_error TEXT, p_max_attempts INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE i public.outbound_intents%ROWTYPE;
BEGIN
  PERFORM public.outbound_lock(p_business_id);
  IF p_status NOT IN ('sent','failed','skipped') THEN RAISE EXCEPTION 'outbound_status_invalid' USING ERRCODE='check_violation'; END IF;
  IF nullif(btrim(p_attempt_token),'') IS NULL THEN RAISE EXCEPTION 'outbound_attempt_token_required' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO i FROM public.outbound_intents x WHERE x.business_id=p_business_id AND x.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbound_intent_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  IF i.attempt_token IS DISTINCT FROM p_attempt_token THEN RAISE EXCEPTION 'outbound_attempt_stale' USING ERRCODE='check_violation', DETAIL=i.status; END IF;
  IF i.status IN ('sent','failed','skipped') THEN
    IF i.status=p_status THEN RETURN jsonb_build_object('id',i.id,'status',i.status,'idempotent',true); END IF;
    RAISE EXCEPTION 'outbound_attempt_finished' USING ERRCODE='check_violation', DETAIL=i.status;
  END IF;
  IF i.status='unknown' THEN RAISE EXCEPTION 'outbound_attempt_unknown_needs_human' USING ERRCODE='check_violation'; END IF;
  UPDATE public.outbound_intents SET status=p_status, finished_at=clock_timestamp(), provider_ref=p_provider_ref, last_error=p_error,
      not_before=CASE WHEN p_status='failed' AND i.attempts < p_max_attempts THEN clock_timestamp()+make_interval(mins=>10*i.attempts) END
    WHERE business_id=p_business_id AND id=p_id;
  RETURN jsonb_build_object('id',i.id,'status',p_status,'attempt',i.attempts,'idempotent',false,
    'cancel_requested',i.cancel_requested_at IS NOT NULL);
END $fn$;

-- ── Cancel. Called from stop_supervised_autonomy inside the autonomy lock. ──
CREATE FUNCTION public.cancel_outbound_intents(p_business_id TEXT, p_autonomy_key TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_skipped INT; v_inflight INT;
BEGIN
  PERFORM public.outbound_lock(p_business_id);
  WITH s AS (UPDATE public.outbound_intents SET status='skipped', finished_at=clock_timestamp(),
      last_error=COALESCE(nullif(btrim(p_reason),''),'självständiga utskick är avstängda')
    WHERE business_id=p_business_id AND autonomy_key=p_autonomy_key AND status IN ('pending','failed') RETURNING id)
  SELECT count(*) INTO v_skipped FROM s;
  -- A provider request already in flight cannot be recalled; mark it so the receipt can say so.
  WITH f AS (UPDATE public.outbound_intents SET cancel_requested_at=clock_timestamp()
    WHERE business_id=p_business_id AND autonomy_key=p_autonomy_key AND status='attempting' AND cancel_requested_at IS NULL RETURNING id)
  SELECT count(*) INTO v_inflight FROM f;
  RETURN jsonb_build_object('cancelled',v_skipped,'in_flight',v_inflight);
END $fn$;

-- ── H2 invariant 4 closed: off revokes AND cancels in one transaction. Replaces the v248 body. ──
CREATE OR REPLACE FUNCTION public.stop_supervised_autonomy(p_business_id TEXT, p_key TEXT, p_source TEXT DEFAULT 'customer')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF p_key<>ALL(ARRAY['invoice_reminder','booking_reminder','quote_followup_sms','review_request']) OR p_key IS NULL
     OR p_source<>ALL(ARRAY['customer','failure']) THEN RAISE EXCEPTION 'invalid_autonomy_key'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('autonomy:'||p_business_id,0));
  INSERT INTO public.autonomy_controls(business_id,key,granted,mode,source,cooldown_until)
    VALUES (p_business_id,p_key,false,'supervised',p_source,now()+interval '30 days')
    ON CONFLICT (business_id,key) DO UPDATE SET granted=false,source=EXCLUDED.source,updated_at=now(),cooldown_until=EXCLUDED.cooldown_until;
  UPDATE public.v3_automation_settings SET earned_autonomy=coalesce(earned_autonomy,'{}'::jsonb)-p_key WHERE business_id=p_business_id;
  -- Lock order: autonomy then outbound. Same transaction, so off is never on without the queue being cleared.
  PERFORM public.cancel_outbound_intents(p_business_id,p_key,'du stängde av '||p_key);
END $fn$;

-- ── The sweeper's work list, across all businesses. Not kernel-scoped. ──
CREATE FUNCTION public.list_owed_outbound_intents(p_max_attempts INT, p_stale_minutes INT, p_limit INT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('business_id',x.business_id,'owed',x.owed,'stale',x.stale) ORDER BY x.oldest),'[]'::jsonb)
  FROM (
    SELECT i.business_id,
           count(*) FILTER (WHERE (i.status='pending' OR (i.status='failed' AND i.attempts < p_max_attempts))
                              AND (i.not_before IS NULL OR i.not_before <= clock_timestamp())) AS owed,
           count(*) FILTER (WHERE i.status='attempting' AND i.claimed_at < clock_timestamp()-make_interval(mins=>p_stale_minutes)) AS stale,
           min(i.created_at) AS oldest
      FROM public.outbound_intents i
     WHERE i.status IN ('pending','failed','attempting')
     GROUP BY i.business_id
    HAVING count(*) FILTER (WHERE ((i.status='pending' OR (i.status='failed' AND i.attempts < p_max_attempts))
                                     AND (i.not_before IS NULL OR i.not_before <= clock_timestamp()))
                              OR (i.status='attempting' AND i.claimed_at < clock_timestamp()-make_interval(mins=>p_stale_minutes))) > 0
     ORDER BY min(i.created_at), i.business_id
     LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),500)
  ) x
$fn$;

-- ── A human resolves an unknown or exhausted promise. Actor and reason are mandatory and persisted. ──
CREATE FUNCTION public.resolve_outbound_intent(
  p_business_id TEXT, p_id TEXT, p_resolution TEXT, p_actor_id TEXT, p_reason TEXT, p_max_attempts INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE i public.outbound_intents%ROWTYPE; v_status TEXT;
BEGIN
  PERFORM public.outbound_lock(p_business_id);
  IF p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'outbound_claim_limits_invalid' USING ERRCODE='check_violation'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('delivered','abandon','retry') THEN RAISE EXCEPTION 'outbound_resolution_invalid' USING ERRCODE='check_violation'; END IF;
  IF nullif(btrim(p_actor_id),'') IS NULL OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'outbound_resolution_requires_actor_and_reason' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO i FROM public.outbound_intents x WHERE x.business_id=p_business_id AND x.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbound_intent_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  IF NOT (i.status='unknown' OR (i.status='failed' AND i.attempts >= p_max_attempts)) THEN
    RAISE EXCEPTION 'outbound_intent_not_resolvable' USING ERRCODE='check_violation', DETAIL=i.status;
  END IF;
  -- Retrying a promise whose key was switched off would resurrect a cancelled send.
  IF p_resolution='retry' AND NOT public.outbound_autonomy_granted(p_business_id,i.autonomy_key) THEN
    RAISE EXCEPTION 'outbound_intent_autonomy_revoked' USING ERRCODE='check_violation';
  END IF;
  v_status := CASE p_resolution WHEN 'delivered' THEN 'sent' WHEN 'abandon' THEN 'skipped' ELSE 'pending' END;
  UPDATE public.outbound_intents SET status=v_status,
      finished_at=CASE WHEN v_status='pending' THEN NULL ELSE clock_timestamp() END,
      attempt_token=CASE WHEN v_status='pending' THEN NULL ELSE attempt_token END,
      claimed_at=CASE WHEN v_status='pending' THEN NULL ELSE claimed_at END,
      attempts=CASE WHEN v_status='pending' THEN 0 ELSE attempts END,
      not_before=NULL,
      resolution=COALESCE(resolution,'[]'::jsonb)||jsonb_build_object('at',clock_timestamp(),'by',p_actor_id,'from',i.status,'to',v_status,'reason',p_reason)
    WHERE business_id=p_business_id AND id=p_id;
  RETURN jsonb_build_object('id',i.id,'from',i.status,'to',v_status);
END $fn$;

CREATE FUNCTION public.list_unresolved_outbound_intents(p_business_id TEXT, p_max_attempts INT, p_limit INT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'source',i.source,'source_id',i.source_id,
           'template',i.template,'autonomy_key',i.autonomy_key,'status',i.status,'attempts',i.attempts,
           'claimed_at',i.claimed_at,'finished_at',i.finished_at,'last_error',i.last_error,'provider_ref',i.provider_ref,
           'cancel_requested_at',i.cancel_requested_at,'resolution',i.resolution) ORDER BY i.finished_at NULLS LAST, i.created_at),'[]'::jsonb)
  FROM (SELECT * FROM public.outbound_intents i WHERE i.business_id=p_business_id
          AND (i.status='unknown' OR (i.status='failed' AND i.attempts >= p_max_attempts))
        ORDER BY i.finished_at NULLS LAST, i.created_at LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),500)) i
$fn$;

-- ── What the customer sees: the latest promise per kind for one source row. Text belongs in TypeScript. ──
CREATE FUNCTION public.read_outbound_status(p_business_id TEXT, p_source TEXT, p_source_id TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',x.kind,'status',x.status,'defer_reason',x.defer_reason,
           'attempts',x.attempts,'finished_at',x.finished_at,'cancel_requested',x.cancel_requested_at IS NOT NULL) ORDER BY x.kind),'[]'::jsonb)
  FROM (SELECT DISTINCT ON (kind) kind,status,defer_reason,attempts,finished_at,cancel_requested_at
          FROM public.outbound_intents WHERE business_id=p_business_id AND source=p_source AND source_id=p_source_id
         ORDER BY kind, created_at DESC) x
$fn$;

ALTER TABLE public.outbound_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_intents FROM PUBLIC, anon, authenticated, service_role;
-- SELECT and DELETE only: every write goes through the RPCs; DELETE serves account erasure.
GRANT SELECT, DELETE ON public.outbound_intents TO service_role;
DO $g$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname = ANY(ARRAY[
      'outbound_lock','outbound_autonomy_granted','record_outbound_intent','defer_outbound_intent','claim_outbound_intents','finish_outbound_intent',
      'cancel_outbound_intents','list_owed_outbound_intents','resolve_outbound_intent','list_unresolved_outbound_intents','read_outbound_status']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $g$;
REVOKE ALL ON FUNCTION public.outbound_lock(TEXT) FROM service_role;

COMMIT;
