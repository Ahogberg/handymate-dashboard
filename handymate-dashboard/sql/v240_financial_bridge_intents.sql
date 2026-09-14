-- v240_financial_bridge_intents.sql — C5b bridge, recovery and audited human resolution.
-- Based on the reviewed C5b draft; consent ownership is checked even when no intents were selected.
BEGIN;

-- ── Intents can now be owed by a producer that is not the facade (bridge on receivable_settled{customer}) ──
ALTER TABLE public.financial_effect_intents ALTER COLUMN command_id DROP NOT NULL;
ALTER TABLE public.financial_effect_intents ADD COLUMN IF NOT EXISTS source_event_id TEXT NULL;
ALTER TABLE public.financial_effect_intents ADD COLUMN IF NOT EXISTS context JSONB NULL;
ALTER TABLE public.financial_effect_intents ADD COLUMN IF NOT EXISTS resolution JSONB NULL;
ALTER TABLE public.financial_effect_intents DROP CONSTRAINT IF EXISTS financial_effect_intents_origin_check;
ALTER TABLE public.financial_effect_intents ADD CONSTRAINT financial_effect_intents_origin_check
  CHECK ((command_id IS NOT NULL) <> (source_event_id IS NOT NULL));
ALTER TABLE public.financial_effect_intents DROP CONSTRAINT IF EXISTS financial_effect_intents_source_event_fk;
ALTER TABLE public.financial_effect_intents ADD CONSTRAINT financial_effect_intents_source_event_fk
  FOREIGN KEY (business_id, source_event_id) REFERENCES public.financial_events(business_id, id);
CREATE INDEX IF NOT EXISTS idx_financial_effect_intents_unknown ON public.financial_effect_intents (business_id, finished_at) WHERE status = 'unknown';

