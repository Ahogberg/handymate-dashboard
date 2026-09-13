BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_event_consumers (
  business_id       TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  consumer          TEXT        NOT NULL CHECK (consumer ~ '^[a-z][a-z0-9_-]{2,63}$'),
  last_seq          BIGINT      NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  lease_token       TEXT        NULL,
  lease_expires_at  TIMESTAMPTZ NULL,
  halted_at         TIMESTAMPTZ NULL,
  halted_event_id   TEXT        NULL,
  halted_reason     TEXT        NULL,
  PRIMARY KEY (business_id, consumer),
  FOREIGN KEY (business_id, halted_event_id) REFERENCES public.financial_events(business_id, id),
  CHECK ((halted_at IS NULL) = (halted_event_id IS NULL)),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);

CREATE TABLE IF NOT EXISTS public.financial_event_deliveries (
  business_id       TEXT        NOT NULL,
  consumer          TEXT        NOT NULL,
  event_id          TEXT        NOT NULL,
  attempts          INTEGER     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  failures          INTEGER     NOT NULL DEFAULT 0 CHECK (failures >= 0),
  attempt_token     TEXT        NULL,
  first_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  delivered_at      TIMESTAMPTZ NULL,
  last_error        TEXT        NULL,
  PRIMARY KEY (business_id, consumer, event_id),
  FOREIGN KEY (business_id, consumer) REFERENCES public.financial_event_consumers(business_id, consumer),
  FOREIGN KEY (business_id, event_id) REFERENCES public.financial_events(business_id, id)
);

ALTER TABLE public.financial_event_consumers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_event_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_event_consumers, public.financial_event_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.financial_event_consumers, public.financial_event_deliveries TO service_role;

-- Observability: backlog and halts per (business, consumer). Read by ops tooling as service_role.
CREATE OR REPLACE VIEW public.financial_consumer_status AS
  SELECT c.business_id, c.consumer, c.last_seq,
         (SELECT count(*) FROM public.financial_events e WHERE e.business_id = c.business_id AND e.seq > c.last_seq) AS backlog,
         c.lease_expires_at IS NOT NULL AND c.lease_expires_at > clock_timestamp() AS lease_active,
         c.lease_expires_at, c.halted_at, c.halted_event_id, c.halted_reason, c.updated_at
    FROM public.financial_event_consumers c;
REVOKE ALL ON public.financial_consumer_status FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.financial_consumer_status TO service_role;

-- Claim = take a lease on the cursor and return the next batch. The lease, not a row lock,
-- is what excludes other workers, because it survives the end of this call.
CREATE OR REPLACE FUNCTION public.claim_financial_events(
  p_business_id TEXT, p_consumer TEXT, p_limit INTEGER, p_lease_seconds INTEGER
) RETURNS TABLE (
  lease_token TEXT,
  id TEXT, seq TEXT, business_id TEXT, schema_version INTEGER, event_type TEXT,
  occurred_at TIMESTAMPTZ, effective_date DATE, source_type TEXT, source_id TEXT,
  correlation_id TEXT, causation_id TEXT, idempotency_key TEXT,
  currency TEXT, amount_minor TEXT, payload JSONB, actor_type TEXT, actor_id TEXT, created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE cursor_row public.financial_event_consumers%ROWTYPE; v_token TEXT; v_count INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'financial_consumer_bad_limit' USING ERRCODE = 'check_violation';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'financial_consumer_bad_lease' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.financial_event_consumers (business_id, consumer)
    VALUES (p_business_id, p_consumer) ON CONFLICT DO NOTHING;
  -- Short row lock only to serialise concurrent claim calls; released at return by design.
  SELECT * INTO cursor_row FROM public.financial_event_consumers c
    WHERE c.business_id = p_business_id AND c.consumer = p_consumer FOR UPDATE;
  IF cursor_row.halted_at IS NOT NULL THEN RETURN; END IF;
  IF cursor_row.lease_expires_at IS NOT NULL AND cursor_row.lease_expires_at > clock_timestamp() THEN RETURN; END IF;

  SELECT count(*) INTO v_count FROM public.financial_events e
   WHERE e.business_id = p_business_id AND e.seq > cursor_row.last_seq;
  IF v_count = 0 THEN
    UPDATE public.financial_event_consumers c SET lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
     WHERE c.business_id = p_business_id AND c.consumer = p_consumer;
    RETURN;
  END IF;

  v_token := gen_random_uuid()::TEXT;
  -- Alias required: RETURNS TABLE declares business_id/consumer as OUT parameters.
  UPDATE public.financial_event_consumers c
     SET lease_token = v_token, lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), updated_at = clock_timestamp()
   WHERE c.business_id = p_business_id AND c.consumer = p_consumer;

  RETURN QUERY
    SELECT v_token, e.id, e.seq::text, e.business_id, e.schema_version, e.event_type, e.occurred_at, e.effective_date,
           e.source_type, e.source_id, e.correlation_id, e.causation_id, e.idempotency_key,
           e.currency, e.amount_minor::text, e.payload, e.actor_type, e.actor_id, e.created_at
      FROM public.financial_events e
     WHERE e.business_id = p_business_id AND e.seq > cursor_row.last_seq
     ORDER BY e.seq
     LIMIT p_limit;
