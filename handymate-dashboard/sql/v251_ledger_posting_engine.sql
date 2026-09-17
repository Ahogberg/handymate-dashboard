-- C8 — Ledger schema + posting engine (Claude draft 2026-09-15, NOT applied).
-- Country-neutral core (blueprint §13–§15): accounts, fiscal years, periods, journals,
-- entries, lines, atomic posting, balance invariant, provenance, reversal, period lock.
-- No BAS number, no series letter and no VAT rule is decided here (§36.6): the SE pack (C9)
-- and a named consultant own those. This file ships zero account rows.
-- Same lock order as v235/v238: financial_lock → row locks → append event, one transaction.
-- Money is BIGINT minor units, strings across JSON, exactly as v235/v238 (blueprint §5 says
-- NUMERIC(20,4); the kernel decided minor units in C1/C2 and Ledger follows the kernel).
BEGIN;

-- ── Accounts. `number` is text: BAS is a country pack, not the core. ──
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id            TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id   TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  number        TEXT NOT NULL CHECK (number ~ '^[0-9A-Za-z][0-9A-Za-z._-]{0,15}$'),
  name          TEXT NOT NULL CHECK (btrim(name) <> ''),
  type          TEXT NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  active        BOOLEAN NOT NULL DEFAULT true,
  -- Where the row came from and who, by name, confirmed it (review protocol §6 D).
  source        TEXT NOT NULL CHECK (source IN ('proposal','sie_import','manual')),
  confirmed_by  TEXT NULL CHECK (confirmed_by IS NULL OR btrim(confirmed_by) <> ''),
  confirmed_at  TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id), UNIQUE (business_id, id), UNIQUE (business_id, number),
  CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);

-- ── Fiscal years and periods. Periods are calendar months inside the year. ──
CREATE TABLE IF NOT EXISTS public.ledger_fiscal_years (
  id            TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id   TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  starts_on     DATE NOT NULL,
  ends_on       DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id), UNIQUE (business_id, id), UNIQUE (business_id, starts_on),
  CHECK (ends_on > starts_on),
  CHECK (extract(day FROM starts_on) = 1),
  CHECK (ends_on = (date_trunc('month', ends_on) + interval '1 month - 1 day')::date),
  -- A first (broken) year may run up to 18 months; never less than one.
  CHECK (ends_on <= (starts_on + interval '18 months' - interval '1 day')::date)
);

