-- v242_financial_kernel_shadow.sql — C6 phase control and read-only shadow evidence.
-- Based on the reviewed C6 brief; hardening deviations and regression evidence in the C6 handoff.
-- Shadow architecture §2 (S1/S2), §5 (persistence), §7 (no tolerances), §9 (eventual consistency), §11 (lifecycle), §17 (safety).
-- v241 is reserved for the Customer Value package (value_events).
BEGIN;

-- ── 1. Phase per business: explicit, dated, auditable, reversible with reason (§2, §14) ──
-- business_config.financial_kernel_enabled stays the dispatch switch and is written ONLY by set_financial_kernel_phase.
CREATE TABLE IF NOT EXISTS public.financial_kernel_rollout (
  id             TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id    TEXT        NOT NULL REFERENCES public.business_config(business_id),
  phase          TEXT        NOT NULL CHECK (phase IN ('off','S1','S2')),
  previous_phase TEXT        NOT NULL CHECK (previous_phase IN ('off','S1','S2')),
  actor          TEXT        NOT NULL CHECK (actor <> ''),
  reason         TEXT        NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  rollout_seq    BIGINT GENERATED ALWAYS AS IDENTITY,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (business_id, id)
);
CREATE INDEX IF NOT EXISTS idx_financial_kernel_rollout_latest ON public.financial_kernel_rollout (business_id, changed_at DESC);