END $fn$;

-- Shared guard: the caller must hold the live lease.
CREATE OR REPLACE FUNCTION public.assert_financial_consumer_lease(
  p_business_id TEXT, p_consumer TEXT, p_lease_token TEXT
) RETURNS public.financial_event_consumers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE cursor_row public.financial_event_consumers%ROWTYPE;
BEGIN
  SELECT * INTO cursor_row FROM public.financial_event_consumers c
   WHERE c.business_id = p_business_id AND c.consumer = p_consumer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_consumer_unknown' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF p_lease_token IS NULL OR cursor_row.lease_token IS DISTINCT FROM p_lease_token
     OR cursor_row.lease_expires_at IS NULL OR cursor_row.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'financial_consumer_lease_lost' USING ERRCODE = 'lock_not_available';
  END IF;
  RETURN cursor_row;
END $fn$;

-- Ack: strictly in order. The acked event must be the FIRST unacknowledged event of this
-- business; otherwise the call raises and nothing moves. Renews the lease.
CREATE OR REPLACE FUNCTION public.ack_financial_event(
  p_business_id TEXT, p_consumer TEXT, p_event_id TEXT, p_lease_token TEXT, p_lease_seconds INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE cursor_row public.financial_event_consumers%ROWTYPE; v_seq BIGINT;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'financial_consumer_bad_lease' USING ERRCODE = 'check_violation';
  END IF;
  cursor_row := public.assert_financial_consumer_lease(p_business_id, p_consumer, p_lease_token);
  SELECT e.seq INTO v_seq FROM public.financial_events e
   WHERE e.business_id = p_business_id AND e.id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_consumer_unknown_event' USING ERRCODE = 'foreign_key_violation'; END IF;

  IF v_seq <= cursor_row.last_seq THEN RETURN false; END IF;   -- redelivery, handled idempotently
  IF EXISTS (SELECT 1 FROM public.financial_events e
              WHERE e.business_id = p_business_id AND e.seq > cursor_row.last_seq AND e.seq < v_seq) THEN
    RAISE EXCEPTION 'financial_consumer_ack_out_of_order' USING ERRCODE = 'check_violation', DETAIL = p_event_id;
  END IF;
  PERFORM public.begin_financial_event_attempt(p_business_id, p_consumer, p_event_id, p_lease_token);
  UPDATE public.financial_event_deliveries SET delivered_at = COALESCE(delivered_at, clock_timestamp())
   WHERE business_id = p_business_id AND consumer = p_consumer AND event_id = p_event_id;
  UPDATE public.financial_event_consumers
     SET last_seq = v_seq, lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), updated_at = clock_timestamp()
   WHERE business_id = p_business_id AND consumer = p_consumer;
  RETURN true;
END $fn$;

