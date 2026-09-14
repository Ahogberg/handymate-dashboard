-- v239_financial_payment_commands.sql — C5 implementation from brief v3 (Claude, 2026-09-14; v2 corrected after PR #62 R1–R4).
-- Verified in PGlite on top of v235–v238 (probe8.cjs). Codex implements as written; deviations in the handoff.
BEGIN;

-- Supabase advisor WARN (production check 2026-09-14): pin search_path on the two v235/v238 helpers.
ALTER FUNCTION public.financial_events_immutable() SET search_path = public, pg_temp;
ALTER FUNCTION public.financial_receivable_json(public.financial_receivables) SET search_path = public, pg_temp;

-- ── Payment commands: one row per command identity, written in the same transaction as the kernel writes ──
CREATE TABLE IF NOT EXISTS public.financial_payment_commands (
  id            TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id   TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  command_key   TEXT        NOT NULL CHECK (command_key ~ '^[a-z_]+:\S+$' AND length(command_key) <= 400),
  invoice_id    TEXT        NOT NULL,
  source        TEXT        NOT NULL CHECK (source IN ('manual', 'status_patch', 'customer_confirmed', 'fortnox')),
  route         TEXT        NOT NULL CHECK (route IN ('kernel', 'legacy')),
  state         TEXT        NOT NULL CHECK (state IN ('executed', 'already_paid', 'legacy_routed', 'no_new_money', 'provider_below_kernel')),
  target        TEXT        NULL CHECK (target IS NULL OR target IN ('customer', 'tax_authority', 'invoice')),
  amount_minor  BIGINT      NULL CHECK (amount_minor IS NULL OR amount_minor > 0),
  currency      TEXT        NOT NULL DEFAULT 'SEK' CHECK (currency ~ '^[A-Z]{3}$'),
  settled_at    TIMESTAMPTZ NOT NULL,
  provider      TEXT        NOT NULL CHECK (provider IN ('manual', 'fortnox')),
  method        TEXT        NULL,
  evidence      TEXT        NOT NULL CHECK (evidence IN ('manual', 'fortnox')),
  observation   JSONB       NULL,
  payment_id    TEXT        NULL,
  outcome       JSONB       NOT NULL,
  effect_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_type    TEXT        NOT NULL,
  actor_id      TEXT        NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, command_key),
  FOREIGN KEY (business_id, invoice_id) REFERENCES public.invoice(business_id, invoice_id),
  FOREIGN KEY (business_id, payment_id) REFERENCES public.financial_payments(business_id, id),
  CHECK ((state = 'executed') = (payment_id IS NOT NULL)),
  CHECK ((state = 'executed') = (amount_minor IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_payment_commands_invoice ON public.financial_payment_commands (business_id, invoice_id, created_at);

-- ── Effect intents: durable "we owe this side effect" rows; the marker the C5b bridge checks ──
CREATE TABLE IF NOT EXISTS public.financial_effect_intents (
  id            TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id   TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  command_id    TEXT        NOT NULL,
  invoice_id    TEXT        NOT NULL,
  receivable_id TEXT        NOT NULL,
  effect        TEXT        NOT NULL CHECK (effect ~ '^[a-z_]{2,40}$'),
  status        TEXT        NOT NULL CHECK (status IN ('pending', 'attempting', 'sent', 'failed', 'skipped', 'unknown')),
  attempts      INT         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  attempt_token TEXT        NULL,
  claimed_at    TIMESTAMPTZ NULL,
  finished_at   TIMESTAMPTZ NULL,
  last_error    TEXT        NULL,
  result        JSONB       NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, command_id, effect),
  UNIQUE (business_id, receivable_id, effect),
  FOREIGN KEY (business_id, command_id) REFERENCES public.financial_payment_commands(business_id, id),
  FOREIGN KEY (business_id, receivable_id) REFERENCES public.financial_receivables(business_id, id),
  CHECK ((status = 'attempting') = (claimed_at IS NOT NULL AND finished_at IS NULL) OR status IN ('sent', 'failed', 'skipped', 'unknown')),
  CHECK ((status = 'pending') = (attempt_token IS NULL)),
  CHECK ((status IN ('sent', 'failed', 'skipped', 'unknown')) = (finished_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_effect_intents_open ON public.financial_effect_intents (business_id, invoice_id)
  WHERE status IN ('pending', 'attempting', 'failed');

DO $rls$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_payment_commands', 'financial_effect_intents'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t || '_tenant_read', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', t);
  END LOOP;
END $rls$;


-- ── Projection helpers (R1): the legacy invoice columns are a projection of CURRENT kernel state, written under the
-- invoice row lock inside the command transaction. Command history never drives a write. ──
CREATE OR REPLACE FUNCTION public.financial_invoice_projection(p_business_id TEXT, p_invoice_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE recs JSONB; v_recorded BIGINT; v_allocated BIGINT; v_open INT; v_customer_open BOOLEAN; v_status TEXT; v_owed INT; v_unknown INT; inv RECORD;
BEGIN
  SELECT * INTO inv FROM public.invoice WHERE business_id=p_business_id AND invoice_id=p_invoice_id;
  SELECT jsonb_agg(public.financial_receivable_json(x) ORDER BY x.component), count(*) FILTER (WHERE x.status = 'open'),
         bool_or(x.component = 'customer' AND x.status = 'open')
    INTO recs, v_open, v_customer_open
    FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id;
  SELECT COALESCE(sum(p.amount_minor), 0), COALESCE(sum(p.allocated_minor), 0) INTO v_recorded, v_allocated FROM public.financial_payments p
    WHERE p.business_id = p_business_id AND p.correlation_id = 'fin_invoice_' || p_invoice_id AND p.status = 'settled' AND p.direction = 'inbound';
  SELECT count(*) FILTER (WHERE i.status IN ('pending', 'failed', 'attempting')), count(*) FILTER (WHERE i.status = 'unknown') INTO v_owed, v_unknown
    FROM public.financial_effect_intents i WHERE i.business_id = p_business_id AND i.invoice_id = p_invoice_id;
  v_status := CASE WHEN recs IS NULL THEN NULL WHEN v_open = 0 THEN 'paid' WHEN NOT v_customer_open THEN 'customer_paid' ELSE NULL END;
  RETURN jsonb_build_object('receivables', COALESCE(recs, '[]'::jsonb), 'recorded_minor', v_recorded::text,
    'unallocated_minor', (v_recorded - v_allocated)::text, 'derived_status', v_status,
    'intents_owed', v_owed, 'intents_unknown', v_unknown, 'status', COALESCE(v_status,inv.status), 'paid_at',inv.paid_at,'settled_at',inv.settled_at);
END $fn$;

CREATE OR REPLACE FUNCTION public.financial_project_invoice(
  p_business_id TEXT, p_invoice_id TEXT, p_settled_now TEXT[], p_settled_at TIMESTAMPTZ, p_source TEXT, p_paid_via TEXT, p_marked_by TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE proj JSONB; v_customer_now BOOLEAN := 'customer' = ANY(COALESCE(p_settled_now, '{}')); v_any_now BOOLEAN := COALESCE(array_length(p_settled_now, 1), 0) > 0; v_status TEXT;
BEGIN
  proj := public.financial_invoice_projection(p_business_id, p_invoice_id);
  UPDATE public.invoice i SET
      paid_amount = round((proj->>'recorded_minor')::numeric / 100, 2),
      status = COALESCE(proj->>'derived_status', i.status),
      paid_at = CASE WHEN v_customer_now THEN p_settled_at ELSE i.paid_at END,
      paid_via = CASE WHEN v_customer_now THEN p_paid_via ELSE i.paid_via END,
      settled_at = CASE WHEN proj->>'derived_status' = 'paid' AND i.settled_at IS NULL THEN p_settled_at ELSE i.settled_at END,
      manual_paid_marked_at = CASE WHEN v_any_now AND p_source <> 'fortnox' THEN now() ELSE i.manual_paid_marked_at END,
      manual_paid_by_user_id = CASE WHEN v_any_now AND p_source <> 'fortnox' THEN p_marked_by ELSE i.manual_paid_by_user_id END
    WHERE i.business_id = p_business_id AND i.invoice_id = p_invoice_id
    RETURNING i.status INTO v_status;
  RETURN public.financial_invoice_projection(p_business_id,p_invoice_id) || jsonb_build_object('status', v_status, 'written', true);
END $fn$;

-- ── RPC 1: execute (or replay) one payment command atomically ──
-- Identity = (business_id, command_key). Parameters are resolved ONCE and persisted with the outcome
-- in the same transaction as issuance, settlement, allocations, rounding and effect intents.
-- A replay returns the stored outcome and never touches the kernel again.
CREATE OR REPLACE FUNCTION public.execute_payment_command(
  p_business_id TEXT, p_command_key TEXT, p_invoice_id TEXT, p_source TEXT,
  p_target TEXT, p_amount_minor BIGINT, p_settled_at TIMESTAMPTZ,
  p_provider TEXT, p_method TEXT, p_evidence TEXT, p_observation JSONB,
  p_rounding_max_minor BIGINT, p_effects TEXT[], p_paid_via TEXT, p_marked_by TEXT, p_actor_type TEXT, p_actor_id TEXT, p_effect_context JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  cmd public.financial_payment_commands%ROWTYPE;
  inv RECORD; r RECORD;
  v_target TEXT; v_amount BIGINT; v_state TEXT := 'executed';
  v_recorded BIGINT; v_snapshot BIGINT; v_delta BIGINT;
  pay JSONB; al JSONB; adj JSONB; recs JSONB;
  v_unallocated BIGINT; v_alloc BIGINT; v_open_count INT;
  v_settled_now TEXT[] := '{}'; v_touched TEXT[] := '{}'; v_suppressed TEXT[] := '{}';
  v_allocations JSONB := '[]'; v_adjustments JSONB := '[]'; v_intents JSONB := '[]';
  v_customer_rec TEXT; v_effect TEXT; v_intent_id TEXT; v_cmd_id TEXT; v_outcome JSONB;
  v_settled_at TIMESTAMPTZ := COALESCE(p_settled_at, now());
  proj JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_command_key IS NULL OR p_command_key = '' THEN RAISE EXCEPTION 'financial_command_key_required' USING ERRCODE = 'check_violation'; END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual', 'status_patch', 'customer_confirmed', 'fortnox') THEN RAISE EXCEPTION 'financial_command_source_invalid' USING ERRCODE = 'check_violation'; END IF;

  -- Replay: identity wins over everything the caller sends now.
  SELECT * INTO cmd FROM public.financial_payment_commands c WHERE c.business_id = p_business_id AND c.command_key = p_command_key;
  IF FOUND THEN
    IF cmd.invoice_id IS DISTINCT FROM p_invoice_id OR cmd.source IS DISTINCT FROM p_source THEN
      RAISE EXCEPTION 'financial_command_conflict' USING ERRCODE = 'unique_violation', DETAIL = cmd.id;
    END IF;
    PERFORM 1 FROM public.invoice i WHERE i.invoice_id = p_invoice_id AND i.business_id = p_business_id FOR UPDATE;
    RETURN jsonb_build_object(
      'command', cmd.outcome || jsonb_build_object('replayed', true, 'command_id', cmd.id,
        'intents', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'effect', i.effect, 'status', i.status, 'attempts', i.attempts) ORDER BY i.effect), '[]'::jsonb)
                      FROM public.financial_effect_intents i WHERE i.business_id = p_business_id AND i.command_id = cmd.id)),
      'projection', public.financial_invoice_projection(p_business_id, p_invoice_id) || jsonb_build_object('written', false));
  END IF;

  SELECT i.invoice_id, i.status, i.paid_amount, i.total INTO inv
    FROM public.invoice i WHERE i.invoice_id = p_invoice_id AND i.business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_invoice_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;

  -- Routing (B3): an invoice with legacy payment evidence and no kernel receivables stays on the legacy path
  -- until C4b imports its opening balance. The decision is persisted so every later command on it agrees.
  IF NOT EXISTS (SELECT 1 FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id) THEN
    IF COALESCE(inv.paid_amount, 0) > 0 OR inv.status IN ('customer_paid', 'paid') OR EXISTS (SELECT 1 FROM public.financial_payment_commands c WHERE c.business_id=p_business_id AND c.invoice_id=p_invoice_id AND c.route='legacy') THEN
      v_outcome := jsonb_build_object('route', 'legacy', 'state', 'legacy_routed', 'reason', 'legacy_payment_evidence',
        'legacy_status', inv.status, 'legacy_paid_amount', inv.paid_amount);
      INSERT INTO public.financial_payment_commands (business_id, command_key, invoice_id, source, route, state, settled_at, provider, method, evidence, observation, outcome, actor_type, actor_id)
        VALUES (p_business_id, p_command_key, p_invoice_id, p_source, 'legacy', 'legacy_routed', v_settled_at, p_provider, p_method, p_evidence, p_observation, v_outcome, p_actor_type, p_actor_id)
        RETURNING id INTO v_cmd_id;
      RETURN jsonb_build_object('command', v_outcome || jsonb_build_object('replayed', false, 'command_id', v_cmd_id, 'intents', '[]'::jsonb, 'effects_suppressed', '[]'::jsonb),
        'projection', jsonb_build_object('written', false, 'receivables', '[]'::jsonb, 'recorded_minor', '0', 'unallocated_minor', '0', 'derived_status', NULL, 'intents_owed', 0, 'intents_unknown', 0));
    END IF;
    PERFORM public.issue_invoice_receivables(p_business_id, p_invoice_id, p_actor_type, p_actor_id);
  END IF;

  SELECT count(*) INTO v_open_count FROM public.financial_receivables x
    WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.status = 'open';
  IF v_open_count = 0 THEN
    v_outcome := jsonb_build_object('route', 'kernel', 'state', 'already_paid', 'settled_now', '[]'::jsonb);
    INSERT INTO public.financial_payment_commands (business_id, command_key, invoice_id, source, route, state, settled_at, provider, method, evidence, observation, outcome, actor_type, actor_id)
      VALUES (p_business_id, p_command_key, p_invoice_id, p_source, 'kernel', 'already_paid', v_settled_at, p_provider, p_method, p_evidence, p_observation, v_outcome, p_actor_type, p_actor_id)
      RETURNING id INTO v_cmd_id;
    -- Projection is (re)written even here: it is idempotent and repairs a projection a crashed request never wrote.
    proj := public.financial_project_invoice(p_business_id, p_invoice_id, '{}', v_settled_at, p_source, p_paid_via, p_marked_by);
    RETURN jsonb_build_object('command', v_outcome || jsonb_build_object('replayed', false, 'command_id', v_cmd_id, 'intents', '[]'::jsonb, 'effects_suppressed', '[]'::jsonb), 'projection', proj);
  END IF;

  -- Resolve target and amount ONCE (B1). Persisted below; a replay never re-derives.
  IF p_observation IS NOT NULL THEN
    -- Provider snapshot (B2): new money = cumulative paid per provider − everything the kernel already holds for the invoice.
    v_target := 'invoice';
    v_snapshot := (p_observation->>'paid_minor')::bigint;
    IF v_snapshot IS NULL OR v_snapshot < 0 THEN RAISE EXCEPTION 'financial_observation_paid_minor_required' USING ERRCODE = 'check_violation'; END IF;
    SELECT COALESCE(sum(p.amount_minor), 0) INTO v_recorded FROM public.financial_payments p
      WHERE p.business_id = p_business_id AND p.correlation_id = 'fin_invoice_' || p_invoice_id AND p.status = 'settled' AND p.direction = 'inbound';
    v_delta := v_snapshot - v_recorded;
    IF v_delta <= 0 THEN
      v_state := CASE WHEN v_delta = 0 THEN 'no_new_money' ELSE 'provider_below_kernel' END;
      v_outcome := jsonb_build_object('route', 'kernel', 'state', v_state, 'snapshot_paid_minor', v_snapshot::text,
        'kernel_recorded_minor', v_recorded::text, 'delta_minor', v_delta::text, 'settled_now', '[]'::jsonb);
      INSERT INTO public.financial_payment_commands (business_id, command_key, invoice_id, source, route, state, target, settled_at, provider, method, evidence, observation, outcome, actor_type, actor_id)
        VALUES (p_business_id, p_command_key, p_invoice_id, p_source, 'kernel', v_state, 'invoice', v_settled_at, p_provider, p_method, p_evidence, p_observation, v_outcome, p_actor_type, p_actor_id)
        RETURNING id INTO v_cmd_id;
      proj := public.financial_project_invoice(p_business_id, p_invoice_id, '{}', v_settled_at, p_source, p_paid_via, p_marked_by);
      RETURN jsonb_build_object('command', v_outcome || jsonb_build_object('replayed', false, 'command_id', v_cmd_id, 'intents', '[]'::jsonb, 'effects_suppressed', '[]'::jsonb), 'projection', proj);
    END IF;
    v_amount := v_delta;
  ELSIF p_target IS NOT NULL THEN
    IF p_target NOT IN ('customer', 'tax_authority') THEN RAISE EXCEPTION 'financial_command_target_invalid' USING ERRCODE = 'check_violation'; END IF;
    v_target := p_target;
    SELECT (x.amount_minor + x.adjusted_minor - x.allocated_minor) INTO v_amount FROM public.financial_receivables x
      WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.component = p_target AND x.status = 'open';
    IF NOT FOUND THEN RAISE EXCEPTION 'financial_command_target_not_open' USING ERRCODE = 'check_violation'; END IF;
    IF p_amount_minor IS NOT NULL THEN v_amount := p_amount_minor; END IF;
  ELSIF p_amount_minor IS NOT NULL THEN
    v_target := 'invoice'; v_amount := p_amount_minor;
  ELSE
    -- Legacy "no amount" = the next open component, customer first. Resolved under the lock, persisted once.
    SELECT x.component, (x.amount_minor + x.adjusted_minor - x.allocated_minor) INTO v_target, v_amount FROM public.financial_receivables x
      WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.status = 'open'
      ORDER BY CASE x.component WHEN 'customer' THEN 0 ELSE 1 END LIMIT 1;
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'financial_command_amount_invalid' USING ERRCODE = 'check_violation'; END IF;

  pay := public.record_payment_settlement(p_business_id, p_provider, NULL, 'inbound', p_method, 'SEK', v_amount, NULL, p_evidence, v_settled_at,
    'fin_invoice_' || p_invoice_id, p_command_key, p_actor_type, p_actor_id);
  v_unallocated := (pay->>'unallocated_minor')::bigint;

  FOR r IN SELECT x.id, x.component, (x.amount_minor + x.adjusted_minor - x.allocated_minor) AS outstanding FROM public.financial_receivables x
             WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.status = 'open' AND (v_target = 'invoice' OR x.component = v_target)
             ORDER BY CASE x.component WHEN 'customer' THEN 0 ELSE 1 END
  LOOP
    EXIT WHEN v_unallocated <= 0;
    v_alloc := LEAST(v_unallocated, r.outstanding);
    al := public.allocate_payment(p_business_id, pay->>'payment_id', r.id, v_alloc, p_command_key || ':alloc:' || r.component, p_actor_type, p_actor_id);
    v_unallocated := v_unallocated - v_alloc;
    v_touched := v_touched || r.component;
    v_allocations := v_allocations || jsonb_build_object('component', r.component, 'receivable_id', r.id, 'amount_minor', v_alloc::text);
    IF (al->>'receivable_settled')::boolean THEN v_settled_now := v_settled_now || r.component; END IF;
  END LOOP;

  -- Interim SE rounding policy (C1b replaces the value): only components this command paid into, only when the
  -- payment is fully allocated, only a shortfall within the policy. An explicit adjustment posting, never a comparison.
  IF v_unallocated = 0 AND COALESCE(p_rounding_max_minor, 0) > 0 THEN
    FOR r IN SELECT x.id, x.component, (x.amount_minor + x.adjusted_minor - x.allocated_minor) AS outstanding FROM public.financial_receivables x
               WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.status = 'open' AND x.component = ANY(v_touched)
    LOOP
      IF r.outstanding > 0 AND r.outstanding <= p_rounding_max_minor THEN
        adj := public.adjust_receivable(p_business_id, r.id, 'rounding', -r.outstanding, NULL, 'payment_command', p_command_key,
          p_command_key || ':rounding:' || r.component, p_actor_type, p_actor_id);
        v_adjustments := v_adjustments || jsonb_build_object('component', r.component, 'receivable_id', r.id, 'delta_minor', (-r.outstanding)::text);
        IF (adj->>'receivable_settled')::boolean THEN v_settled_now := v_settled_now || r.component; END IF;
      END IF;
    END LOOP;
  END IF;

  -- History only: what THIS command did. Current state lives in the projection (R1).
  v_outcome := jsonb_build_object('route', 'kernel', 'state', 'executed', 'payment_id', pay->>'payment_id', 'amount_minor', v_amount::text,
    'target', v_target, 'settled_now', to_jsonb(v_settled_now), 'allocations', v_allocations, 'adjustments', v_adjustments,
    'payment_unallocated_minor', v_unallocated::text);
  INSERT INTO public.financial_payment_commands (business_id, command_key, invoice_id, source, route, state, target, amount_minor, settled_at, provider, method, evidence, observation, payment_id, outcome, actor_type, actor_id)
    VALUES (p_business_id, p_command_key, p_invoice_id, p_source, 'kernel', 'executed', v_target, v_amount, v_settled_at, p_provider, p_method, p_evidence, p_observation, pay->>'payment_id', v_outcome, p_actor_type, p_actor_id)
    RETURNING id INTO v_cmd_id;

  -- Preserve original consent/source across sweeps by other callers; never use the retry caller's choices.
  UPDATE public.financial_payment_commands SET effect_context = COALESCE(p_effect_context, '{}'::jsonb) ||
    jsonb_build_object('source', p_source, 'paidAmountMinor', (public.financial_invoice_projection(p_business_id,p_invoice_id)->>'recorded_minor'))
    WHERE business_id=p_business_id AND id=v_cmd_id;

  -- Effect intents (B4): owed only when the CUSTOMER component settled in this command; one per receivable and effect, ever.
  IF 'customer' = ANY(v_settled_now) AND p_effects IS NOT NULL THEN
    SELECT x.id INTO v_customer_rec FROM public.financial_receivables x
      WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.component = 'customer';
    FOREACH v_effect IN ARRAY p_effects LOOP
      v_intent_id := NULL;
      INSERT INTO public.financial_effect_intents (business_id, command_id, invoice_id, receivable_id, effect, status)
        VALUES (p_business_id, v_cmd_id, p_invoice_id, v_customer_rec, v_effect, 'pending')
        ON CONFLICT (business_id, receivable_id, effect) DO NOTHING RETURNING id INTO v_intent_id;
      IF v_intent_id IS NULL THEN v_suppressed := v_suppressed || v_effect;
      ELSE v_intents := v_intents || jsonb_build_object('id', v_intent_id, 'effect', v_effect, 'status', 'pending', 'attempts', 0); END IF;
    END LOOP;
  END IF;

  UPDATE public.financial_payment_commands SET outcome = v_outcome || jsonb_build_object('effects_suppressed',to_jsonb(v_suppressed)) WHERE business_id=p_business_id AND id=v_cmd_id;
  proj := public.financial_project_invoice(p_business_id, p_invoice_id, v_settled_now, v_settled_at, p_source, p_paid_via, p_marked_by);
  RETURN jsonb_build_object('command', v_outcome || jsonb_build_object('replayed', false, 'command_id', v_cmd_id, 'intents', v_intents, 'effects_suppressed', to_jsonb(v_suppressed)), 'projection', proj);
END $fn$;

-- ── RPC 2: claim the intents owed on an invoice (pending, or failed below the retry cap). Stale attempts become 'unknown'.
-- Every claim mints an attempt token (R3); only that token can finish the attempt. ──
CREATE OR REPLACE FUNCTION public.claim_effect_intents(p_business_id TEXT, p_invoice_id TEXT, p_max_attempts INT, p_stale_minutes INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_unknown INT; v_claimed JSONB; v_unknown_ids JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 3 OR p_stale_minutes IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'financial_effect_claim_limits_invalid'; END IF;
  WITH expired AS (UPDATE public.financial_effect_intents SET status = 'unknown', finished_at = clock_timestamp(),
      last_error = 'attempt did not finish within ' || p_stale_minutes || ' min; delivery unknown, needs a human'
    WHERE business_id = p_business_id AND invoice_id = p_invoice_id AND status = 'attempting'
      AND claimed_at < clock_timestamp() - make_interval(mins => p_stale_minutes) RETURNING id)
  SELECT count(*), COALESCE(jsonb_agg(id),'[]'::jsonb) INTO v_unknown, v_unknown_ids FROM expired;
  WITH c AS (
    UPDATE public.financial_effect_intents SET status = 'attempting', attempts = attempts + 1, attempt_token = gen_random_uuid()::text,
        claimed_at = clock_timestamp(), finished_at = NULL
      WHERE business_id = p_business_id AND invoice_id = p_invoice_id
        AND (status = 'pending' OR (status = 'failed' AND attempts < p_max_attempts))
      RETURNING id, command_id, receivable_id, effect, attempts, attempt_token)
  SELECT COALESCE(jsonb_agg(to_jsonb(c) || jsonb_build_object('context',cmd.effect_context) ORDER BY c.effect), '[]'::jsonb) INTO v_claimed FROM c JOIN public.financial_payment_commands cmd ON cmd.business_id=p_business_id AND cmd.id=c.command_id;
  RETURN jsonb_build_object('claimed', v_claimed, 'marked_unknown', v_unknown, 'unknown_ids',v_unknown_ids);
END $fn$;

-- ── RPC 3: finish one claimed attempt. The token identifies the attempt; a stale or foreign token never mutates a later attempt. ──
-- A late finish carrying the token of an attempt already marked 'unknown' is accepted: the worker now reports what happened.
-- A repeated finish with the same token and the same status is idempotent; a different status for a finished attempt is an error.
CREATE OR REPLACE FUNCTION public.finish_effect_intent(p_business_id TEXT, p_intent_id TEXT, p_attempt_token TEXT, p_status TEXT, p_result JSONB, p_error TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE i public.financial_effect_intents%ROWTYPE;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_status NOT IN ('sent', 'failed', 'skipped') THEN RAISE EXCEPTION 'financial_effect_status_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF p_attempt_token IS NULL OR p_attempt_token = '' THEN RAISE EXCEPTION 'financial_effect_attempt_token_required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO i FROM public.financial_effect_intents x WHERE x.business_id = p_business_id AND x.id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_effect_intent_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF i.attempt_token IS DISTINCT FROM p_attempt_token THEN RAISE EXCEPTION 'financial_effect_attempt_stale' USING ERRCODE = 'check_violation', DETAIL = i.status; END IF;
  IF i.status IN ('sent', 'failed', 'skipped') THEN
    IF i.status = p_status THEN RETURN jsonb_build_object('id', i.id, 'status', i.status, 'attempt', i.attempts, 'idempotent', true); END IF;
    RAISE EXCEPTION 'financial_effect_attempt_finished' USING ERRCODE = 'check_violation', DETAIL = i.status;
  END IF;
  UPDATE public.financial_effect_intents SET status = p_status, finished_at = clock_timestamp(), result = p_result, last_error = p_error
    WHERE business_id = p_business_id AND id = p_intent_id;
  RETURN jsonb_build_object('id', i.id, 'status', p_status, 'attempt', i.attempts, 'idempotent', false, 'was_unknown', i.status = 'unknown');
END $fn$;

REVOKE ALL ON FUNCTION public.financial_invoice_projection(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_project_invoice(TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.execute_payment_command(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, BIGINT, TEXT[], TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_effect_intents(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_effect_intent(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_payment_command(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, BIGINT, TEXT[], TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_effect_intents(TEXT, TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_effect_intent(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;

-- Eager issuance shares payment routing and lock order; no check-then-write window.
CREATE OR REPLACE FUNCTION public.issue_invoice_receivables_if_eligible(p_business_id TEXT,p_invoice_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE inv RECORD;
BEGIN
 PERFORM public.financial_lock(p_business_id);
 SELECT * INTO inv FROM public.invoice WHERE business_id=p_business_id AND invoice_id=p_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_invoice_not_found'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.financial_receivables WHERE business_id=p_business_id AND invoice_id=p_invoice_id) AND
 (COALESCE(inv.paid_amount,0)>0 OR inv.status IN ('paid','customer_paid') OR EXISTS(SELECT 1 FROM public.financial_payment_commands WHERE business_id=p_business_id AND invoice_id=p_invoice_id AND route='legacy')) THEN
 RETURN jsonb_build_object('route','legacy'); END IF;
 RETURN public.issue_invoice_receivables(p_business_id,p_invoice_id,'system',NULL) || jsonb_build_object('route','kernel');
END $fn$;
REVOKE ALL ON FUNCTION public.issue_invoice_receivables_if_eligible(TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice_receivables_if_eligible(TEXT,TEXT) TO service_role;

-- The receipt path also omits the field, but this guard closes a concurrent issuance window.
CREATE OR REPLACE FUNCTION public.financial_preserve_issued_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
 IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
 AND EXISTS(SELECT 1 FROM public.business_config WHERE business_id=NEW.business_id AND financial_kernel_enabled)
 AND EXISTS(SELECT 1 FROM public.financial_receivables WHERE business_id=NEW.business_id AND invoice_id=NEW.invoice_id) THEN
   NEW.invoice_number := OLD.invoice_number;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.financial_preserve_issued_number() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER financial_preserve_issued_number BEFORE UPDATE OF invoice_number ON public.invoice
 FOR EACH ROW EXECUTE FUNCTION public.financial_preserve_issued_number();

COMMIT;
