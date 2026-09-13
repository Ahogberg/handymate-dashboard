BEGIN;

-- ── Flags and the two regime fields the events need from day one (FK.1 †) ──
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS financial_kernel_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS accounting_method TEXT NOT NULL DEFAULT 'accrual';
ALTER TABLE public.business_config DROP CONSTRAINT IF EXISTS business_config_accounting_method_check;
ALTER TABLE public.business_config ADD CONSTRAINT business_config_accounting_method_check CHECK (accounting_method IN ('accrual', 'cash'));
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS vat_regime TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE public.invoice DROP CONSTRAINT IF EXISTS invoice_vat_regime_check;
ALTER TABLE public.invoice ADD CONSTRAINT invoice_vat_regime_check CHECK (vat_regime IN ('standard', 'reverse_charge_construction'));

-- ── Receivable components ──
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_business_invoice ON public.invoice(business_id,invoice_id);
CREATE TABLE IF NOT EXISTS public.financial_receivables (
  id                TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id       TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  invoice_id        TEXT        NOT NULL REFERENCES public.invoice(invoice_id) ON DELETE RESTRICT,
  component         TEXT        NOT NULL CHECK (component IN ('customer', 'tax_authority')),
  owner             TEXT        NOT NULL DEFAULT 'business' CHECK (owner IN ('business', 'factor')),
  origin            TEXT        NOT NULL DEFAULT 'invoice' CHECK (origin IN ('invoice', 'opening_balance')),
  currency          TEXT        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor      BIGINT      NOT NULL CHECK (amount_minor >= 0),
  adjusted_minor    BIGINT      NOT NULL DEFAULT 0,
  allocated_minor   BIGINT      NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  status            TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'closed')),
  due_date          DATE        NULL,
  created_event_id  TEXT        NOT NULL,
  settled_event_id  TEXT        NULL,
  settled_at        TIMESTAMPTZ NULL,
  closed_at         TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, invoice_id, component),
  FOREIGN KEY (business_id, invoice_id) REFERENCES public.invoice(business_id, invoice_id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, created_event_id) REFERENCES public.financial_events(business_id, id),
  FOREIGN KEY (business_id, settled_event_id) REFERENCES public.financial_events(business_id, id),
  -- outstanding = amount + adjusted - allocated, never negative; exact, no tolerance
  CHECK (amount_minor + adjusted_minor - allocated_minor >= 0),
  CHECK ((status = 'settled') = (settled_event_id IS NOT NULL)),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_receivables_open ON public.financial_receivables (business_id, status, due_date);