CREATE TABLE IF NOT EXISTS public.ledger_periods (
  id              TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id     TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  fiscal_year_id  TEXT NOT NULL,
  starts_on       DATE NOT NULL,
  ends_on         DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked')),
  locked_at       TIMESTAMPTZ NULL,
  locked_by       TEXT NULL,
  lock_event_id   TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id), UNIQUE (business_id, id), UNIQUE (business_id, starts_on),
  FOREIGN KEY (business_id, fiscal_year_id) REFERENCES public.ledger_fiscal_years(business_id, id),
  FOREIGN KEY (business_id, lock_event_id) REFERENCES public.financial_events(business_id, id),
  CHECK (ends_on > starts_on),
  CHECK ((status = 'locked') = (locked_at IS NOT NULL)),
  CHECK ((status = 'locked') = (lock_event_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_ledger_periods_lookup ON public.ledger_periods (business_id, starts_on, ends_on);

-- ── Journals (voucher series) and gapless counters per series and fiscal year. ──
CREATE TABLE IF NOT EXISTS public.ledger_journals (
  id            TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id   TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  series        TEXT NOT NULL CHECK (series ~ '^[A-Z][A-Z0-9]{0,5}$'),
  name          TEXT NOT NULL CHECK (btrim(name) <> ''),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id), UNIQUE (business_id, id), UNIQUE (business_id, series)
);
CREATE TABLE IF NOT EXISTS public.ledger_voucher_counters (
  business_id     TEXT NOT NULL,
  journal_id      TEXT NOT NULL,
  fiscal_year_id  TEXT NOT NULL,
  next_number     INTEGER NOT NULL CHECK (next_number >= 1),
  PRIMARY KEY (business_id, journal_id, fiscal_year_id),
  FOREIGN KEY (business_id, journal_id) REFERENCES public.ledger_journals(business_id, id),
  FOREIGN KEY (business_id, fiscal_year_id) REFERENCES public.ledger_fiscal_years(business_id, id)
);

-- ── Entries and lines. Immutable once posted; a reversal is a new entry. ──
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id                    TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id           TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  journal_id            TEXT NOT NULL,
  fiscal_year_id        TEXT NOT NULL,
  period_id             TEXT NOT NULL,
  voucher_number        INTEGER NOT NULL CHECK (voucher_number >= 1),
  journal_type          TEXT NOT NULL CHECK (journal_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  effective_date        DATE NOT NULL,
  posted_at             TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  currency              TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_minor           BIGINT NOT NULL CHECK (total_minor > 0),
  description           TEXT NOT NULL CHECK (btrim(description) <> ''),
  source_event_id       TEXT NULL,
  correlation_id        TEXT NOT NULL CHECK (correlation_id LIKE 'fin\_%'),
  posting_rule_id       TEXT NOT NULL CHECK (posting_rule_id ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  posting_rule_version  INTEGER NOT NULL CHECK (posting_rule_version >= 0),
  reversal_of_entry_id  TEXT NULL,
  reversed_by_entry_id  TEXT NULL,
  status                TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  idempotency_key       TEXT NOT NULL CHECK (idempotency_key <> ''),
  request_hash          TEXT NOT NULL,
  posted_event_id       TEXT NOT NULL,
  actor_type            TEXT NOT NULL CHECK (actor_type IN ('system','user','provider','import','agent')),
  actor_id              TEXT NULL,
  PRIMARY KEY (id), UNIQUE (business_id, id),
  UNIQUE (business_id, idempotency_key),
  UNIQUE (business_id, journal_id, fiscal_year_id, voucher_number),
  FOREIGN KEY (business_id, journal_id) REFERENCES public.ledger_journals(business_id, id),
  FOREIGN KEY (business_id, fiscal_year_id) REFERENCES public.ledger_fiscal_years(business_id, id),
  FOREIGN KEY (business_id, period_id) REFERENCES public.ledger_periods(business_id, id),
  FOREIGN KEY (business_id, source_event_id) REFERENCES public.financial_events(business_id, id),
  FOREIGN KEY (business_id, posted_event_id) REFERENCES public.financial_events(business_id, id),
  FOREIGN KEY (business_id, reversal_of_entry_id) REFERENCES public.ledger_entries(business_id, id),
  FOREIGN KEY (business_id, reversed_by_entry_id) REFERENCES public.ledger_entries(business_id, id),
  -- Provenance: a rule-driven entry names its source event; only a manual voucher may not,
  -- and then a named user is the source (§36.2, §14).
  CHECK (source_event_id IS NOT NULL OR (posting_rule_id = 'manual' AND actor_type = 'user')),
  CHECK (posting_rule_id <> 'manual' OR posting_rule_version = 0),
  CHECK (actor_type NOT IN ('user','agent') OR actor_id IS NOT NULL),
  CHECK ((status = 'reversed') = (reversed_by_entry_id IS NOT NULL)),
  CHECK ((reversal_of_entry_id IS NULL) = (journal_type <> 'reversal'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_period ON public.ledger_entries (business_id, period_id, voucher_number);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_source ON public.ledger_entries (business_id, source_event_id);

CREATE TABLE IF NOT EXISTS public.ledger_entry_lines (
  id            TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id   TEXT NOT NULL,
  entry_id      TEXT NOT NULL,
  line_no       INTEGER NOT NULL CHECK (line_no >= 1),
  account_id    TEXT NOT NULL,
  debit_minor   BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor  BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  vat_code      TEXT NULL,
  project_id    TEXT NULL,
  customer_id   TEXT NULL,
  supplier_id   TEXT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (id), UNIQUE (business_id, entry_id, line_no),
  FOREIGN KEY (business_id, entry_id) REFERENCES public.ledger_entries(business_id, id),
  FOREIGN KEY (business_id, account_id) REFERENCES public.ledger_accounts(business_id, id),
  -- Exactly one side, never both, never neither.
  CHECK ((debit_minor > 0) <> (credit_minor > 0)),
  CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_lines_account ON public.ledger_entry_lines (business_id, account_id, entry_id);

-- ── Immutability. Lines never change. An entry changes once: when it is reversed. ──
CREATE OR REPLACE FUNCTION public.ledger_lines_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'ledger_lines_immutable' USING ERRCODE = 'restrict_violation'; END $fn$;
DROP TRIGGER IF EXISTS ledger_entry_lines_no_update_delete ON public.ledger_entry_lines;
CREATE TRIGGER ledger_entry_lines_no_update_delete BEFORE UPDATE OR DELETE ON public.ledger_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.ledger_lines_immutable();

CREATE OR REPLACE FUNCTION public.ledger_entries_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ledger_entries_immutable' USING ERRCODE = 'restrict_violation'; END IF;
  IF OLD.status <> 'posted' OR NEW.status <> 'reversed' OR NEW.reversed_by_entry_id IS NULL
     OR (to_jsonb(NEW) - 'status' - 'reversed_by_entry_id') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'reversed_by_entry_id') THEN
    RAISE EXCEPTION 'ledger_entries_immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS ledger_entries_reverse_only ON public.ledger_entries;
CREATE TRIGGER ledger_entries_reverse_only BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entries_immutable();

-- ── Balance invariant at commit, independent of any RPC (blueprint §13, §22). ──
CREATE OR REPLACE FUNCTION public.ledger_entry_balanced() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE v_debit BIGINT; v_credit BIGINT; v_lines INTEGER; v_total BIGINT;
BEGIN
  SELECT COALESCE(sum(l.debit_minor),0), COALESCE(sum(l.credit_minor),0), count(*)
    INTO v_debit, v_credit, v_lines FROM public.ledger_entry_lines l WHERE l.entry_id = NEW.entry_id;
  SELECT e.total_minor INTO v_total FROM public.ledger_entries e WHERE e.id = NEW.entry_id;
  IF v_lines < 2 OR v_debit <> v_credit OR v_debit <> v_total THEN
    RAISE EXCEPTION 'ledger_entry_unbalanced' USING ERRCODE = 'check_violation', DETAIL = NEW.entry_id;
  END IF;
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS ledger_entry_lines_balanced ON public.ledger_entry_lines;
CREATE CONSTRAINT TRIGGER ledger_entry_lines_balanced AFTER INSERT ON public.ledger_entry_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.ledger_entry_balanced();

-- ── Helpers ──
CREATE OR REPLACE FUNCTION public.ledger_entry_json(e public.ledger_entries) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object(
    'id', e.id, 'journal_id', e.journal_id, 'series', j.series, 'fiscal_year_id', e.fiscal_year_id, 'period_id', e.period_id,
    'voucher_number', e.voucher_number, 'journal_type', e.journal_type, 'effective_date', e.effective_date, 'posted_at', e.posted_at,
    'currency', e.currency, 'total_minor', e.total_minor::text, 'description', e.description,
    'source_event_id', e.source_event_id, 'correlation_id', e.correlation_id,
    'posting_rule_id', e.posting_rule_id, 'posting_rule_version', e.posting_rule_version,
    'reversal_of_entry_id', e.reversal_of_entry_id, 'reversed_by_entry_id', e.reversed_by_entry_id, 'status', e.status,
    'posted_event_id', e.posted_event_id, 'actor_type', e.actor_type, 'actor_id', e.actor_id,
    'lines', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'line_no', l.line_no, 'account', a.number, 'account_id', l.account_id,
        'debit_minor', l.debit_minor::text, 'credit_minor', l.credit_minor::text,
        'vat_code', l.vat_code, 'project_id', l.project_id, 'customer_id', l.customer_id, 'supplier_id', l.supplier_id, 'metadata', l.metadata)
        ORDER BY l.line_no), '[]'::jsonb)
      FROM public.ledger_entry_lines l JOIN public.ledger_accounts a ON a.id = l.account_id WHERE l.entry_id = e.id))
  FROM public.ledger_journals j WHERE j.id = e.journal_id
$fn$;

CREATE OR REPLACE FUNCTION public.ledger_period_for(p_business_id TEXT, p_date DATE) RETURNS public.ledger_periods
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $fn$
  SELECT p.* FROM public.ledger_periods p
   WHERE p.business_id = p_business_id AND p.starts_on <= p_date AND p.ends_on >= p_date
$fn$;

-- Canonical form of a lines array: nulls and empty metadata dropped, minor units as text. Replay compares this.
CREATE OR REPLACE FUNCTION public.ledger_lines_normalized(p_lines JSONB) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'account', l->>'account', 'debit_minor', COALESCE(l->>'debit_minor','0'), 'credit_minor', COALESCE(l->>'credit_minor','0'),
    'vat_code', l->>'vat_code', 'project_id', l->>'project_id', 'customer_id', l->>'customer_id', 'supplier_id', l->>'supplier_id',
    'metadata', CASE WHEN COALESCE(l->'metadata','{}'::jsonb) = '{}'::jsonb THEN NULL ELSE l->'metadata' END)) ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY AS t(l, ord)