-- ── 2. Reference snapshots: append-only, versioned; a later observation never rewrites an earlier one (§5) ──
CREATE TABLE IF NOT EXISTS public.financial_shadow_snapshots (
  id             TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id    TEXT        NOT NULL REFERENCES public.business_config(business_id),
  provider       TEXT        NOT NULL CHECK (provider IN ('fortnox')),
  object_type    TEXT        NOT NULL CHECK (object_type IN ('invoice')),
  external_id    TEXT        NOT NULL,
  invoice_id     TEXT        NULL,
  fetch_status   TEXT        NOT NULL CHECK (fetch_status IN ('ok','not_found','error')),
  snapshot       JSONB       NULL,
  error          TEXT        NULL,
  schema_version INT         NOT NULL DEFAULT 1,
  observed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, invoice_id) REFERENCES public.invoice(business_id, invoice_id),
  CHECK ((fetch_status = 'ok') = (snapshot IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_shadow_snapshots_object ON public.financial_shadow_snapshots (business_id, object_type, external_id, observed_at DESC);

-- ── 3. Comparison runs and comparisons (§5, §6) ──
CREATE TABLE IF NOT EXISTS public.financial_shadow_runs (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id        TEXT        NOT NULL REFERENCES public.business_config(business_id),
  phase              TEXT        NOT NULL CHECK (phase IN ('S1','S2')),
  trigger_type       TEXT        NOT NULL CHECK (trigger_type IN ('cron','manual')),
  comparison_version INT         NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  counts             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ NULL,
  PRIMARY KEY (business_id, id)
);
CREATE INDEX IF NOT EXISTS idx_financial_shadow_runs_latest ON public.financial_shadow_runs (business_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.financial_shadow_comparisons (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id        TEXT        NOT NULL,
  run_id             TEXT        NOT NULL,
  phase              TEXT        NOT NULL CHECK (phase IN ('S1','S2')),
  level              INT         NOT NULL CHECK (level BETWEEN 1 AND 4),
  object_type        TEXT        NOT NULL CHECK (object_type IN ('invoice','ledger','aggregate','report')),
  invoice_id         TEXT        NULL,
  snapshot_id        TEXT        NULL,
  result             TEXT        NOT NULL CHECK (result IN ('match','divergent','reference_missing','unsupported')),
  comparison_version INT         NOT NULL,
  handymate          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  differences        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, run_id) REFERENCES public.financial_shadow_runs(business_id, id),
  FOREIGN KEY (business_id, snapshot_id) REFERENCES public.financial_shadow_snapshots(business_id, id),
  CHECK ((result = 'divergent') = (jsonb_array_length(differences) > 0)),
  CHECK ((object_type = 'invoice') = (invoice_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_shadow_comparisons_run ON public.financial_shadow_comparisons (business_id, run_id);
CREATE INDEX IF NOT EXISTS idx_financial_shadow_comparisons_invoice ON public.financial_shadow_comparisons (business_id, invoice_id, checked_at DESC) WHERE invoice_id IS NOT NULL;

-- ── 4. Divergences: one OPEN row per (object, kind); sightings accumulate; closed only with provenance (§8, §11) ──
CREATE TABLE IF NOT EXISTS public.financial_shadow_divergences (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id     TEXT        NOT NULL REFERENCES public.business_config(business_id),
  phase           TEXT        NOT NULL CHECK (phase IN ('S1','S2')),
  kind            TEXT        NOT NULL CHECK (kind IN ('PAYMENT_DIVERGENCE','RECEIVABLE_BALANCE_DIVERGENCE','ROUNDING_DIVERGENCE',
                                                     'MISSING_HANDYMATE_ENTRY','MISSING_REFERENCE_ENTRY','REFERENCE_DATA_UNAVAILABLE','PROJECTION_DIVERGENCE')),
  severity        TEXT        NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  object_type     TEXT        NOT NULL,
  invoice_id      TEXT        NULL,
  comparison_id   TEXT        NOT NULL,
  expected        JSONB       NULL,
  actual          JSONB       NULL,
  seen_count      INT         NOT NULL DEFAULT 1,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at    TIMESTAMPTZ NULL,
  reported_at     TIMESTAMPTZ NULL,
  status          TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  root_cause_code TEXT        NULL,
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, comparison_id) REFERENCES public.financial_shadow_comparisons(business_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_shadow_divergence_open ON public.financial_shadow_divergences (business_id, object_type, COALESCE(invoice_id,''), kind) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_financial_shadow_divergences_open ON public.financial_shadow_divergences (business_id, severity, last_seen_at DESC) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.financial_shadow_resolutions (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id     TEXT        NOT NULL,
  divergence_id   TEXT        NOT NULL,
  resolution_type TEXT        NOT NULL CHECK (resolution_type IN ('superseded_by_match','accepted','fixed','reference_error','duplicate')),
  reason          TEXT        NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  resolved_by     TEXT        NOT NULL CHECK (resolved_by <> ''),
  fix_reference   TEXT        NULL,
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, divergence_id) REFERENCES public.financial_shadow_divergences(business_id, id)
);

-- ── 5. Immutability: rollout, snapshots, comparisons and resolutions are history; runs/divergences change only via the RPCs ──
DO $do$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_kernel_rollout','financial_shadow_snapshots','financial_shadow_comparisons','financial_shadow_resolutions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_immutable', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.financial_events_immutable()', t || '_immutable', t);
  END LOOP;
END $do$;

-- ── 6. RLS: members read, nobody writes through the API; service_role via RPC ──
DO $do$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_kernel_rollout','financial_shadow_snapshots','financial_shadow_runs','financial_shadow_comparisons','financial_shadow_divergences','financial_shadow_resolutions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t || '_tenant_read', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t);
  END LOOP;
END $do$;

-- Refuse to invent a pilot actor/reason for an already enabled business.
DO $do$ BEGIN
 IF EXISTS (SELECT 1 FROM public.business_config b WHERE b.financial_kernel_enabled AND NOT EXISTS
   (SELECT 1 FROM public.financial_kernel_rollout r WHERE r.business_id=b.business_id)) THEN
   RAISE EXCEPTION 'financial_kernel_existing_flag_requires_review' USING ERRCODE='check_violation'; END IF;
END $do$;

-- ── 7. Phase read + write ──
CREATE OR REPLACE FUNCTION public.financial_kernel_phase(p_business_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE((SELECT phase FROM public.financial_kernel_rollout r WHERE r.business_id = p_business_id ORDER BY rollout_seq DESC LIMIT 1), 'off')
$fn$;

-- The only writer of business_config.financial_kernel_enabled from now on. 'S2' is reserved until the S2 definition exists (brief: after two clean S1 weeks).
CREATE OR REPLACE FUNCTION public.set_financial_kernel_phase(p_business_id TEXT, p_phase TEXT, p_actor TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_prev TEXT; v_owed INT; v_id TEXT;
BEGIN
  IF p_phase = 'S2' THEN RAISE EXCEPTION 'financial_kernel_phase_reserved' USING ERRCODE = 'check_violation'; END IF;
  IF p_phase IS NULL OR p_phase NOT IN ('off','S1') THEN RAISE EXCEPTION 'financial_kernel_phase_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF p_actor IS NULL OR btrim(p_actor) = '' OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'financial_kernel_phase_reason_required' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.financial_lock(p_business_id);
  PERFORM 1 FROM public.business_config WHERE business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  v_prev := public.financial_kernel_phase(p_business_id);
  SELECT count(*) INTO v_owed FROM public.financial_effect_intents i WHERE i.business_id = p_business_id AND i.status IN ('pending','failed','attempting','unknown');
  IF v_prev = p_phase THEN
    RETURN jsonb_build_object('phase', v_prev, 'changed', false, 'owed_intents', v_owed);
  END IF;
  INSERT INTO public.financial_kernel_rollout (business_id, phase, previous_phase, actor, reason)
    VALUES (p_business_id, p_phase, v_prev, p_actor, p_reason) RETURNING id INTO v_id;
  UPDATE public.business_config SET financial_kernel_enabled = (p_phase <> 'off') WHERE business_id = p_business_id;
  RETURN jsonb_build_object('phase', p_phase, 'previous_phase', v_prev, 'changed', true, 'rollout_id', v_id, 'owed_intents', v_owed);
END $fn$;

-- Businesses the kernel cron must visit: dispatch on (consume + sweep) OR owed intents left behind by a kill switch (sweep only).
CREATE OR REPLACE FUNCTION public.list_financial_kernel_work()
RETURNS TABLE (business_id TEXT, phase TEXT, consume BOOLEAN, sweep BOOLEAN, owed_intents INT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT b.business_id, public.financial_kernel_phase(b.business_id), b.financial_kernel_enabled,
         b.financial_kernel_enabled OR EXISTS (SELECT 1 FROM public.financial_effect_intents i WHERE i.business_id = b.business_id AND i.status IN ('pending','failed','attempting')),
         (SELECT count(*)::int FROM public.financial_effect_intents i WHERE i.business_id=b.business_id AND i.status IN ('pending','failed','attempting','unknown'))
    FROM public.business_config b
   WHERE b.financial_kernel_enabled OR EXISTS (SELECT 1 FROM public.financial_effect_intents i WHERE i.business_id = b.business_id AND i.status IN ('pending','failed','attempting'))
   ORDER BY b.business_id
$fn$;

-- ── 8. Shadow run lifecycle ──
CREATE OR REPLACE FUNCTION public.open_shadow_run(p_business_id TEXT, p_trigger_type TEXT, p_comparison_version INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_phase TEXT; v_id TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  v_phase := public.financial_kernel_phase(p_business_id);
  IF v_phase = 'off' THEN RAISE EXCEPTION 'financial_shadow_phase_off' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.financial_shadow_runs SET status='failed',completed_at=clock_timestamp(),counts=jsonb_build_object('error','stale run expired') WHERE business_id=p_business_id AND status='running' AND started_at < clock_timestamp()-interval '10 minutes';
  IF EXISTS (SELECT 1 FROM public.financial_shadow_runs WHERE business_id=p_business_id AND status='running') THEN RAISE EXCEPTION 'financial_shadow_run_already_running' USING ERRCODE='check_violation'; END IF;
  INSERT INTO public.financial_shadow_runs (business_id, phase, trigger_type, comparison_version) VALUES (p_business_id, v_phase, p_trigger_type, p_comparison_version) RETURNING id INTO v_id;
  RETURN jsonb_build_object('run_id', v_id, 'phase', v_phase);
END $fn$;

CREATE OR REPLACE FUNCTION public.close_shadow_run(p_business_id TEXT, p_run_id TEXT, p_status TEXT, p_counts JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE r public.financial_shadow_runs%ROWTYPE;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_status IS NULL OR p_status NOT IN ('completed','failed') THEN RAISE EXCEPTION 'financial_shadow_run_status_invalid' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.financial_shadow_runs SET status = p_status, counts = COALESCE(p_counts, '{}'::jsonb), completed_at = now()
    WHERE business_id = p_business_id AND id = p_run_id AND status = 'running' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_shadow_run_not_running' USING ERRCODE = 'check_violation'; END IF;
  RETURN to_jsonb(r);
END $fn$;

CREATE OR REPLACE FUNCTION public.record_shadow_snapshot(p_business_id TEXT, p_provider TEXT, p_object_type TEXT, p_external_id TEXT, p_invoice_id TEXT, p_fetch_status TEXT, p_snapshot JSONB, p_error TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  INSERT INTO public.financial_shadow_snapshots (business_id, provider, object_type, external_id, invoice_id, fetch_status, snapshot, error)
    VALUES (p_business_id, p_provider, p_object_type, p_external_id, p_invoice_id, p_fetch_status, p_snapshot, p_error) RETURNING id
$fn$;

-- One comparison → its divergence sightings. A match closes every open divergence on the object with provenance (§11).
-- Severity is the engine's (versioned in TS); the RPC stores, counts, confirms on the second consecutive sighting (§9) and never edits invoice.
CREATE OR REPLACE FUNCTION public.record_shadow_comparison(
  p_business_id TEXT, p_run_id TEXT, p_level INT, p_object_type TEXT, p_invoice_id TEXT, p_snapshot_id TEXT,
  p_result TEXT, p_handymate JSONB, p_differences JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE run public.financial_shadow_runs%ROWTYPE; v_cmp TEXT; d JSONB; v_existing public.financial_shadow_comparisons%ROWTYPE; v_div public.financial_shadow_divergences%ROWTYPE; v_out JSONB := '[]'; v_closed INT := 0;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO run FROM public.financial_shadow_runs WHERE business_id = p_business_id AND id = p_run_id;
  IF NOT FOUND OR run.status <> 'running' THEN RAISE EXCEPTION 'financial_shadow_run_not_running' USING ERRCODE = 'check_violation'; END IF;
  IF p_result = 'divergent' AND (p_differences IS NULL OR jsonb_typeof(p_differences) <> 'array' OR jsonb_array_length(p_differences) = 0) THEN
    RAISE EXCEPTION 'financial_shadow_differences_required' USING ERRCODE = 'check_violation'; END IF;
  IF p_snapshot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financial_shadow_snapshots WHERE business_id=p_business_id AND id=p_snapshot_id AND invoice_id IS NOT DISTINCT FROM p_invoice_id AND object_type=p_object_type) THEN
    RAISE EXCEPTION 'financial_shadow_snapshot_mismatch' USING ERRCODE='foreign_key_violation'; END IF;
  IF p_object_type='invoice' AND NOT EXISTS (SELECT 1 FROM public.invoice WHERE business_id=p_business_id AND invoice_id=p_invoice_id) THEN
    RAISE EXCEPTION 'financial_shadow_invoice_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  SELECT * INTO v_existing FROM public.financial_shadow_comparisons WHERE business_id=p_business_id AND run_id=p_run_id AND level=p_level AND object_type=p_object_type AND invoice_id IS NOT DISTINCT FROM p_invoice_id;
  IF FOUND THEN
    IF v_existing.result IS DISTINCT FROM p_result OR v_existing.snapshot_id IS DISTINCT FROM p_snapshot_id OR v_existing.handymate IS DISTINCT FROM COALESCE(p_handymate,'{}'::jsonb) OR v_existing.differences IS DISTINCT FROM COALESCE(p_differences,'[]'::jsonb) THEN
      RAISE EXCEPTION 'financial_shadow_comparison_conflict' USING ERRCODE='check_violation'; END IF;
    RETURN jsonb_build_object('comparison_id',v_existing.id,'divergences','[]'::jsonb,'closed',0,'replayed',true);
  END IF;
  INSERT INTO public.financial_shadow_comparisons (business_id, run_id, phase, level, object_type, invoice_id, snapshot_id, result, comparison_version, handymate, differences)
    VALUES (p_business_id, p_run_id, run.phase, p_level, p_object_type, p_invoice_id, p_snapshot_id, p_result, run.comparison_version, COALESCE(p_handymate,'{}'::jsonb), COALESCE(p_differences,'[]'::jsonb))
    RETURNING id INTO v_cmp;
  IF p_result = 'match' THEN
    FOR v_div IN SELECT * FROM public.financial_shadow_divergences x WHERE x.business_id = p_business_id AND x.object_type = p_object_type AND COALESCE(x.invoice_id,'') = COALESCE(p_invoice_id,'') AND x.status = 'open' FOR UPDATE LOOP
      UPDATE public.financial_shadow_divergences SET status = 'resolved' WHERE business_id = p_business_id AND id = v_div.id;
      INSERT INTO public.financial_shadow_resolutions (business_id, divergence_id, resolution_type, reason, resolved_by, fix_reference)
        VALUES (p_business_id, v_div.id, 'superseded_by_match', 'Objektet stämde vid en senare jämförelse', 'shadow-run', v_cmp);
      v_closed := v_closed + 1;
    END LOOP;
    RETURN jsonb_build_object('comparison_id', v_cmp, 'divergences', v_out, 'closed', v_closed);
  END IF;
  IF p_result = 'reference_missing' THEN
    p_differences := jsonb_build_array(jsonb_build_object('kind','REFERENCE_DATA_UNAVAILABLE','severity','medium','expected',NULL,'actual',NULL));
  END IF;
  IF p_result = 'unsupported' THEN RETURN jsonb_build_object('comparison_id', v_cmp, 'divergences', v_out, 'closed', 0); END IF;
  UPDATE public.financial_shadow_divergences SET seen_count=0,confirmed_at=NULL,reported_at=NULL
   WHERE business_id=p_business_id AND object_type=p_object_type AND invoice_id IS NOT DISTINCT FROM p_invoice_id AND status='open'
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_differences) x WHERE x->>'kind'=financial_shadow_divergences.kind);
  FOR d IN SELECT jsonb_build_object('kind',x->>'kind','severity',min(x->>'severity'),'expected',jsonb_agg(x->'expected'),'actual',jsonb_agg(x->'actual')) FROM jsonb_array_elements(p_differences) x GROUP BY x->>'kind' LOOP
    INSERT INTO public.financial_shadow_divergences (business_id, phase, kind, severity, object_type, invoice_id, comparison_id, expected, actual)
      VALUES (p_business_id, run.phase, d->>'kind', d->>'severity', p_object_type, p_invoice_id, v_cmp, d->'expected', d->'actual')
    ON CONFLICT (business_id, object_type, (COALESCE(invoice_id,'')), kind) WHERE status = 'open' DO UPDATE SET
      seen_count = CASE
        WHEN (public.financial_shadow_divergences.last_seen_at AT TIME ZONE 'Europe/Stockholm')::date=(clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date THEN GREATEST(public.financial_shadow_divergences.seen_count,1)
        WHEN (public.financial_shadow_divergences.last_seen_at AT TIME ZONE 'Europe/Stockholm')::date=(clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date-1 THEN public.financial_shadow_divergences.seen_count+1
        ELSE 1 END,
      last_seen_at = clock_timestamp(), comparison_id = EXCLUDED.comparison_id,
      severity = EXCLUDED.severity, expected = EXCLUDED.expected, actual = EXCLUDED.actual, phase = EXCLUDED.phase,
      confirmed_at = CASE
        WHEN (public.financial_shadow_divergences.last_seen_at AT TIME ZONE 'Europe/Stockholm')::date=(clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date THEN public.financial_shadow_divergences.confirmed_at
        WHEN (public.financial_shadow_divergences.last_seen_at AT TIME ZONE 'Europe/Stockholm')::date=(clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date-1 AND public.financial_shadow_divergences.seen_count > 0 THEN COALESCE(public.financial_shadow_divergences.confirmed_at,clock_timestamp())
        ELSE NULL END,
      reported_at = CASE WHEN (public.financial_shadow_divergences.last_seen_at AT TIME ZONE 'Europe/Stockholm')::date < (clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date-1 THEN NULL ELSE public.financial_shadow_divergences.reported_at END
    RETURNING * INTO v_div;
    v_out := v_out || jsonb_build_object('id', v_div.id, 'kind', v_div.kind, 'severity', v_div.severity, 'seen_count', v_div.seen_count,
      'confirmed', v_div.confirmed_at IS NOT NULL, 'report', v_div.confirmed_at IS NOT NULL AND v_div.reported_at IS NULL);
  END LOOP;
  RETURN jsonb_build_object('comparison_id', v_cmp, 'divergences', v_out, 'closed', 0);
END $fn$;

CREATE OR REPLACE FUNCTION public.mark_shadow_divergences_reported(p_business_id TEXT, p_ids TEXT[])
RETURNS INT LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  WITH u AS (UPDATE public.financial_shadow_divergences SET reported_at = now() WHERE business_id = p_business_id AND id = ANY(p_ids) AND reported_at IS NULL AND confirmed_at IS NOT NULL RETURNING 1)
  SELECT count(*)::int FROM u
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_shadow_divergence(p_business_id TEXT, p_divergence_id TEXT, p_resolution_type TEXT, p_reason TEXT, p_actor TEXT, p_fix_reference TEXT, p_root_cause_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_div public.financial_shadow_divergences%ROWTYPE; v_res TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_resolution_type IS NULL OR p_resolution_type NOT IN ('accepted','fixed','reference_error','duplicate') THEN RAISE EXCEPTION 'financial_shadow_resolution_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF p_actor IS NULL OR btrim(p_actor) = '' OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'financial_shadow_reason_required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO v_div FROM public.financial_shadow_divergences WHERE business_id = p_business_id AND id = p_divergence_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_shadow_divergence_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF v_div.status <> 'open' THEN RAISE EXCEPTION 'financial_shadow_divergence_not_open' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.financial_shadow_divergences SET status = 'resolved', root_cause_code = p_root_cause_code WHERE business_id = p_business_id AND id = p_divergence_id;
  INSERT INTO public.financial_shadow_resolutions (business_id, divergence_id, resolution_type, reason, resolved_by, fix_reference)
    VALUES (p_business_id, p_divergence_id, p_resolution_type, p_reason, p_actor, p_fix_reference) RETURNING id INTO v_res;
  RETURN jsonb_build_object('divergence_id', p_divergence_id, 'resolution_id', v_res, 'status', 'resolved');
END $fn$;

CREATE OR REPLACE FUNCTION public.list_shadow_divergences(p_business_id TEXT, p_status TEXT, p_limit INT)
RETURNS SETOF public.financial_shadow_divergences LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT * FROM public.financial_shadow_divergences WHERE business_id = p_business_id AND status = COALESCE(p_status,'open')
   ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, last_seen_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),500)
$fn$;

CREATE OR REPLACE FUNCTION public.financial_shadow_status(p_business_id TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object(
    'phase', public.financial_kernel_phase(p_business_id),
    'phase_since', (SELECT changed_at FROM public.financial_kernel_rollout r WHERE r.business_id = p_business_id ORDER BY rollout_seq DESC LIMIT 1),
    'last_run', (SELECT to_jsonb(r) FROM public.financial_shadow_runs r WHERE r.business_id = p_business_id ORDER BY started_at DESC LIMIT 1),
    'open', (SELECT COALESCE(jsonb_object_agg(severity, n), '{}'::jsonb) FROM (SELECT severity, count(*) n FROM public.financial_shadow_divergences WHERE business_id = p_business_id AND status = 'open' GROUP BY severity) s),
    'open_confirmed', (SELECT count(*) FROM public.financial_shadow_divergences WHERE business_id = p_business_id AND status = 'open' AND confirmed_at IS NOT NULL),
    'unsupported_levels', '[2,3,4]'::jsonb)
$fn$;

-- Read a bounded, fair candidate set entirely inside PostgreSQL: no unsafe numeric JSON transport.
CREATE OR REPLACE FUNCTION public.list_shadow_candidates(p_business_id TEXT, p_limit INT DEFAULT 200)
RETURNS TABLE(invoice_id TEXT,handymate JSONB) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
  SELECT i.invoice_id,jsonb_build_object('invoice_id',i.invoice_id,'fortnox_document_number',i.fortnox_document_number,
    'status',i.status,'paid_amount',i.paid_amount::text,'total',i.total::text,'customer_pays',i.customer_pays::text,
    'rot_rut_type',i.rot_rut_type,'sent_at',i.sent_at,'phase_started_at',phase.changed_at,
    'projection',CASE WHEN EXISTS(SELECT 1 FROM public.financial_receivables r WHERE r.business_id=i.business_id AND r.invoice_id=i.invoice_id)
      THEN public.financial_invoice_projection(i.business_id,i.invoice_id) ELSE NULL END)
  FROM public.invoice i
  CROSS JOIN LATERAL (SELECT changed_at,phase FROM public.financial_kernel_rollout WHERE business_id=p_business_id ORDER BY rollout_seq DESC LIMIT 1) phase
  LEFT JOIN LATERAL (SELECT max(checked_at) checked_at FROM public.financial_shadow_comparisons c WHERE c.business_id=i.business_id AND c.invoice_id=i.invoice_id) previous ON true
  WHERE i.business_id=p_business_id AND phase.phase='S1' AND
    (EXISTS(SELECT 1 FROM public.financial_receivables r WHERE r.business_id=i.business_id AND r.invoice_id=i.invoice_id)
     OR (i.sent_at >= phase.changed_at))
  ORDER BY previous.checked_at NULLS FIRST,i.invoice_id LIMIT LEAST(GREATEST(COALESCE(p_limit,200),1),200)
$fn$;

-- A raw flag UPDATE cannot bypass the dated rollout. The authorized RPC inserts history first.
CREATE OR REPLACE FUNCTION public.guard_financial_kernel_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
 IF NEW.financial_kernel_enabled IS DISTINCT FROM (public.financial_kernel_phase(NEW.business_id)='S1') THEN
   RAISE EXCEPTION 'financial_kernel_phase_required' USING ERRCODE='check_violation'; END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS guard_financial_kernel_phase ON public.business_config;
CREATE TRIGGER guard_financial_kernel_phase BEFORE INSERT OR UPDATE OF financial_kernel_enabled ON public.business_config
 FOR EACH ROW EXECUTE FUNCTION public.guard_financial_kernel_phase();
REVOKE ALL ON FUNCTION public.guard_financial_kernel_phase() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.financial_kernel_rollout_rollout_seq_seq FROM PUBLIC,anon,authenticated,service_role;

-- ── 9. Privileges: service_role only, like every kernel RPC ──
DO $do$ DECLARE f TEXT; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'list_shadow_candidates(TEXT,INT)', 'financial_kernel_phase(TEXT)', 'set_financial_kernel_phase(TEXT,TEXT,TEXT,TEXT)', 'list_financial_kernel_work()',
    'open_shadow_run(TEXT,TEXT,INT)', 'close_shadow_run(TEXT,TEXT,TEXT,JSONB)', 'record_shadow_snapshot(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT)',
    'record_shadow_comparison(TEXT,TEXT,INT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB)', 'mark_shadow_divergences_reported(TEXT,TEXT[])',
    'resolve_shadow_divergence(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT)', 'list_shadow_divergences(TEXT,TEXT,INT)', 'financial_shadow_status(TEXT)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $do$;

COMMIT;