-- ── Payments (money movement) ──
CREATE TABLE IF NOT EXISTS public.financial_payments (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id        TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  provider           TEXT        NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_ref       TEXT        NULL,
  direction          TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  method             TEXT        NULL,
  currency           TEXT        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor       BIGINT      NOT NULL CHECK (amount_minor > 0),
  fee_minor          BIGINT      NULL CHECK (fee_minor IS NULL OR fee_minor >= 0),
  status             TEXT        NOT NULL CHECK (status IN ('pending', 'settled', 'failed', 'cancelled')),
  evidence           TEXT        NULL CHECK (evidence IS NULL OR evidence IN ('provider', 'manual', 'fortnox', 'bank')),
  settled_at         TIMESTAMPTZ NULL,
  allocated_minor    BIGINT      NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  actor_type         TEXT        NOT NULL,
  actor_id           TEXT        NULL,
  idempotency_key    TEXT        NOT NULL,
  correlation_id     TEXT        NOT NULL,
  initiated_event_id TEXT        NOT NULL,
  settled_event_id   TEXT        NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id, initiated_event_id) REFERENCES public.financial_events(business_id, id),
  FOREIGN KEY (business_id, settled_event_id) REFERENCES public.financial_events(business_id, id),
  CHECK (allocated_minor <= amount_minor),
  CHECK ((status = 'settled') = (settled_event_id IS NOT NULL)),
  CHECK ((status = 'settled') = (settled_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_payments_provider_ref
  ON public.financial_payments (business_id, provider, provider_ref) WHERE provider_ref IS NOT NULL;

-- ── Allocations ──
CREATE TABLE IF NOT EXISTS public.financial_payment_allocations (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id        TEXT        NOT NULL,
  payment_id         TEXT        NOT NULL,
  receivable_id      TEXT        NOT NULL,
  currency           TEXT        NOT NULL,
  amount_minor       BIGINT      NOT NULL CHECK (amount_minor > 0),
  idempotency_key    TEXT        NOT NULL,
  event_id           TEXT        NOT NULL,
  reversed_at        TIMESTAMPTZ NULL,
  reversal_reason    TEXT        NULL,
  reversal_event_id  TEXT        NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id, payment_id) REFERENCES public.financial_payments(business_id, id),
  FOREIGN KEY (business_id, receivable_id) REFERENCES public.financial_receivables(business_id, id),
  FOREIGN KEY (business_id, event_id) REFERENCES public.financial_events(business_id, id),
  FOREIGN KEY (business_id, reversal_event_id) REFERENCES public.financial_events(business_id, id),
  CHECK ((reversed_at IS NULL) = (reversal_event_id IS NULL))
);

-- ── Adjustments (credit, write-off, fees, interest, rounding, ownership, reclassification) ──
CREATE TABLE IF NOT EXISTS public.financial_receivable_adjustments (
  id                        TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id               TEXT        NOT NULL,
  receivable_id             TEXT        NOT NULL,
  reason                    TEXT        NOT NULL CHECK (reason IN ('credit', 'write_off', 'dunning_fee', 'interest', 'rounding', 'ownership_transfer', 'reclassification')),
  delta_minor               BIGINT      NOT NULL,
  owner_after               TEXT        NULL CHECK (owner_after IS NULL OR owner_after IN ('business', 'factor')),
  counterpart_receivable_id TEXT        NULL,
  source_type               TEXT        NULL,
  source_id                 TEXT        NULL,
  idempotency_key           TEXT        NOT NULL,
  event_id                  TEXT        NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id, receivable_id) REFERENCES public.financial_receivables(business_id, id),
  FOREIGN KEY (business_id, counterpart_receivable_id) REFERENCES public.financial_receivables(business_id, id),
  FOREIGN KEY (business_id, event_id) REFERENCES public.financial_events(business_id, id)
);

-- ── RLS: members read, nobody writes except the RPCs (owner) ──
DO $rls$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_receivables', 'financial_payments', 'financial_payment_allocations', 'financial_receivable_adjustments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t || '_tenant_read', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', t);
  END LOOP;
END $rls$;