$fn$;

CREATE OR REPLACE FUNCTION public.ledger_request_hash(
  p_series TEXT, p_journal_type TEXT, p_effective_date DATE, p_description TEXT, p_lines JSONB,
  p_source_event_id TEXT, p_posting_rule_id TEXT, p_posting_rule_version INTEGER, p_currency TEXT, p_reversal_of TEXT
) RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $fn$
  SELECT md5(concat_ws('|', p_series, p_journal_type, p_effective_date::text, p_description, public.ledger_lines_normalized(p_lines)::text,
    COALESCE(p_source_event_id,''), p_posting_rule_id, p_posting_rule_version::text, p_currency, COALESCE(p_reversal_of,'')))
$fn$;

-- ── RPC 1: open a fiscal year and its monthly periods. ──
CREATE OR REPLACE FUNCTION public.open_ledger_fiscal_year(p_business_id TEXT, p_starts_on DATE, p_ends_on DATE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE fy public.ledger_fiscal_years%ROWTYPE; v_from DATE; v_periods JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO fy FROM public.ledger_fiscal_years f WHERE f.business_id = p_business_id AND f.starts_on = p_starts_on;
  IF FOUND THEN
    IF fy.ends_on <> p_ends_on THEN RAISE EXCEPTION 'ledger_fiscal_year_conflict' USING ERRCODE = 'unique_violation'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.ledger_fiscal_years f WHERE f.business_id = p_business_id
                AND f.starts_on <= p_ends_on AND f.ends_on >= p_starts_on) THEN
      RAISE EXCEPTION 'ledger_fiscal_year_overlap' USING ERRCODE = 'exclusion_violation';
    END IF;
    INSERT INTO public.ledger_fiscal_years (business_id, starts_on, ends_on) VALUES (p_business_id, p_starts_on, p_ends_on) RETURNING * INTO fy;
    v_from := p_starts_on;
    WHILE v_from <= p_ends_on LOOP
      INSERT INTO public.ledger_periods (business_id, fiscal_year_id, starts_on, ends_on)
        VALUES (p_business_id, fy.id, v_from, (v_from + interval '1 month - 1 day')::date);
      v_from := (v_from + interval '1 month')::date;
    END LOOP;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'starts_on', p.starts_on, 'ends_on', p.ends_on, 'status', p.status) ORDER BY p.starts_on), '[]'::jsonb)
    INTO v_periods FROM public.ledger_periods p WHERE p.fiscal_year_id = fy.id;
  RETURN jsonb_build_object('id', fy.id, 'starts_on', fy.starts_on, 'ends_on', fy.ends_on, 'status', fy.status, 'periods', v_periods);