-- Failure: count the attempt; at the threshold halt the consumer and drop the lease. Never advances.
CREATE OR REPLACE FUNCTION public.fail_financial_event(
  p_business_id TEXT, p_consumer TEXT, p_event_id TEXT, p_lease_token TEXT, p_error TEXT, p_max_attempts INTEGER
) RETURNS TABLE (attempts INTEGER, halted BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_attempts INTEGER; v_failures INTEGER;
BEGIN
  IF p_max_attempts IS NULL OR p_max_attempts < 1 THEN
    RAISE EXCEPTION 'financial_consumer_bad_attempt_limit' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public.assert_financial_consumer_lease(p_business_id, p_consumer, p_lease_token);
  PERFORM public.begin_financial_event_attempt(p_business_id, p_consumer, p_event_id, p_lease_token);
  UPDATE public.financial_event_deliveries d
     SET failures = d.failures + 1, last_error = left(p_error, 2000)
   WHERE d.business_id = p_business_id AND d.consumer = p_consumer AND d.event_id = p_event_id AND d.delivered_at IS NULL
   RETURNING d.attempts, d.failures INTO v_attempts, v_failures;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_consumer_already_delivered' USING ERRCODE = 'check_violation'; END IF;
  -- End this attempt even below the threshold: a repeated failure RPC cannot count twice.
  UPDATE public.financial_event_consumers SET lease_token = NULL, lease_expires_at = NULL
   WHERE business_id = p_business_id AND consumer = p_consumer;
  IF v_failures >= p_max_attempts THEN
    UPDATE public.financial_event_consumers
       SET halted_at = clock_timestamp(), halted_event_id = p_event_id, halted_reason = left(p_error, 2000),
           lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
     WHERE business_id = p_business_id AND consumer = p_consumer AND halted_at IS NULL;
    attempts := v_attempts; halted := true; RETURN NEXT; RETURN;
  END IF;
  attempts := v_attempts; halted := false; RETURN NEXT;
END $fn$;

-- Release: end of batch. Idempotent; a lost lease releases nothing and returns false.
CREATE OR REPLACE FUNCTION public.release_financial_consumer_lease(
  p_business_id TEXT, p_consumer TEXT, p_lease_token TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.financial_event_consumers
     SET lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
   WHERE business_id = p_business_id AND consumer = p_consumer AND lease_token = p_lease_token;
  RETURN FOUND;
END $fn$;

-- Resume: explicit, audited, privileged. Clears the halt; the halted event is redelivered first.
CREATE OR REPLACE FUNCTION public.resume_financial_consumer(
  p_business_id TEXT, p_consumer TEXT, p_actor_id TEXT, p_reason TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF nullif(btrim(p_actor_id), '') IS NULL OR nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'financial_consumer_resume_requires_actor_and_reason' USING ERRCODE = 'check_violation';
  END IF;
  -- TODO(C4): append an immutable audit record in addition to this operational reason.
  UPDATE public.financial_event_consumers
     SET halted_at = NULL, halted_event_id = NULL,
         halted_reason = 'resumed by ' || p_actor_id || ': ' || left(p_reason, 500),
         lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
   WHERE business_id = p_business_id AND consumer = p_consumer AND halted_at IS NOT NULL;
  RETURN FOUND;
END $fn$;

REVOKE ALL ON FUNCTION public.claim_financial_events(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_financial_consumer_lease(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ack_financial_event(TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_financial_event(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_financial_consumer_lease(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resume_financial_consumer(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_financial_events(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_financial_event(TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_financial_event(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_financial_consumer_lease(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resume_financial_consumer(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Start one durable attempt per event/lease before the handler runs. An interrupted handler
-- leaves evidence; replay under a new token increments attempts, not the failure threshold.
CREATE OR REPLACE FUNCTION public.begin_financial_event_attempt(
  p_business_id TEXT, p_consumer TEXT, p_event_id TEXT, p_lease_token TEXT
) RETURNS TABLE (attempts INTEGER, delivered_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE c public.financial_event_consumers%ROWTYPE; v_seq BIGINT;
BEGIN
  c := public.assert_financial_consumer_lease(p_business_id, p_consumer, p_lease_token);
  SELECT e.seq INTO v_seq FROM public.financial_events e WHERE e.business_id=p_business_id AND e.id=p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_consumer_unknown_event' USING ERRCODE='foreign_key_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.financial_events e WHERE e.business_id=p_business_id AND e.seq>c.last_seq AND e.seq<v_seq) THEN
    RAISE EXCEPTION 'financial_consumer_ack_out_of_order' USING ERRCODE='check_violation';
  END IF;
  INSERT INTO public.financial_event_deliveries AS d (business_id,consumer,event_id,attempts,attempt_token)
    VALUES(p_business_id,p_consumer,p_event_id,1,p_lease_token)
    ON CONFLICT (business_id,consumer,event_id) DO UPDATE
      SET attempts=d.attempts + CASE WHEN d.attempt_token IS DISTINCT FROM p_lease_token AND d.delivered_at IS NULL THEN 1 ELSE 0 END,
          last_attempt_at=CASE WHEN d.attempt_token IS DISTINCT FROM p_lease_token AND d.delivered_at IS NULL THEN clock_timestamp() ELSE d.last_attempt_at END,
          attempt_token=CASE WHEN d.delivered_at IS NULL THEN p_lease_token ELSE d.attempt_token END;
  RETURN QUERY SELECT d.attempts,d.delivered_at FROM public.financial_event_deliveries d
    WHERE d.business_id=p_business_id AND d.consumer=p_consumer AND d.event_id=p_event_id;
END $fn$;
REVOKE ALL ON FUNCTION public.begin_financial_event_attempt(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_financial_event_attempt(TEXT,TEXT,TEXT,TEXT) TO service_role;

-- RPC-only transport for the status view. Cast BIGINTs at the database boundary.
CREATE OR REPLACE FUNCTION public.get_financial_consumer_status(p_business_id TEXT,p_consumer TEXT)
RETURNS TABLE (last_seq TEXT,backlog TEXT,lease_active BOOLEAN,halted_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT s.last_seq::text,s.backlog::text,s.lease_active,s.halted_at
  FROM public.financial_consumer_status s WHERE s.business_id=p_business_id AND s.consumer=p_consumer
$fn$;
REVOKE ALL ON FUNCTION public.get_financial_consumer_status(TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_consumer_status(TEXT,TEXT) TO service_role;

COMMIT;