-- ── Private helpers ──
CREATE OR REPLACE FUNCTION public.financial_lock(p_business_id TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF p_business_id IS NULL OR p_business_id = '' THEN RAISE EXCEPTION 'financial_business_required' USING ERRCODE = 'check_violation'; END IF;
  -- Lock order rule 1 (v235 header): business lock before any row lock.
  PERFORM pg_advisory_xact_lock(hashtext('financial:' || p_business_id));
END $fn$;

-- Appends through the C2 RPC so every event carries the same envelope rules. Returns the event id.
CREATE OR REPLACE FUNCTION public.financial_append(
  p_business_id TEXT, p_event_type TEXT, p_occurred_at TIMESTAMPTZ, p_effective_date DATE,
  p_source_type TEXT, p_source_id TEXT, p_correlation_id TEXT, p_causation_id TEXT, p_idempotency_key TEXT,
  p_currency TEXT, p_amount_minor BIGINT, p_payload JSONB, p_actor_type TEXT, p_actor_id TEXT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_id TEXT;
BEGIN
  -- Keep event payload minor units lossless through JSON/PostgREST as well as RPC results.
  SELECT jsonb_object_agg(k,CASE WHEN k LIKE '%\_minor' ESCAPE '\' AND jsonb_typeof(v)='number'
    THEN to_jsonb(v#>>'{}') ELSE v END) INTO p_payload FROM jsonb_each(p_payload) AS fields(k,v);
  SELECT r.id INTO v_id FROM public.append_financial_event(
    p_business_id, p_event_type, 1, p_occurred_at, p_effective_date, p_source_type, p_source_id,
    p_correlation_id, p_causation_id, p_idempotency_key, p_currency, p_amount_minor, p_payload, p_actor_type, p_actor_id) r;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.financial_receivable_json(r public.financial_receivables) RETURNS JSONB
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_build_object(
    'id', r.id, 'invoice_id', r.invoice_id, 'component', r.component, 'owner', r.owner, 'origin', r.origin,
    'currency', r.currency, 'amount_minor', r.amount_minor::text, 'adjusted_minor', r.adjusted_minor::text,
    'allocated_minor', r.allocated_minor::text, 'outstanding_minor', (r.amount_minor + r.adjusted_minor - r.allocated_minor)::text,
    'status', r.status, 'due_date', r.due_date, 'settled_at', r.settled_at)
$fn$;

-- ── RPC 1: issue receivables for an invoice (C5 calls it when an invoice is sent/issued) ──
CREATE OR REPLACE FUNCTION public.issue_invoice_receivables(
  p_business_id TEXT, p_invoice_id TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE inv RECORD; v_method TEXT; v_total BIGINT; v_customer BIGINT; v_tax BIGINT;
        v_issued TEXT; v_ev TEXT; v_corr TEXT; existing JSONB; r public.financial_receivables%ROWTYPE;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT i.invoice_id, i.invoice_number, i.customer_id, i.project_id, i.total, i.customer_pays, i.rot_rut_deduction,
         i.rot_rut_type, i.vat_regime, i.invoice_date, i.due_date
    INTO inv FROM public.invoice i WHERE i.invoice_id = p_invoice_id AND i.business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_invoice_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF inv.total IS NULL THEN RAISE EXCEPTION 'financial_invoice_total_required' USING ERRCODE = 'check_violation'; END IF;

  SELECT jsonb_agg(public.financial_receivable_json(x) ORDER BY x.component) INTO existing
    FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id;
  IF existing IS NOT NULL THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'inserted', false, 'receivables', existing);
  END IF;

  SELECT b.accounting_method INTO v_method FROM public.business_config b WHERE b.business_id = p_business_id;
  -- Legacy NUMERIC kr -> exact öre at the boundary. round() is half away from zero = Money HALF_UP.
  v_total := round(inv.total * 100)::bigint;
  IF inv.rot_rut_type IN ('rot', 'rut') THEN
    -- Match getCustomerShare's fallback for legacy customer_pays defaulted to total.
    v_customer := round((CASE
      WHEN inv.customer_pays > 0 AND inv.customer_pays < inv.total THEN inv.customer_pays
      WHEN inv.rot_rut_deduction > 0 AND inv.rot_rut_deduction < inv.total THEN inv.total - inv.rot_rut_deduction
      ELSE inv.total END) * 100)::bigint;
    v_tax := v_total - v_customer;
    IF v_tax < 0 OR v_customer < 0 THEN RAISE EXCEPTION 'financial_invoice_split_invalid' USING ERRCODE = 'check_violation'; END IF;
  ELSE
    v_customer := v_total; v_tax := 0;
  END IF;
  v_corr := 'fin_invoice_' || p_invoice_id;

  v_issued := public.financial_append(p_business_id, 'invoice_issued', now(), inv.invoice_date, 'invoice', p_invoice_id, v_corr, NULL,
    'invoice_issued:invoice:' || p_invoice_id, 'SEK', v_total,
    jsonb_build_object('invoice_id', p_invoice_id, 'invoice_number', inv.invoice_number, 'customer_id', inv.customer_id,
      'project_id', inv.project_id, 'currency', 'SEK', 'total_minor', v_total, 'vat_regime', inv.vat_regime,
      'accounting_method', v_method, 'issued_date', inv.invoice_date, 'due_date', inv.due_date,
      'tax_reduction', CASE WHEN inv.rot_rut_type IN ('rot', 'rut') THEN inv.rot_rut_type END),
    p_actor_type, p_actor_id);

  r.id := gen_random_uuid()::text;
  v_ev := public.financial_append(p_business_id, 'receivable_created', now(), inv.invoice_date, 'invoice', p_invoice_id, v_corr, v_issued,
    'receivable_created:invoice:' || p_invoice_id || ':customer', 'SEK', v_customer,
    jsonb_build_object('receivable_id',r.id,'invoice_id', p_invoice_id, 'component', 'customer', 'owner', 'business', 'currency', 'SEK', 'amount_minor', v_customer, 'due_date', inv.due_date),
    p_actor_type, p_actor_id);
  INSERT INTO public.financial_receivables (id,business_id, invoice_id, component, currency, amount_minor, due_date, created_event_id)
    VALUES (r.id,p_business_id, p_invoice_id, 'customer', 'SEK', v_customer, inv.due_date, v_ev);

  IF v_tax > 0 THEN
    r.id := gen_random_uuid()::text;
    v_ev := public.financial_append(p_business_id, 'receivable_created', now(), inv.invoice_date, 'invoice', p_invoice_id, v_corr, v_issued,
      'receivable_created:invoice:' || p_invoice_id || ':tax_authority', 'SEK', v_tax,
      jsonb_build_object('receivable_id',r.id,'invoice_id', p_invoice_id, 'component', 'tax_authority', 'owner', 'business', 'currency', 'SEK', 'amount_minor', v_tax, 'due_date', inv.due_date),
      p_actor_type, p_actor_id);
    INSERT INTO public.financial_receivables (id,business_id, invoice_id, component, currency, amount_minor, due_date, created_event_id)
      VALUES (r.id,p_business_id, p_invoice_id, 'tax_authority', 'SEK', v_tax, inv.due_date, v_ev);
  END IF;

  SELECT jsonb_agg(public.financial_receivable_json(x) ORDER BY x.component) INTO existing
    FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id;
  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'inserted', true, 'receivables', existing);
END $fn$;

-- ── RPC 2: a settled payment (manual, Fortnox import, Skatteverket payout; later PSP) ──
CREATE OR REPLACE FUNCTION public.record_payment_settlement(
  p_business_id TEXT, p_provider TEXT, p_provider_ref TEXT, p_direction TEXT, p_method TEXT,
  p_currency TEXT, p_amount_minor BIGINT, p_fee_minor BIGINT, p_evidence TEXT, p_settled_at TIMESTAMPTZ,
  p_correlation_id TEXT, p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE existing public.financial_payments%ROWTYPE; v_id TEXT; v_corr TEXT; v_init TEXT; v_settled TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO existing FROM public.financial_payments p WHERE p.business_id = p_business_id AND p.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.amount_minor IS DISTINCT FROM p_amount_minor OR existing.currency IS DISTINCT FROM p_currency
       OR existing.provider IS DISTINCT FROM p_provider OR existing.provider_ref IS DISTINCT FROM p_provider_ref
       OR existing.direction IS DISTINCT FROM p_direction OR existing.method IS DISTINCT FROM p_method
       OR existing.fee_minor IS DISTINCT FROM p_fee_minor OR existing.evidence IS DISTINCT FROM p_evidence
       OR (p_settled_at IS NOT NULL AND existing.settled_at IS DISTINCT FROM p_settled_at)
       OR (p_correlation_id IS NOT NULL AND existing.correlation_id IS DISTINCT FROM p_correlation_id) THEN
      RAISE EXCEPTION 'financial_payment_idempotency_conflict' USING ERRCODE = 'unique_violation', DETAIL = existing.id;
    END IF;
    RETURN jsonb_build_object('payment_id', existing.id, 'inserted', false, 'amount_minor', existing.amount_minor::text,
      'unallocated_minor', (existing.amount_minor - existing.allocated_minor)::text, 'currency',existing.currency,'status', existing.status);
  END IF;
  v_id := gen_random_uuid()::TEXT;
  v_corr := COALESCE(p_correlation_id, 'fin_payment_' || v_id);
  v_init := public.financial_append(p_business_id, 'payment_initiated', COALESCE(p_settled_at, now()), p_settled_at::date, 'payment', v_id, v_corr, NULL,
    'payment_initiated:' || p_provider || ':' || p_idempotency_key, p_currency, p_amount_minor,
    jsonb_build_object('payment_id', v_id, 'provider', p_provider, 'provider_ref', p_provider_ref, 'direction', p_direction, 'currency', p_currency, 'amount_minor', p_amount_minor),
    p_actor_type, p_actor_id);
  v_settled := public.financial_append(p_business_id, 'payment_settled', COALESCE(p_settled_at, now()), p_settled_at::date, 'payment', v_id, v_corr, v_init,
    'payment_settled:' || p_provider || ':' || p_idempotency_key, p_currency, p_amount_minor,
    jsonb_build_object('payment_id', v_id, 'currency', p_currency, 'amount_minor', p_amount_minor, 'fee_minor', p_fee_minor, 'settled_at', COALESCE(p_settled_at, now()), 'evidence', p_evidence),
    p_actor_type, p_actor_id);
  INSERT INTO public.financial_payments (id, business_id, provider, provider_ref, direction, method, currency, amount_minor, fee_minor, status, evidence,
      settled_at, actor_type, actor_id, idempotency_key, correlation_id, initiated_event_id, settled_event_id)
    VALUES (v_id, p_business_id, p_provider, p_provider_ref, p_direction, p_method, p_currency, p_amount_minor, p_fee_minor, 'settled', p_evidence,
      COALESCE(p_settled_at, now()), p_actor_type, p_actor_id, p_idempotency_key, v_corr, v_init, v_settled);
  RETURN jsonb_build_object('payment_id', v_id, 'inserted', true, 'amount_minor', p_amount_minor::text, 'unallocated_minor', p_amount_minor::text, 'currency',p_currency,'status', 'settled');
END $fn$;

-- ── RPC 3: allocate part of a settled payment to one receivable component ──
CREATE OR REPLACE FUNCTION public.allocate_payment(
  p_business_id TEXT, p_payment_id TEXT, p_receivable_id TEXT, p_amount_minor BIGINT,
  p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT, p_currency TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE pay public.financial_payments%ROWTYPE; rec public.financial_receivables%ROWTYPE; al public.financial_payment_allocations%ROWTYPE;
        v_corr TEXT; v_ev TEXT; v_settled_ev TEXT; v_outstanding BIGINT; v_settled BOOLEAN := false;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO al FROM public.financial_payment_allocations a WHERE a.business_id = p_business_id AND a.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF al.payment_id IS DISTINCT FROM p_payment_id OR al.receivable_id IS DISTINCT FROM p_receivable_id
       OR al.amount_minor IS DISTINCT FROM p_amount_minor OR (p_currency IS NOT NULL AND al.currency IS DISTINCT FROM p_currency) THEN
      RAISE EXCEPTION 'financial_allocation_idempotency_conflict' USING ERRCODE='unique_violation';
    END IF;
    SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = al.receivable_id;
    SELECT * INTO pay FROM public.financial_payments x WHERE x.business_id=p_business_id AND x.id=al.payment_id;
    RETURN jsonb_build_object('allocation_id', al.id, 'inserted', false, 'receivable_settled', rec.status = 'settled', 'component', rec.component,
      'outstanding_minor', (rec.amount_minor + rec.adjusted_minor - rec.allocated_minor)::text,
      'currency',rec.currency,'payment_unallocated_minor',(pay.amount_minor-pay.allocated_minor)::text);
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'financial_allocation_amount_invalid' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO pay FROM public.financial_payments p WHERE p.business_id = p_business_id AND p.id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_payment_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_receivable_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF pay.status <> 'settled' OR pay.direction <> 'inbound' THEN RAISE EXCEPTION 'financial_payment_status_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF rec.status <> 'open' THEN RAISE EXCEPTION 'financial_receivable_not_open' USING ERRCODE = 'check_violation'; END IF;
  IF pay.currency <> rec.currency OR (p_currency IS NOT NULL AND p_currency <> rec.currency) THEN RAISE EXCEPTION 'financial_currency_mismatch' USING ERRCODE = 'check_violation'; END IF;
  IF p_amount_minor > pay.amount_minor - pay.allocated_minor THEN RAISE EXCEPTION 'financial_allocation_exceeds_payment' USING ERRCODE = 'check_violation'; END IF;
  v_outstanding := rec.amount_minor + rec.adjusted_minor - rec.allocated_minor;
  IF p_amount_minor > v_outstanding THEN RAISE EXCEPTION 'financial_allocation_exceeds_receivable' USING ERRCODE = 'check_violation'; END IF;

  v_corr := 'fin_invoice_' || rec.invoice_id;
  al.id := gen_random_uuid()::TEXT;
  v_ev := public.financial_append(p_business_id, 'payment_allocated', now(), pay.settled_at::date, 'allocation', al.id, v_corr, pay.settled_event_id,
    'payment_allocated:' || p_idempotency_key, rec.currency, p_amount_minor,
    jsonb_build_object('allocation_id', al.id, 'payment_id', pay.id, 'receivable_id', rec.id, 'currency', rec.currency, 'amount_minor', p_amount_minor),
    p_actor_type, p_actor_id);
  INSERT INTO public.financial_payment_allocations (id, business_id, payment_id, receivable_id, currency, amount_minor, idempotency_key, event_id)
    VALUES (al.id, p_business_id, pay.id, rec.id, rec.currency, p_amount_minor, p_idempotency_key, v_ev);
  UPDATE public.financial_payments SET allocated_minor = allocated_minor + p_amount_minor WHERE id = pay.id;
  UPDATE public.financial_receivables SET allocated_minor = allocated_minor + p_amount_minor WHERE id = rec.id;
  v_outstanding := v_outstanding - p_amount_minor;
  IF v_outstanding = 0 THEN
    v_settled := true;
    v_settled_ev := public.financial_append(p_business_id, 'receivable_settled', now(), pay.settled_at::date, 'receivable', rec.id, v_corr, v_ev,
      'receivable_settled:' || rec.id || ':' || v_ev, NULL, NULL,
      jsonb_build_object('receivable_id', rec.id, 'invoice_id', rec.invoice_id, 'component', rec.component, 'settled_at', now()),
      p_actor_type, p_actor_id);
    UPDATE public.financial_receivables SET status = 'settled', settled_at = now(), settled_event_id = v_settled_ev WHERE id = rec.id;
  END IF;
  RETURN jsonb_build_object('allocation_id', al.id, 'inserted', true, 'receivable_settled', v_settled, 'component', rec.component,
    'outstanding_minor', v_outstanding::text, 'currency',rec.currency,'payment_unallocated_minor', (pay.amount_minor - pay.allocated_minor - p_amount_minor)::text);
END $fn$;

-- ── RPC 4: adjust a receivable (never touches allocations; closes at zero without a settlement) ──
CREATE OR REPLACE FUNCTION public.adjust_receivable(
  p_business_id TEXT, p_receivable_id TEXT, p_reason TEXT, p_delta_minor BIGINT, p_owner_after TEXT,
  p_source_type TEXT, p_source_id TEXT, p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT, p_currency TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE rec public.financial_receivables%ROWTYPE; sib public.financial_receivables%ROWTYPE; adj public.financial_receivable_adjustments%ROWTYPE;
        v_corr TEXT; v_ev TEXT; v_ev2 TEXT; v_outstanding BIGINT; v_sib_id TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO adj FROM public.financial_receivable_adjustments a WHERE a.business_id = p_business_id AND a.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF adj.receivable_id IS DISTINCT FROM p_receivable_id OR adj.reason IS DISTINCT FROM p_reason
       OR adj.delta_minor IS DISTINCT FROM p_delta_minor OR adj.owner_after IS DISTINCT FROM p_owner_after
       OR adj.source_type IS DISTINCT FROM p_source_type OR adj.source_id IS DISTINCT FROM p_source_id THEN
      RAISE EXCEPTION 'financial_adjustment_idempotency_conflict' USING ERRCODE='unique_violation';
    END IF;
    SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = adj.receivable_id;
    IF p_currency IS NOT NULL AND rec.currency <> p_currency THEN RAISE EXCEPTION 'financial_currency_mismatch' USING ERRCODE='check_violation'; END IF;
    RETURN jsonb_build_object('adjustment_id', adj.id, 'inserted', false, 'receivable_settled',rec.status='settled','component',rec.component,'receivable', public.financial_receivable_json(rec));
  END IF;
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_receivable_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF rec.status <> 'open' THEN RAISE EXCEPTION 'financial_receivable_not_open' USING ERRCODE = 'check_violation'; END IF;
  IF p_currency IS NOT NULL AND rec.currency <> p_currency THEN RAISE EXCEPTION 'financial_currency_mismatch' USING ERRCODE='check_violation'; END IF;
  IF p_delta_minor IS NULL THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE='check_violation'; END IF;
  IF p_reason <> 'ownership_transfer' AND p_owner_after IS NOT NULL THEN RAISE EXCEPTION 'financial_ownership_transfer_invalid' USING ERRCODE='check_violation'; END IF;
  CASE p_reason
    WHEN 'credit', 'write_off' THEN IF p_delta_minor >= 0 THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE = 'check_violation'; END IF;
    WHEN 'dunning_fee', 'interest' THEN IF p_delta_minor <= 0 THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE = 'check_violation'; END IF;
    WHEN 'rounding' THEN IF p_delta_minor = 0 THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE = 'check_violation'; END IF;
      -- Magnitude is policy (C1b), deliberately not checked here. Callers apply the country pack's policy first.
    WHEN 'ownership_transfer' THEN
      IF p_delta_minor <> 0 OR p_owner_after IS NULL OR p_owner_after = rec.owner THEN RAISE EXCEPTION 'financial_ownership_transfer_invalid' USING ERRCODE = 'check_violation'; END IF;
    WHEN 'reclassification' THEN
      IF p_delta_minor >= 0 THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE = 'check_violation'; END IF;
      SELECT * INTO sib FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = rec.invoice_id AND x.component <> rec.component FOR UPDATE;
      IF NOT FOUND OR sib.status <> 'open' THEN RAISE EXCEPTION 'financial_reclassification_no_open_counterpart' USING ERRCODE = 'check_violation'; END IF;
    ELSE RAISE EXCEPTION 'financial_adjustment_reason_invalid' USING ERRCODE = 'check_violation';
  END CASE;
  v_outstanding := rec.amount_minor + rec.adjusted_minor - rec.allocated_minor + p_delta_minor;
  IF v_outstanding < 0 THEN RAISE EXCEPTION 'financial_adjustment_exceeds_outstanding' USING ERRCODE = 'check_violation'; END IF;

  v_corr := 'fin_invoice_' || rec.invoice_id;
  adj.id := gen_random_uuid()::TEXT;
  v_ev := public.financial_append(p_business_id, 'receivable_adjusted', now(), now()::date, COALESCE(p_source_type, 'receivable'), COALESCE(p_source_id, rec.id), v_corr, rec.created_event_id,
    'receivable_adjusted:' || p_idempotency_key, rec.currency, p_delta_minor,
    jsonb_build_object('receivable_id', rec.id, 'reason', p_reason, 'delta_minor', p_delta_minor, 'owner_after', p_owner_after,
      'from_component', CASE WHEN p_reason = 'reclassification' THEN rec.component END, 'to_component', CASE WHEN p_reason = 'reclassification' THEN sib.component END),
    p_actor_type, p_actor_id);
  INSERT INTO public.financial_receivable_adjustments (id, business_id, receivable_id, reason, delta_minor, owner_after, counterpart_receivable_id, source_type, source_id, idempotency_key, event_id)
    VALUES (adj.id, p_business_id, rec.id, p_reason, p_delta_minor, p_owner_after, sib.id, p_source_type, p_source_id, p_idempotency_key, v_ev);
  -- Zero outstanding after an adjustment: a ROUNDING adjustment on a receivable that has an
  -- allocation completes a payment (golden path 36) and therefore SETTLES it — the bridge fires.
  -- Every other reason (credit, write-off, reclassification) CLOSES it silently: no customer
  -- paid, no receivable_settled, no payment_received (golden path 10).
  IF v_outstanding = 0 AND p_reason = 'rounding' AND rec.allocated_minor > 0 THEN
    v_ev2 := public.financial_append(p_business_id, 'receivable_settled', now(), now()::date, 'receivable', rec.id, v_corr, v_ev,
      'receivable_settled:' || rec.id || ':' || v_ev, NULL, NULL,
      jsonb_build_object('receivable_id', rec.id, 'invoice_id', rec.invoice_id, 'component', rec.component, 'settled_at', now()),
      p_actor_type, p_actor_id);
    UPDATE public.financial_receivables SET adjusted_minor = adjusted_minor + p_delta_minor,
      status = 'settled', settled_at = now(), settled_event_id = v_ev2 WHERE id = rec.id;
  ELSE
    UPDATE public.financial_receivables SET adjusted_minor = adjusted_minor + p_delta_minor,
      owner = COALESCE(p_owner_after, owner),
      status = CASE WHEN v_outstanding = 0 THEN 'closed' ELSE status END,
      closed_at = CASE WHEN v_outstanding = 0 THEN now() ELSE closed_at END
     WHERE id = rec.id;
  END IF;

  IF p_reason = 'reclassification' THEN
    v_ev2 := public.financial_append(p_business_id, 'receivable_adjusted', now(), now()::date, COALESCE(p_source_type, 'receivable'), COALESCE(p_source_id, rec.id), v_corr, v_ev,
      'receivable_adjusted:' || p_idempotency_key || ':counterpart', rec.currency, -p_delta_minor,
      jsonb_build_object('receivable_id', sib.id, 'reason', 'reclassification', 'delta_minor', -p_delta_minor, 'from_component', rec.component, 'to_component', sib.component),
      p_actor_type, p_actor_id);
    INSERT INTO public.financial_receivable_adjustments (business_id, receivable_id, reason, delta_minor, counterpart_receivable_id, source_type, source_id, idempotency_key, event_id)
      VALUES (p_business_id, sib.id, 'reclassification', -p_delta_minor, rec.id, p_source_type, p_source_id, p_idempotency_key || ':counterpart', v_ev2);
    UPDATE public.financial_receivables SET adjusted_minor = adjusted_minor - p_delta_minor WHERE id = sib.id;
  END IF;
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.id = rec.id;
  RETURN jsonb_build_object('adjustment_id', adj.id, 'inserted', true, 'receivable_settled', rec.status = 'settled', 'component', rec.component,
    'receivable', public.financial_receivable_json(rec));
END $fn$;

-- ── RPC 5: reverse an allocation (misallocation, refund); reopens a settled receivable ──
CREATE OR REPLACE FUNCTION public.reverse_payment_allocation(
  p_business_id TEXT, p_allocation_id TEXT, p_reason TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE al public.financial_payment_allocations%ROWTYPE; rec public.financial_receivables%ROWTYPE; v_ev TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'financial_reversal_requires_reason' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO al FROM public.financial_payment_allocations a WHERE a.business_id = p_business_id AND a.id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_allocation_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF al.reversed_at IS NOT NULL THEN
    IF al.reversal_reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'financial_reversal_idempotency_conflict' USING ERRCODE='unique_violation'; END IF;
    RETURN jsonb_build_object('allocation_id', al.id, 'inserted', false, 'receivable_reopened',false,'reversed_at', al.reversed_at);
  END IF;
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = al.receivable_id FOR UPDATE;
  IF rec.status = 'closed' THEN RAISE EXCEPTION 'financial_receivable_state_invalid' USING ERRCODE = 'check_violation'; END IF;
  v_ev := public.financial_append(p_business_id, 'payment_allocation_reversed', now(), now()::date, 'allocation', al.id, 'fin_invoice_' || rec.invoice_id, al.event_id,
    'payment_allocation_reversed:' || al.id, al.currency, -al.amount_minor,
    jsonb_build_object('allocation_id', al.id, 'reason', p_reason), p_actor_type, p_actor_id);
  UPDATE public.financial_payment_allocations SET reversed_at = now(), reversal_reason = p_reason, reversal_event_id = v_ev WHERE id = al.id;
  UPDATE public.financial_payments SET allocated_minor = allocated_minor - al.amount_minor WHERE id = al.payment_id;
  UPDATE public.financial_receivables SET allocated_minor = allocated_minor - al.amount_minor, status = 'open', settled_at = NULL, settled_event_id = NULL WHERE id = rec.id;
  RETURN jsonb_build_object('allocation_id', al.id, 'inserted', true, 'receivable_reopened', rec.status = 'settled');
END $fn$;

REVOKE ALL ON FUNCTION public.financial_lock(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_append(TEXT, TEXT, TIMESTAMPTZ, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_receivable_json(public.financial_receivables) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_invoice_receivables(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment_settlement(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_payment(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_receivable(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_payment_allocation(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice_receivables(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_settlement(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_payment(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_receivable(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_payment_allocation(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.financial_kernel_flags(p_business_id TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object('financial_kernel_enabled',financial_kernel_enabled,'accounting_method',accounting_method)
  FROM public.business_config WHERE business_id=p_business_id
$fn$;
REVOKE ALL ON FUNCTION public.financial_kernel_flags(TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.financial_kernel_flags(TEXT) TO service_role;

COMMIT;