END $fn$;

-- ── RPC 2: a journal (voucher series). The series set is the country pack's, not the core's. ──
CREATE OR REPLACE FUNCTION public.ensure_ledger_journal(p_business_id TEXT, p_series TEXT, p_name TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE j public.ledger_journals%ROWTYPE;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  INSERT INTO public.ledger_journals (business_id, series, name) VALUES (p_business_id, p_series, p_name)
    ON CONFLICT (business_id, series) DO NOTHING;
  SELECT * INTO j FROM public.ledger_journals x WHERE x.business_id = p_business_id AND x.series = p_series;
  RETURN jsonb_build_object('id', j.id, 'series', j.series, 'name', j.name);
END $fn$;

-- ── RPC 3: an account. Idempotent by number; type is frozen once the account has lines. ──
CREATE OR REPLACE FUNCTION public.upsert_ledger_account(
  p_business_id TEXT, p_number TEXT, p_name TEXT, p_type TEXT, p_source TEXT, p_confirmed_by TEXT DEFAULT NULL, p_active BOOLEAN DEFAULT true
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE a public.ledger_accounts%ROWTYPE; v_by TEXT := nullif(btrim(p_confirmed_by), '');
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO a FROM public.ledger_accounts x WHERE x.business_id = p_business_id AND x.number = p_number FOR UPDATE;
  IF FOUND THEN
    IF a.type <> p_type AND EXISTS (SELECT 1 FROM public.ledger_entry_lines l WHERE l.account_id = a.id) THEN
      RAISE EXCEPTION 'ledger_account_type_frozen' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.ledger_accounts SET name = p_name, type = p_type, active = p_active,
      confirmed_by = COALESCE(v_by, confirmed_by),
      confirmed_at = CASE WHEN v_by IS NOT NULL AND confirmed_by IS NULL THEN now() ELSE confirmed_at END
      WHERE id = a.id RETURNING * INTO a;
  ELSE
    INSERT INTO public.ledger_accounts (business_id, number, name, type, active, source, confirmed_by, confirmed_at)
      VALUES (p_business_id, p_number, p_name, p_type, p_active, p_source, v_by, CASE WHEN v_by IS NULL THEN NULL ELSE now() END)
      RETURNING * INTO a;
  END IF;
  RETURN jsonb_build_object('id', a.id, 'number', a.number, 'name', a.name, 'type', a.type, 'active', a.active,
    'source', a.source, 'confirmed_by', a.confirmed_by);
END $fn$;

-- ── Internal posting core. Not granted to any role; post_journal_entry and reverse_journal_entry call it. ──
-- p_lines: [{account, debit_minor, credit_minor, vat_code?, project_id?, customer_id?, supplier_id?, metadata?}], minor units as strings.
CREATE OR REPLACE FUNCTION public.ledger_post(
  p_business_id TEXT, p_series TEXT, p_journal_type TEXT, p_effective_date DATE, p_description TEXT,
  p_lines JSONB, p_source_event_id TEXT, p_posting_rule_id TEXT, p_posting_rule_version INTEGER,
  p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT, p_currency TEXT, p_reversal_of TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE e public.ledger_entries%ROWTYPE; j public.ledger_journals%ROWTYPE; p public.ledger_periods%ROWTYPE;
        fy public.ledger_fiscal_years%ROWTYPE; src public.financial_events%ROWTYPE; a public.ledger_accounts%ROWTYPE;
        v_line JSONB; v_no INTEGER := 0; v_debit BIGINT := 0; v_credit BIGINT := 0; v_d BIGINT; v_c BIGINT;
        v_number INTEGER; v_corr TEXT; v_ev TEXT; v_hash TEXT; v_entry_id TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN RAISE EXCEPTION 'ledger_idempotency_key_required' USING ERRCODE = 'check_violation'; END IF;
  v_hash := public.ledger_request_hash(p_series, p_journal_type, p_effective_date, p_description, p_lines,
    p_source_event_id, p_posting_rule_id, p_posting_rule_version, p_currency, p_reversal_of);
  SELECT * INTO e FROM public.ledger_entries x WHERE x.business_id = p_business_id AND x.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    -- Replay must be identical in economic content; otherwise the key is being misused.
    IF e.request_hash <> v_hash THEN RAISE EXCEPTION 'ledger_idempotency_conflict' USING ERRCODE = 'unique_violation', DETAIL = e.id; END IF;
    RETURN public.ledger_entry_json(e) || jsonb_build_object('inserted', false);
  END IF;

  SELECT * INTO j FROM public.ledger_journals x WHERE x.business_id = p_business_id AND x.series = p_series;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_journal_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  p := public.ledger_period_for(p_business_id, p_effective_date);
  IF p.id IS NULL THEN RAISE EXCEPTION 'ledger_period_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF p.status <> 'open' THEN RAISE EXCEPTION 'ledger_period_not_open' USING ERRCODE = 'check_violation', DETAIL = p.id; END IF;
  SELECT * INTO fy FROM public.ledger_fiscal_years x WHERE x.id = p.fiscal_year_id;
  IF fy.status <> 'open' THEN RAISE EXCEPTION 'ledger_fiscal_year_not_open' USING ERRCODE = 'check_violation'; END IF;
  IF p_posting_rule_id = 'manual' THEN
    IF p_source_event_id IS NOT NULL OR p_actor_type <> 'user' OR nullif(btrim(p_actor_id), '') IS NULL OR p_posting_rule_version <> 0 THEN
      RAISE EXCEPTION 'ledger_manual_requires_user' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF p_source_event_id IS NULL THEN RAISE EXCEPTION 'ledger_source_event_required' USING ERRCODE = 'check_violation'; END IF;
    SELECT * INTO src FROM public.financial_events x WHERE x.business_id = p_business_id AND x.id = p_source_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ledger_source_event_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'ledger_lines_required' USING ERRCODE = 'check_violation';
  END IF;
  -- Pass 1: validate every line and the balance before any row is written.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_no := v_no + 1;
    IF jsonb_typeof(v_line) <> 'object' THEN RAISE EXCEPTION 'ledger_line_invalid' USING ERRCODE = 'check_violation', DETAIL = v_no::text; END IF;
    IF COALESCE(v_line->>'debit_minor','0') !~ '^[0-9]{1,18}$' OR COALESCE(v_line->>'credit_minor','0') !~ '^[0-9]{1,18}$' THEN
      RAISE EXCEPTION 'ledger_line_amount_invalid' USING ERRCODE = 'check_violation', DETAIL = v_no::text;
    END IF;
    v_d := COALESCE(v_line->>'debit_minor','0')::BIGINT; v_c := COALESCE(v_line->>'credit_minor','0')::BIGINT;
    IF (v_d > 0) = (v_c > 0) THEN RAISE EXCEPTION 'ledger_line_one_side' USING ERRCODE = 'check_violation', DETAIL = v_no::text; END IF;
    SELECT * INTO a FROM public.ledger_accounts x WHERE x.business_id = p_business_id AND x.number = v_line->>'account';
    IF NOT FOUND THEN RAISE EXCEPTION 'ledger_account_not_found' USING ERRCODE = 'foreign_key_violation', DETAIL = COALESCE(v_line->>'account','?'); END IF;
    IF NOT a.active THEN RAISE EXCEPTION 'ledger_account_inactive' USING ERRCODE = 'check_violation', DETAIL = a.number; END IF;
    v_debit := v_debit + v_d; v_credit := v_credit + v_c;
  END LOOP;
  IF v_debit <> v_credit OR v_debit = 0 THEN
    RAISE EXCEPTION 'ledger_entry_unbalanced' USING ERRCODE = 'check_violation', DETAIL = v_debit::text || '<>' || v_credit::text;
  END IF;

  -- Gapless number, taken in this transaction. Fresh counter row → 1 and next 2; otherwise the pre-increment value.
  INSERT INTO public.ledger_voucher_counters (business_id, journal_id, fiscal_year_id, next_number) VALUES (p_business_id, j.id, fy.id, 2)
    ON CONFLICT (business_id, journal_id, fiscal_year_id) DO UPDATE SET next_number = public.ledger_voucher_counters.next_number + 1
    RETURNING next_number - 1 INTO v_number;

  v_entry_id := gen_random_uuid()::TEXT;
  v_corr := CASE WHEN src.id IS NOT NULL THEN src.correlation_id ELSE 'fin_ledger_' || v_entry_id END;
  -- The event first (blueprint §6: state and event in one transaction; a raise anywhere undoes both).
  v_ev := public.financial_append(p_business_id, 'journal_entry_posted', now(), p_effective_date, 'ledger_entry', v_entry_id, v_corr, p_source_event_id,
    'journal_entry_posted:' || v_entry_id, p_currency, v_debit,
    jsonb_build_object('journal_entry_id', v_entry_id, 'journal_type', p_journal_type, 'voucher_series', j.series, 'voucher_number', v_number,
      'effective_date', p_effective_date, 'period_id', p.id, 'rule_id', p_posting_rule_id, 'rule_version', p_posting_rule_version,
      'source_event_id', p_source_event_id),
    p_actor_type, p_actor_id);
  INSERT INTO public.ledger_entries (id, business_id, journal_id, fiscal_year_id, period_id, voucher_number, journal_type, effective_date,
      currency, total_minor, description, source_event_id, correlation_id, posting_rule_id, posting_rule_version, reversal_of_entry_id,
      idempotency_key, request_hash, posted_event_id, actor_type, actor_id)
    VALUES (v_entry_id, p_business_id, j.id, fy.id, p.id, v_number, p_journal_type, p_effective_date, p_currency, v_debit, p_description,
      p_source_event_id, v_corr, p_posting_rule_id, p_posting_rule_version, p_reversal_of, p_idempotency_key, v_hash, v_ev, p_actor_type, p_actor_id);
  -- Pass 2: the lines, in the caller's order.
  INSERT INTO public.ledger_entry_lines (business_id, entry_id, line_no, account_id, debit_minor, credit_minor, vat_code, project_id, customer_id, supplier_id, metadata)
    SELECT p_business_id, v_entry_id, t.ord, x.id, COALESCE(t.l->>'debit_minor','0')::BIGINT, COALESCE(t.l->>'credit_minor','0')::BIGINT,
           t.l->>'vat_code', t.l->>'project_id', t.l->>'customer_id', t.l->>'supplier_id', COALESCE(t.l->'metadata', '{}'::jsonb)
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(l, ord)
      JOIN public.ledger_accounts x ON x.business_id = p_business_id AND x.number = t.l->>'account'
     ORDER BY t.ord;
  SELECT * INTO e FROM public.ledger_entries x WHERE x.id = v_entry_id;
  RETURN public.ledger_entry_json(e) || jsonb_build_object('inserted', true);
END $fn$;

-- ── RPC 4: post. The public face of ledger_post: never a reversal, never a reversal link. ──
CREATE OR REPLACE FUNCTION public.post_journal_entry(
  p_business_id TEXT, p_series TEXT, p_journal_type TEXT, p_effective_date DATE, p_description TEXT,
  p_lines JSONB, p_source_event_id TEXT, p_posting_rule_id TEXT, p_posting_rule_version INTEGER,
  p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT, p_currency TEXT DEFAULT 'SEK'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF p_journal_type = 'reversal' OR p_posting_rule_id = 'reversal' THEN
    RAISE EXCEPTION 'ledger_use_reverse_journal_entry' USING ERRCODE = 'check_violation';
  END IF;
  RETURN public.ledger_post(p_business_id, p_series, p_journal_type, p_effective_date, p_description, p_lines, p_source_event_id,
    p_posting_rule_id, p_posting_rule_version, p_idempotency_key, p_actor_type, p_actor_id, p_currency, NULL);
END $fn$;

-- ── RPC 5: reverse. A new entry in the same journal with the sides swapped; the original is marked, never edited. ──
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
  p_business_id TEXT, p_entry_id TEXT, p_effective_date DATE, p_reason TEXT, p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE o public.ledger_entries%ROWTYPE; r public.ledger_entries%ROWTYPE; j public.ledger_journals%ROWTYPE;
        v_lines JSONB; v_result JSONB; v_ev TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'ledger_reversal_reason_required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO r FROM public.ledger_entries x WHERE x.business_id = p_business_id AND x.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF r.reversal_of_entry_id IS DISTINCT FROM p_entry_id THEN RAISE EXCEPTION 'ledger_idempotency_conflict' USING ERRCODE = 'unique_violation'; END IF;
    RETURN public.ledger_entry_json(r) || jsonb_build_object('inserted', false);
  END IF;
  SELECT * INTO o FROM public.ledger_entries x WHERE x.business_id = p_business_id AND x.id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_entry_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF o.status = 'reversed' THEN RAISE EXCEPTION 'ledger_entry_has_reversal' USING ERRCODE = 'check_violation', DETAIL = o.reversed_by_entry_id; END IF;
  IF o.reversal_of_entry_id IS NOT NULL THEN RAISE EXCEPTION 'ledger_reversal_of_reversal' USING ERRCODE = 'check_violation'; END IF;
  IF p_effective_date < o.effective_date THEN RAISE EXCEPTION 'ledger_reversal_before_original' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO j FROM public.ledger_journals x WHERE x.id = o.journal_id;
  SELECT jsonb_agg(jsonb_build_object('account', a.number, 'debit_minor', l.credit_minor::text, 'credit_minor', l.debit_minor::text,
      'vat_code', l.vat_code, 'project_id', l.project_id, 'customer_id', l.customer_id, 'supplier_id', l.supplier_id, 'metadata', l.metadata) ORDER BY l.line_no)
    INTO v_lines FROM public.ledger_entry_lines l JOIN public.ledger_accounts a ON a.id = l.account_id WHERE l.entry_id = o.id;
  -- The reversal's source event is the original's posted event: provenance chains, never dangles.
  v_result := public.ledger_post(p_business_id, j.series, 'reversal', p_effective_date,
    'Återföring av ' || j.series || o.voucher_number::text || ': ' || btrim(p_reason),
    v_lines, o.posted_event_id, 'reversal', 1, p_idempotency_key, p_actor_type, p_actor_id, o.currency, o.id);
  v_ev := public.financial_append(p_business_id, 'journal_entry_reversed', now(), p_effective_date, 'ledger_entry', o.id, o.correlation_id, v_result->>'posted_event_id',
    'journal_entry_reversed:' || o.id, o.currency, o.total_minor,
    jsonb_build_object('journal_entry_id', o.id, 'reversal_entry_id', v_result->>'id', 'reason', btrim(p_reason)),
    p_actor_type, p_actor_id);
  UPDATE public.ledger_entries SET status = 'reversed', reversed_by_entry_id = v_result->>'id' WHERE id = o.id;
  SELECT * INTO r FROM public.ledger_entries x WHERE x.id = v_result->>'id';
  RETURN public.ledger_entry_json(r) || jsonb_build_object('inserted', true, 'reversed_event_id', v_ev);
END $fn$;

-- ── RPC 6/7: period lock and unlock. In date order; unlock needs a reason and is always audited. ──
CREATE OR REPLACE FUNCTION public.lock_ledger_period(p_business_id TEXT, p_period_id TEXT, p_actor_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE p public.ledger_periods%ROWTYPE; v_ev TEXT; v_by TEXT := nullif(btrim(p_actor_id), '');
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF v_by IS NULL THEN RAISE EXCEPTION 'ledger_actor_required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO p FROM public.ledger_periods x WHERE x.business_id = p_business_id AND x.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_period_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF p.status = 'locked' THEN RETURN jsonb_build_object('id', p.id, 'status', p.status, 'changed', false); END IF;
  IF EXISTS (SELECT 1 FROM public.ledger_periods x WHERE x.business_id = p_business_id AND x.starts_on < p.starts_on AND x.status = 'open') THEN
    RAISE EXCEPTION 'ledger_period_lock_order' USING ERRCODE = 'check_violation';
  END IF;
  v_ev := public.financial_append(p_business_id, 'period_locked', now(), p.ends_on, 'ledger_period', p.id, 'fin_period_' || p.id, NULL,
    'period_locked:' || p.id || ':' || clock_timestamp()::text, NULL, NULL,
    jsonb_build_object('period_id', p.id, 'fiscal_year_id', p.fiscal_year_id, 'locked_by', v_by), 'user', v_by);
  UPDATE public.ledger_periods SET status = 'locked', locked_at = now(), locked_by = v_by, lock_event_id = v_ev WHERE id = p.id;
  RETURN jsonb_build_object('id', p.id, 'status', 'locked', 'changed', true, 'event_id', v_ev);
END $fn$;

CREATE OR REPLACE FUNCTION public.unlock_ledger_period(p_business_id TEXT, p_period_id TEXT, p_actor_id TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE p public.ledger_periods%ROWTYPE; v_ev TEXT; v_by TEXT := nullif(btrim(p_actor_id), ''); v_reason TEXT := nullif(btrim(p_reason), '');
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF v_by IS NULL OR v_reason IS NULL THEN RAISE EXCEPTION 'ledger_unlock_requires_actor_and_reason' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO p FROM public.ledger_periods x WHERE x.business_id = p_business_id AND x.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_period_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF p.status = 'open' THEN RETURN jsonb_build_object('id', p.id, 'status', p.status, 'changed', false); END IF;
  IF EXISTS (SELECT 1 FROM public.ledger_periods x WHERE x.business_id = p_business_id AND x.starts_on > p.starts_on AND x.status = 'locked') THEN
    RAISE EXCEPTION 'ledger_period_unlock_order' USING ERRCODE = 'check_violation';
  END IF;
  v_ev := public.financial_append(p_business_id, 'period_unlocked', now(), p.ends_on, 'ledger_period', p.id, 'fin_period_' || p.id, p.lock_event_id,
    'period_unlocked:' || p.id || ':' || clock_timestamp()::text, NULL, NULL,
    jsonb_build_object('period_id', p.id, 'fiscal_year_id', p.fiscal_year_id, 'unlocked_by', v_by, 'reason', v_reason), 'user', v_by);
  UPDATE public.ledger_periods SET status = 'open', locked_at = NULL, locked_by = NULL, lock_event_id = NULL WHERE id = p.id;
  RETURN jsonb_build_object('id', p.id, 'status', 'open', 'changed', true, 'event_id', v_ev);
END $fn$;

-- ── RPC 8: one entry, read back. Projections (ledger, balance, P&L, SIE) are C10. ──
CREATE OR REPLACE FUNCTION public.read_ledger_entry(p_business_id TEXT, p_entry_id TEXT) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT public.ledger_entry_json(e) FROM public.ledger_entries e WHERE e.business_id = p_business_id AND e.id = p_entry_id
$fn$;

-- ── Grants. RLS on; tenant read as financial_events (the customer's own books); writes via RPCs only. ──
DO $g$ DECLARE t TEXT; f RECORD; BEGIN
  FOREACH t IN ARRAY ARRAY['ledger_accounts','ledger_fiscal_years','ledger_periods','ledger_journals','ledger_voucher_counters','ledger_entries','ledger_entry_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t);
    IF t <> 'ledger_voucher_counters' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_read', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t || '_tenant_read', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY(ARRAY[
      'open_ledger_fiscal_year','ensure_ledger_journal','upsert_ledger_account','post_journal_entry','reverse_journal_entry',
      'lock_ledger_period','unlock_ledger_period','read_ledger_entry']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
  -- Internal: the posting core and helpers are callable only through the RPCs above.
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY(ARRAY[
      'ledger_post','ledger_entry_json','ledger_period_for','ledger_lines_normalized','ledger_request_hash']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.sig);
  END LOOP;
END $g$;

COMMIT;