-- ── RPC: the bridge's producer. Idempotent per (receivable, effect); silent when the facade already owns delivery. ──
CREATE OR REPLACE FUNCTION public.ensure_effect_intents(
  p_business_id TEXT, p_receivable_id TEXT, p_source_event_id TEXT, p_effects TEXT[], p_context JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE rec public.financial_receivables%ROWTYPE; v_effect TEXT; v_id TEXT; v_created JSONB := '[]'; v_suppressed TEXT[] := '{}'; v_recorded BIGINT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_receivable_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF rec.component <> 'customer' THEN RAISE EXCEPTION 'financial_intent_receivable_not_settled_customer' USING ERRCODE = 'check_violation'; END IF;
  PERFORM 1 FROM public.financial_events e WHERE e.business_id = p_business_id AND e.id = p_source_event_id AND e.event_type = 'receivable_settled'
    AND e.source_type = 'receivable' AND e.source_id = p_receivable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_intent_source_event_invalid' USING ERRCODE = 'foreign_key_violation'; END IF;
  -- A facade settlement owns the entire decision, including effects deliberately
  -- omitted by an approval. Absence of an intent must not become new consent.
  IF EXISTS (SELECT 1 FROM public.financial_payment_commands c
      WHERE c.business_id = p_business_id AND c.invoice_id = rec.invoice_id
        AND c.route = 'kernel' AND c.outcome->'settled_now' ? 'customer') THEN
    RETURN jsonb_build_object('receivable_id', rec.id, 'invoice_id', rec.invoice_id,
      'created', '[]'::jsonb, 'suppressed', to_jsonb(p_effects), 'reason', 'facade_owned');
  END IF;
  -- The consumer may encounter a historical settlement after a reversal. It must
  -- acknowledge that obsolete event without dispatching or halting the cursor.
  IF rec.status <> 'settled' THEN
    RETURN jsonb_build_object('receivable_id', rec.id, 'invoice_id', rec.invoice_id,
      'created', '[]'::jsonb, 'suppressed', to_jsonb(p_effects), 'reason', 'reopened');
  END IF;
  IF p_effects IS NULL OR array_length(p_effects, 1) IS NULL THEN RAISE EXCEPTION 'financial_intent_effects_required' USING ERRCODE = 'check_violation'; END IF;
  -- Direct C4 producers may use payment correlation rather than invoice
  -- correlation. Only active allocations prove money applied to this invoice.
  SELECT COALESCE(sum(a.amount_minor), 0) INTO v_recorded
    FROM public.financial_payment_allocations a
    JOIN public.financial_receivables r ON r.business_id = a.business_id AND r.id = a.receivable_id
    WHERE a.business_id = p_business_id AND r.invoice_id = rec.invoice_id AND a.reversed_at IS NULL;
  FOREACH v_effect IN ARRAY p_effects LOOP
    v_id := NULL;
    INSERT INTO public.financial_effect_intents (business_id, source_event_id, invoice_id, receivable_id, effect, status, context)
      VALUES (p_business_id, p_source_event_id, rec.invoice_id, rec.id, v_effect, 'pending',
        COALESCE(p_context, '{}'::jsonb) || jsonb_build_object('source', 'bridge', 'paidAmountMinor', v_recorded::text, 'sourceEventId', p_source_event_id))
      ON CONFLICT (business_id, receivable_id, effect) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN v_suppressed := v_suppressed || v_effect;
    ELSE v_created := v_created || jsonb_build_object('id', v_id, 'effect', v_effect); END IF;
  END LOOP;
  RETURN jsonb_build_object('receivable_id', rec.id, 'invoice_id', rec.invoice_id, 'created', v_created, 'suppressed', to_jsonb(v_suppressed));
END $fn$;

-- ── RPC: claim, now with C5-review LOW fix (validated bounds) and per-intent context for bridge-owed intents ──
CREATE OR REPLACE FUNCTION public.claim_effect_intents(p_business_id TEXT, p_invoice_id TEXT, p_max_attempts INT, p_stale_minutes INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_unknown INT; v_claimed JSONB; v_unknown_ids JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 OR p_stale_minutes IS NULL OR p_stale_minutes NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'financial_effect_claim_limits_invalid' USING ERRCODE = 'check_violation';
  END IF;
  WITH expired AS (UPDATE public.financial_effect_intents SET status = 'unknown', finished_at = clock_timestamp(),
      last_error = 'attempt did not finish within ' || p_stale_minutes || ' min; delivery unknown, needs a human'
    WHERE business_id = p_business_id AND invoice_id = p_invoice_id AND status = 'attempting'
      AND claimed_at < clock_timestamp() - make_interval(mins => p_stale_minutes) RETURNING id)
  SELECT count(*), COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_unknown, v_unknown_ids FROM expired;
  WITH c AS (
    UPDATE public.financial_effect_intents SET status = 'attempting', attempts = attempts + 1, attempt_token = gen_random_uuid()::text,
        claimed_at = clock_timestamp(), finished_at = NULL
      WHERE business_id = p_business_id AND invoice_id = p_invoice_id
        AND (status = 'pending' OR (status = 'failed' AND attempts < p_max_attempts))
      RETURNING id, command_id, receivable_id, effect, attempts, attempt_token, context)
  SELECT COALESCE(jsonb_agg((to_jsonb(c) - 'context') || jsonb_build_object('context', COALESCE(c.context, cmd.effect_context)) ORDER BY c.effect), '[]'::jsonb)
    INTO v_claimed FROM c LEFT JOIN public.financial_payment_commands cmd ON cmd.business_id = p_business_id AND cmd.id = c.command_id;
  RETURN jsonb_build_object('claimed', v_claimed, 'marked_unknown', v_unknown, 'unknown_ids', v_unknown_ids);
END $fn$;

-- ── RPC: the sweeper's work list. One row per invoice with something owed; stale attempts are counted so the sweeper claims them into 'unknown'. ──
CREATE OR REPLACE FUNCTION public.list_owed_effect_intents(p_business_id TEXT, p_max_attempts INT, p_stale_minutes INT, p_limit INT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('invoice_id', x.invoice_id, 'owed', x.owed, 'stale', x.stale) ORDER BY x.oldest), '[]'::jsonb)
  FROM (
    SELECT i.invoice_id,
           count(*) FILTER (WHERE i.status = 'pending' OR (i.status = 'failed' AND i.attempts < p_max_attempts)) AS owed,
           count(*) FILTER (WHERE i.status = 'attempting' AND i.claimed_at < clock_timestamp() - make_interval(mins => p_stale_minutes)) AS stale,
           min(i.created_at) AS oldest
      FROM public.financial_effect_intents i
     WHERE i.business_id = p_business_id AND i.status IN ('pending', 'failed', 'attempting')
     GROUP BY i.invoice_id
    HAVING count(*) FILTER (WHERE i.status = 'pending' OR (i.status = 'failed' AND i.attempts < p_max_attempts)
                              OR (i.status = 'attempting' AND i.claimed_at < clock_timestamp() - make_interval(mins => p_stale_minutes))) > 0
     ORDER BY min(i.created_at), i.invoice_id
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500)
  ) x
