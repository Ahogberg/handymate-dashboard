-- C2 only: no callers, no historical backfill, no rollout flag. Not applied remotely.
-- Lock order for C3-C8: business advisory lock first, domain row locks second,
-- append event last. A caller needing row locks must take the same business lock
-- itself before those locks; calling append after taking row locks is forbidden.
-- seq is an ordering cursor per business, NOT gapless. One RPC statement per
-- event; batching is C3. PGlite tests sequential order, not concurrent commits.
-- business_config deletion is deliberately RESTRICT; retention is track G.
BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_events (
  id               TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  seq              BIGSERIAL   NOT NULL,
  business_id      TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  schema_version   INTEGER     NOT NULL CHECK (schema_version >= 1),
  event_type       TEXT        NOT NULL CHECK (event_type IN (
    -- generated from lib/financial-kernel/events/catalog.ts; the contract test verifies parity
    'invoice_issued', 'invoice_credited', 'receivable_created', 'receivable_adjusted', 'receivable_settled',
    'payment_intent_created', 'payment_initiated', 'payment_authorized', 'payment_processing_started',
    'payment_settled', 'payment_failed', 'payment_cancelled', 'payment_refunded', 'payment_disputed',
    'payout_created', 'payout_settled',
    'payment_allocated', 'payment_allocation_reversed', 'bank_transaction_imported',
    'reconciliation_matched', 'reconciliation_unmatched', 'reconciliation_reversed',
    'journal_entry_posted', 'journal_entry_reversed', 'period_locked', 'period_unlocked',
    'payment_divergence_detected', 'accounting_divergence_detected',
    'supplier_invoice_approved', 'payable_created', 'supplier_payment_settled', 'payable_settled'
  )),
  occurred_at      TIMESTAMPTZ NOT NULL,
  effective_date   DATE        NULL,
  source_type      TEXT        NOT NULL CHECK (source_type <> ''),
  source_id        TEXT        NOT NULL CHECK (source_id <> ''),
  correlation_id   TEXT        NOT NULL CHECK (correlation_id LIKE 'fin\_%'),
  causation_id     TEXT        NULL,
  idempotency_key  TEXT        NOT NULL CHECK (idempotency_key <> ''),
  currency         TEXT        NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor     BIGINT      NULL,
  payload          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  actor_type       TEXT        NOT NULL CHECK (actor_type IN ('system','user','provider','import','agent')),
  actor_id         TEXT        NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, idempotency_key),
  UNIQUE (seq),
  FOREIGN KEY (business_id, causation_id) REFERENCES public.financial_events(business_id, id),
  CHECK ((currency IS NULL) = (amount_minor IS NULL)),
  CHECK (actor_type NOT IN ('user','agent') OR actor_id IS NOT NULL),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_financial_events_business_seq
  ON public.financial_events (business_id, seq);
CREATE INDEX IF NOT EXISTS idx_financial_events_correlation
  ON public.financial_events (business_id, correlation_id, seq);
CREATE INDEX IF NOT EXISTS idx_financial_events_type_time
  ON public.financial_events (business_id, event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_financial_events_source
  ON public.financial_events (business_id, source_type, source_id);

-- Immutable. Corrections are new events; there is no second path.
CREATE OR REPLACE FUNCTION public.financial_events_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'financial_events_immutable' USING ERRCODE = 'restrict_violation';
END $fn$;
DROP TRIGGER IF EXISTS financial_events_no_update_delete ON public.financial_events;
CREATE TRIGGER financial_events_no_update_delete
  BEFORE UPDATE OR DELETE ON public.financial_events
  FOR EACH ROW EXECUTE FUNCTION public.financial_events_immutable();

ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events FORCE ROW LEVEL SECURITY;
CREATE POLICY financial_events_tenant_read
  ON public.financial_events FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY financial_events_service_role
  ON public.financial_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.financial_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financial_events TO authenticated;
-- Default grants must not create a second append path that bypasses the lock.
REVOKE ALL ON TABLE public.financial_events FROM service_role;
GRANT SELECT ON TABLE public.financial_events TO service_role;
REVOKE ALL ON SEQUENCE public.financial_events_seq_seq FROM PUBLIC, anon, authenticated, service_role;

-- The only write path. Idempotent per (business_id, idempotency_key); a repeat with a
-- different payload is a bug and raises rather than silently succeeding.
CREATE OR REPLACE FUNCTION public.append_financial_event(
  p_business_id     TEXT,
  p_event_type      TEXT,
  p_schema_version  INTEGER,
  p_occurred_at     TIMESTAMPTZ,
  p_effective_date  DATE,
  p_source_type     TEXT,
  p_source_id       TEXT,
  p_correlation_id  TEXT,
  p_causation_id    TEXT,
  p_idempotency_key TEXT,
  p_currency        TEXT,
  p_amount_minor    BIGINT,
  p_payload         JSONB,
  p_actor_type      TEXT,
  p_actor_id        TEXT
) RETURNS TABLE (event public.financial_events, inserted BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE existing public.financial_events%ROWTYPE;
BEGIN
  IF p_business_id IS NULL OR p_business_id = '' THEN
    RAISE EXCEPTION 'financial_event_business_required' USING ERRCODE = 'check_violation';
  END IF;
  -- Lock order rule 1: business lock before anything else.
  PERFORM pg_advisory_xact_lock(hashtext('financial:' || p_business_id));

  SELECT * INTO existing FROM public.financial_events
   WHERE business_id = p_business_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.event_type <> p_event_type OR existing.payload <> COALESCE(p_payload, '{}'::jsonb)
       OR existing.amount_minor IS DISTINCT FROM p_amount_minor
       OR existing.currency IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION 'financial_event_idempotency_conflict' USING ERRCODE = 'unique_violation',
        DETAIL = existing.id;
    END IF;
    event := existing; inserted := false; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.financial_events (
    business_id, schema_version, event_type, occurred_at, effective_date, source_type, source_id,
    correlation_id, causation_id, idempotency_key, currency, amount_minor, payload, actor_type, actor_id
  ) VALUES (
    p_business_id, p_schema_version, p_event_type, p_occurred_at, p_effective_date, p_source_type, p_source_id,
    p_correlation_id, p_causation_id, p_idempotency_key, p_currency, p_amount_minor,
    COALESCE(p_payload, '{}'::jsonb), p_actor_type, p_actor_id
  ) RETURNING * INTO event;
  inserted := true; RETURN NEXT;
END $fn$;

REVOKE ALL ON FUNCTION public.append_financial_event(
  TEXT, TEXT, INTEGER, TIMESTAMPTZ, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_financial_event(
  TEXT, TEXT, INTEGER, TIMESTAMPTZ, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT, TEXT
) TO service_role;

COMMIT;