$fn$;

-- ── RPC: a human resolves an 'unknown' (or exhausted 'failed') intent. Actor and reason are mandatory and persisted. ──
CREATE OR REPLACE FUNCTION public.resolve_effect_intent(
  p_business_id TEXT, p_intent_id TEXT, p_resolution TEXT, p_actor_id TEXT, p_reason TEXT, p_max_attempts INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE i public.financial_effect_intents%ROWTYPE; v_status TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'financial_effect_claim_limits_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('delivered', 'abandon', 'retry') THEN RAISE EXCEPTION 'financial_effect_resolution_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF nullif(btrim(p_actor_id), '') IS NULL OR nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'financial_effect_resolution_requires_actor_and_reason' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO i FROM public.financial_effect_intents x WHERE x.business_id = p_business_id AND x.id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_effect_intent_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF NOT (i.status = 'unknown' OR (i.status = 'failed' AND i.attempts >= p_max_attempts)) THEN
    RAISE EXCEPTION 'financial_effect_intent_not_resolvable' USING ERRCODE = 'check_violation', DETAIL = i.status;
  END IF;
  v_status := CASE p_resolution WHEN 'delivered' THEN 'sent' WHEN 'abandon' THEN 'skipped' ELSE 'pending' END;
  UPDATE public.financial_effect_intents SET status = v_status,
      finished_at = CASE WHEN v_status = 'pending' THEN NULL ELSE clock_timestamp() END,
      attempt_token = CASE WHEN v_status = 'pending' THEN NULL ELSE attempt_token END,
      claimed_at = CASE WHEN v_status = 'pending' THEN NULL ELSE claimed_at END,
      attempts = CASE WHEN v_status = 'pending' THEN 0 ELSE attempts END,
      resolution = COALESCE(resolution, '[]'::jsonb) || jsonb_build_object('at', clock_timestamp(), 'by', p_actor_id, 'from', i.status, 'to', v_status, 'reason', p_reason)
    WHERE business_id = p_business_id AND id = p_intent_id;
  RETURN jsonb_build_object('id', i.id, 'from', i.status, 'to', v_status);
END $fn$;

-- ── RPC: what a human sees. Unknown and exhausted intents per business, with the command/event that owed them. ──
CREATE OR REPLACE FUNCTION public.list_unresolved_effect_intents(p_business_id TEXT, p_max_attempts INT, p_limit INT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'invoice_id', i.invoice_id, 'receivable_id', i.receivable_id, 'effect', i.effect,
           'status', i.status, 'attempts', i.attempts, 'claimed_at', i.claimed_at, 'finished_at', i.finished_at, 'last_error', i.last_error,
           'command_id', i.command_id, 'source_event_id', i.source_event_id, 'resolution', i.resolution) ORDER BY i.finished_at NULLS LAST, i.created_at), '[]'::jsonb)
  FROM (SELECT * FROM public.financial_effect_intents i WHERE i.business_id = p_business_id
          AND (i.status = 'unknown' OR (i.status = 'failed' AND i.attempts >= p_max_attempts))
        ORDER BY i.finished_at NULLS LAST, i.created_at LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)) i
$fn$;

-- ── C5-review LOW: the issued-number guard says so when it reverts ──
CREATE OR REPLACE FUNCTION public.financial_preserve_issued_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
 IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
 AND EXISTS(SELECT 1 FROM public.business_config WHERE business_id=NEW.business_id AND financial_kernel_enabled)
 AND EXISTS(SELECT 1 FROM public.financial_receivables WHERE business_id=NEW.business_id AND invoice_id=NEW.invoice_id) THEN
   RAISE NOTICE 'financial_preserve_issued_number: invoice % keeps number % (attempted %)', NEW.invoice_id, OLD.invoice_number, NEW.invoice_number;
   NEW.invoice_number := OLD.invoice_number;
 END IF;
 RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.ensure_effect_intents(TEXT, TEXT, TEXT, TEXT[], JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_owed_effect_intents(TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_effect_intent(TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_unresolved_effect_intents(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_effect_intents(TEXT, TEXT, TEXT, TEXT[], JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_owed_effect_intents(TEXT, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_effect_intent(TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_unresolved_effect_intents(TEXT, INT, INT) TO service_role;

COMMIT;
