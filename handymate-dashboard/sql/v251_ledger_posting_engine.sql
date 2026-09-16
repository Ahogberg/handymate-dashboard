-- v251_ledger_posting_engine.sql — C8 financial ledger primitives.
-- No BAS seed, no default voucher series, no VAT posting rule, no rollout flag.
-- Lock order remains the C2-C8 contract: financial:<business> advisory lock first,
-- then domain rows, then append the financial event last in the same transaction.
BEGIN;

CREATE TABLE public.financial_ledger_accounts (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (code ~ '^[A-Za-z0-9._-]{1,32}$'),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  confirmed_by TEXT NOT NULL CHECK (btrim(confirmed_by) <> ''),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (business_id,id),
  UNIQUE (business_id,code)
);

CREATE TABLE public.financial_fiscal_years (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (business_id,id),
  UNIQUE (business_id,start_date),
  CHECK (start_date = date_trunc('month',start_date)::date),
  CHECK (end_date = (start_date + interval '1 year - 1 day')::date)
);

CREATE TABLE public.financial_fiscal_periods (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  fiscal_year_id TEXT NOT NULL,
  period_no INTEGER NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (business_id,id),
  UNIQUE (business_id,fiscal_year_id,period_no),
  UNIQUE (business_id,start_date),
  FOREIGN KEY (business_id,fiscal_year_id) REFERENCES public.financial_fiscal_years(business_id,id) ON DELETE RESTRICT,
  CHECK (start_date = date_trunc('month',start_date)::date),
  CHECK (end_date = (start_date + interval '1 month - 1 day')::date),
  CHECK ((locked = false AND locked_at IS NULL AND locked_by IS NULL) OR
         (locked = true AND locked_at IS NOT NULL AND locked_by IS NOT NULL))
);
CREATE INDEX financial_fiscal_periods_date ON public.financial_fiscal_periods(business_id,start_date,end_date);

CREATE TABLE public.financial_voucher_series (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  fiscal_year_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code ~ '^[A-Za-z0-9._-]{1,16}$'),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  first_number BIGINT NOT NULL CHECK (first_number > 0),
  next_number BIGINT NOT NULL CHECK (next_number > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (business_id,id),
  UNIQUE (business_id,fiscal_year_id,code),
  FOREIGN KEY (business_id,fiscal_year_id) REFERENCES public.financial_fiscal_years(business_id,id) ON DELETE RESTRICT,
  CHECK (next_number >= first_number)
);

CREATE TABLE public.financial_vouchers (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  fiscal_year_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  voucher_number BIGINT NOT NULL CHECK (voucher_number > 0),
  voucher_date DATE NOT NULL,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  source_type TEXT NOT NULL CHECK (btrim(source_type) <> ''),
  source_id TEXT NOT NULL CHECK (btrim(source_id) <> ''),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> '' AND length(idempotency_key) <= 400),
  reverses_voucher_id TEXT NULL,
  reversal_root_id TEXT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','user','provider','import','agent')),
  actor_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (business_id,id),
  UNIQUE (business_id,idempotency_key),
  UNIQUE (business_id,series_id,voucher_number),
  UNIQUE (business_id,reverses_voucher_id),
  FOREIGN KEY (business_id,fiscal_year_id) REFERENCES public.financial_fiscal_years(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,period_id) REFERENCES public.financial_fiscal_periods(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,series_id) REFERENCES public.financial_voucher_series(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,reverses_voucher_id) REFERENCES public.financial_vouchers(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,reversal_root_id) REFERENCES public.financial_vouchers(business_id,id) ON DELETE RESTRICT,
  CHECK ((actor_type IN ('user','agent')) = (actor_id IS NOT NULL) OR actor_type NOT IN ('user','agent')),
  CHECK ((reverses_voucher_id IS NULL) = (reversal_root_id IS NULL))
);
CREATE INDEX financial_vouchers_date ON public.financial_vouchers(business_id,voucher_date,series_id,voucher_number);
CREATE INDEX financial_vouchers_source ON public.financial_vouchers(business_id,source_type,source_id);

CREATE TABLE public.financial_voucher_lines (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  voucher_id TEXT NOT NULL,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  account_id TEXT NOT NULL,
  debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (business_id,id),
  UNIQUE (business_id,voucher_id,line_no),
  FOREIGN KEY (business_id,voucher_id) REFERENCES public.financial_vouchers(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,account_id) REFERENCES public.financial_ledger_accounts(business_id,id) ON DELETE RESTRICT,
  CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))
);

CREATE TABLE public.financial_period_lock_audit (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('lock','unlock')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','user','provider','import','agent')),
  actor_id TEXT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (business_id,id),
  FOREIGN KEY (business_id,period_id) REFERENCES public.financial_fiscal_periods(business_id,id) ON DELETE RESTRICT,
  CHECK ((actor_type IN ('user','agent')) = (actor_id IS NOT NULL) OR actor_type NOT IN ('user','agent'))
);
CREATE INDEX financial_period_lock_audit_period ON public.financial_period_lock_audit(business_id,period_id,created_at);

-- Empty by design. C8 defines the shape of a kernel consumer, but chooses no accounting policy.
CREATE TABLE public.financial_ledger_rules (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  series_code TEXT NOT NULL CHECK (series_code ~ '^[A-Za-z0-9._-]{1,16}$'),
  debit_account_id TEXT NOT NULL,
  credit_account_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (business_id,id),
  FOREIGN KEY (business_id,debit_account_id) REFERENCES public.financial_ledger_accounts(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,credit_account_id) REFERENCES public.financial_ledger_accounts(business_id,id) ON DELETE RESTRICT,
  CHECK (debit_account_id <> credit_account_id)
);
CREATE INDEX financial_ledger_rules_match ON public.financial_ledger_rules(business_id,event_type) WHERE enabled;

CREATE OR REPLACE FUNCTION public.financial_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'financial_ledger_immutable' USING ERRCODE='restrict_violation';
END $fn$;
CREATE TRIGGER financial_vouchers_immutable BEFORE UPDATE OR DELETE ON public.financial_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.financial_ledger_immutable();
CREATE TRIGGER financial_voucher_lines_immutable BEFORE UPDATE OR DELETE ON public.financial_voucher_lines
  FOR EACH ROW EXECUTE FUNCTION public.financial_ledger_immutable();
CREATE TRIGGER financial_period_lock_audit_immutable BEFORE UPDATE OR DELETE ON public.financial_period_lock_audit
  FOR EACH ROW EXECUTE FUNCTION public.financial_ledger_immutable();

CREATE OR REPLACE FUNCTION public.financial_normalize_ledger_lines(p_lines JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $fn$
DECLARE item JSONB; out_lines JSONB := '[]'::jsonb; n INTEGER := 0; account TEXT; memo TEXT;
        d_text TEXT; c_text TEXT; d BIGINT; c BIGINT; sum_d BIGINT := 0; sum_c BIGINT := 0;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'financial_voucher_requires_two_lines' USING ERRCODE='check_violation';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    n := n + 1;
    IF jsonb_typeof(item) <> 'object' THEN RAISE EXCEPTION 'financial_voucher_line_invalid' USING ERRCODE='check_violation'; END IF;
    account := nullif(btrim(item->>'account_id'),'');
    d_text := COALESCE(item->>'debit_minor','0'); c_text := COALESCE(item->>'credit_minor','0');
    memo := nullif(item->>'memo','');
    IF account IS NULL OR d_text !~ '^[0-9]+$' OR c_text !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'financial_voucher_line_invalid' USING ERRCODE='check_violation';
    END IF;
    d := d_text::bigint; c := c_text::bigint;
    IF (d > 0) = (c > 0) THEN RAISE EXCEPTION 'financial_voucher_line_one_side_required' USING ERRCODE='check_violation'; END IF;
    sum_d := sum_d + d; sum_c := sum_c + c;
    out_lines := out_lines || jsonb_build_array(jsonb_build_object('line_no',n,'account_id',account,
      'debit_minor',d::text,'credit_minor',c::text,'memo',memo));
  END LOOP;
  IF sum_d = 0 OR sum_d <> sum_c THEN RAISE EXCEPTION 'financial_voucher_unbalanced' USING ERRCODE='check_violation'; END IF;
  RETURN out_lines;
END $fn$;

CREATE OR REPLACE FUNCTION public.financial_voucher_lines_json(p_business_id TEXT,p_voucher_id TEXT) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('line_no',l.line_no,'account_id',l.account_id,
    'debit_minor',l.debit_minor::text,'credit_minor',l.credit_minor::text,'memo',l.memo) ORDER BY l.line_no),'[]'::jsonb)
  FROM public.financial_voucher_lines l WHERE l.business_id=p_business_id AND l.voucher_id=p_voucher_id
$fn$;

CREATE OR REPLACE FUNCTION public.financial_voucher_json(p_business_id TEXT,p_voucher_id TEXT) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object('id',v.id,'business_id',v.business_id,'fiscal_year_id',v.fiscal_year_id,
    'period_id',v.period_id,'series_id',v.series_id,'voucher_number',v.voucher_number::text,
    'voucher_date',v.voucher_date,'currency',v.currency,'description',v.description,'source_type',v.source_type,
    'source_id',v.source_id,'idempotency_key',v.idempotency_key,'reverses_voucher_id',v.reverses_voucher_id,
    'reversal_root_id',v.reversal_root_id,'actor_type',v.actor_type,'actor_id',v.actor_id,
    'created_at',v.created_at,'lines',public.financial_voucher_lines_json(v.business_id,v.id))
  FROM public.financial_vouchers v WHERE v.business_id=p_business_id AND v.id=p_voucher_id
$fn$;

CREATE OR REPLACE FUNCTION public.create_financial_ledger_account(
  p_business_id TEXT,p_code TEXT,p_name TEXT,p_confirmed_by TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE a public.financial_ledger_accounts%ROWTYPE;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF nullif(btrim(p_code),'') IS NULL OR nullif(btrim(p_name),'') IS NULL OR nullif(btrim(p_confirmed_by),'') IS NULL THEN
    RAISE EXCEPTION 'financial_account_fields_required' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO a FROM public.financial_ledger_accounts WHERE business_id=p_business_id AND code=p_code;
  IF FOUND THEN
    IF a.name IS DISTINCT FROM p_name OR a.confirmed_by IS DISTINCT FROM p_confirmed_by THEN
      RAISE EXCEPTION 'financial_account_code_conflict' USING ERRCODE='unique_violation';
    END IF;
    RETURN jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'confirmed_by',a.confirmed_by,'created',false);
  END IF;
  INSERT INTO public.financial_ledger_accounts(business_id,code,name,confirmed_by)
    VALUES(p_business_id,p_code,p_name,p_confirmed_by) RETURNING * INTO a;
  RETURN jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'confirmed_by',a.confirmed_by,'created',true);
END $fn$;

CREATE OR REPLACE FUNCTION public.create_financial_fiscal_year(
  p_business_id TEXT,p_label TEXT,p_start_date DATE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE y public.financial_fiscal_years%ROWTYPE; existing public.financial_fiscal_years%ROWTYPE; i INTEGER;
        s DATE; e DATE; periods JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF nullif(btrim(p_label),'') IS NULL OR p_start_date IS NULL OR p_start_date <> date_trunc('month',p_start_date)::date THEN
    RAISE EXCEPTION 'financial_fiscal_year_invalid' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO existing FROM public.financial_fiscal_years WHERE business_id=p_business_id AND start_date=p_start_date;
  IF FOUND THEN
    IF existing.label IS DISTINCT FROM p_label THEN RAISE EXCEPTION 'financial_fiscal_year_conflict' USING ERRCODE='unique_violation'; END IF;
    SELECT jsonb_agg(jsonb_build_object('id',p.id,'period_no',p.period_no,'start_date',p.start_date,'end_date',p.end_date,'locked',p.locked) ORDER BY p.period_no)
      INTO periods FROM public.financial_fiscal_periods p WHERE p.business_id=p_business_id AND p.fiscal_year_id=existing.id;
    RETURN jsonb_build_object('id',existing.id,'start_date',existing.start_date,'end_date',existing.end_date,'created',false,'periods',periods);
  END IF;
  e := (p_start_date + interval '1 year - 1 day')::date;
  IF EXISTS(SELECT 1 FROM public.financial_fiscal_years f WHERE f.business_id=p_business_id AND daterange(f.start_date,f.end_date,'[]') && daterange(p_start_date,e,'[]')) THEN
    RAISE EXCEPTION 'financial_fiscal_year_overlap' USING ERRCODE='exclusion_violation';
  END IF;
  INSERT INTO public.financial_fiscal_years(business_id,label,start_date,end_date)
    VALUES(p_business_id,p_label,p_start_date,e) RETURNING * INTO y;
  FOR i IN 0..11 LOOP
    s := (p_start_date + make_interval(months=>i))::date;
    INSERT INTO public.financial_fiscal_periods(business_id,fiscal_year_id,period_no,start_date,end_date)
      VALUES(p_business_id,y.id,i+1,s,(s+interval '1 month - 1 day')::date);
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('id',p.id,'period_no',p.period_no,'start_date',p.start_date,'end_date',p.end_date,'locked',p.locked) ORDER BY p.period_no)
    INTO periods FROM public.financial_fiscal_periods p WHERE p.business_id=p_business_id AND p.fiscal_year_id=y.id;
  RETURN jsonb_build_object('id',y.id,'start_date',y.start_date,'end_date',y.end_date,'created',true,'periods',periods);
END $fn$;

CREATE OR REPLACE FUNCTION public.create_financial_voucher_series(
  p_business_id TEXT,p_fiscal_year_id TEXT,p_code TEXT,p_name TEXT,p_first_number BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE s public.financial_voucher_series%ROWTYPE;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF nullif(btrim(p_code),'') IS NULL OR nullif(btrim(p_name),'') IS NULL OR p_first_number IS NULL OR p_first_number <= 0 THEN
    RAISE EXCEPTION 'financial_voucher_series_invalid' USING ERRCODE='check_violation';
  END IF;
  PERFORM 1 FROM public.financial_fiscal_years WHERE business_id=p_business_id AND id=p_fiscal_year_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_fiscal_year_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  SELECT * INTO s FROM public.financial_voucher_series WHERE business_id=p_business_id AND fiscal_year_id=p_fiscal_year_id AND code=p_code;
  IF FOUND THEN
    IF s.name IS DISTINCT FROM p_name OR s.first_number IS DISTINCT FROM p_first_number THEN RAISE EXCEPTION 'financial_voucher_series_conflict' USING ERRCODE='unique_violation'; END IF;
    RETURN jsonb_build_object('id',s.id,'code',s.code,'first_number',s.first_number::text,'next_number',s.next_number::text,'created',false);
  END IF;
  INSERT INTO public.financial_voucher_series(business_id,fiscal_year_id,code,name,first_number,next_number)
    VALUES(p_business_id,p_fiscal_year_id,p_code,p_name,p_first_number,p_first_number) RETURNING * INTO s;
  RETURN jsonb_build_object('id',s.id,'code',s.code,'first_number',s.first_number::text,'next_number',s.next_number::text,'created',true);
END $fn$;

CREATE OR REPLACE FUNCTION public.financial_post_voucher_internal(
  p_business_id TEXT,p_series_id TEXT,p_voucher_date DATE,p_currency TEXT,p_description TEXT,
  p_source_type TEXT,p_source_id TEXT,p_idempotency_key TEXT,p_lines JSONB,p_actor_type TEXT,p_actor_id TEXT,
  p_reverses_voucher_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE normalized JSONB; existing public.financial_vouchers%ROWTYPE; y public.financial_fiscal_years%ROWTYPE;
        p public.financial_fiscal_periods%ROWTYPE; s public.financial_voucher_series%ROWTYPE;
        target public.financial_vouchers%ROWTYPE; root_id TEXT; v_id TEXT := gen_random_uuid()::text; v_number BIGINT;
        line JSONB; total_debit BIGINT := 0; event_id TEXT; cause_id TEXT; correlation TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_voucher_date IS NULL OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR nullif(btrim(p_description),'') IS NULL
     OR nullif(btrim(p_source_type),'') IS NULL OR nullif(btrim(p_source_id),'') IS NULL OR nullif(btrim(p_idempotency_key),'') IS NULL THEN
    RAISE EXCEPTION 'financial_voucher_fields_required' USING ERRCODE='check_violation';
  END IF;
  normalized := public.financial_normalize_ledger_lines(p_lines);
  SELECT * INTO existing FROM public.financial_vouchers WHERE business_id=p_business_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF existing.series_id IS DISTINCT FROM p_series_id OR existing.voucher_date IS DISTINCT FROM p_voucher_date
       OR existing.currency IS DISTINCT FROM p_currency OR existing.description IS DISTINCT FROM p_description
       OR existing.source_type IS DISTINCT FROM p_source_type OR existing.source_id IS DISTINCT FROM p_source_id
       OR existing.reverses_voucher_id IS DISTINCT FROM p_reverses_voucher_id
       OR public.financial_voucher_lines_json(p_business_id,existing.id) IS DISTINCT FROM normalized THEN
      RAISE EXCEPTION 'financial_voucher_idempotency_conflict' USING ERRCODE='unique_violation', DETAIL=existing.id;
    END IF;
    RETURN public.financial_voucher_json(p_business_id,existing.id) || jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO y FROM public.financial_fiscal_years WHERE business_id=p_business_id AND p_voucher_date BETWEEN start_date AND end_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_fiscal_year_for_date_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  SELECT * INTO p FROM public.financial_fiscal_periods WHERE business_id=p_business_id AND fiscal_year_id=y.id AND p_voucher_date BETWEEN start_date AND end_date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_period_for_date_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  IF p.locked THEN RAISE EXCEPTION 'financial_period_locked' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  SELECT * INTO s FROM public.financial_voucher_series WHERE business_id=p_business_id AND id=p_series_id FOR UPDATE;
  IF NOT FOUND OR s.fiscal_year_id <> y.id THEN RAISE EXCEPTION 'financial_voucher_series_wrong_year' USING ERRCODE='foreign_key_violation'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(normalized) x
      JOIN public.financial_ledger_accounts a ON a.business_id=p_business_id AND a.id=x->>'account_id') <> jsonb_array_length(normalized) THEN
    RAISE EXCEPTION 'financial_voucher_account_not_found' USING ERRCODE='foreign_key_violation';
  END IF;
  IF p_reverses_voucher_id IS NOT NULL THEN
    SELECT * INTO target FROM public.financial_vouchers WHERE business_id=p_business_id AND id=p_reverses_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'financial_reversal_target_not_found' USING ERRCODE='foreign_key_violation'; END IF;
    IF target.currency <> p_currency THEN RAISE EXCEPTION 'financial_reversal_currency_mismatch' USING ERRCODE='check_violation'; END IF;
    IF EXISTS(SELECT 1 FROM public.financial_vouchers v WHERE v.business_id=p_business_id AND v.reverses_voucher_id=p_reverses_voucher_id) THEN
      RAISE EXCEPTION 'financial_voucher_already_reversed' USING ERRCODE='unique_violation';
    END IF;
    root_id := COALESCE(target.reversal_root_id,target.id);
    SELECT e.id,e.correlation_id INTO cause_id,correlation FROM public.financial_events e
      WHERE e.business_id=p_business_id AND e.idempotency_key='ledger_event:'||target.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'financial_reversal_event_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  ELSIF p_source_type = 'financial_event' THEN
    SELECT e.id,e.correlation_id INTO cause_id,correlation FROM public.financial_events e
      WHERE e.business_id=p_business_id AND e.id=p_source_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'financial_ledger_event_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  END IF;
  v_number := s.next_number;
  UPDATE public.financial_voucher_series SET next_number=next_number+1 WHERE business_id=p_business_id AND id=s.id;
  INSERT INTO public.financial_vouchers(id,business_id,fiscal_year_id,period_id,series_id,voucher_number,voucher_date,currency,
    description,source_type,source_id,idempotency_key,reverses_voucher_id,reversal_root_id,actor_type,actor_id)
  VALUES(v_id,p_business_id,y.id,p.id,s.id,v_number,p_voucher_date,p_currency,p_description,p_source_type,p_source_id,
    p_idempotency_key,p_reverses_voucher_id,root_id,p_actor_type,p_actor_id);
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
    INSERT INTO public.financial_voucher_lines(business_id,voucher_id,line_no,account_id,debit_minor,credit_minor,memo)
    VALUES(p_business_id,v_id,(line->>'line_no')::int,line->>'account_id',(line->>'debit_minor')::bigint,(line->>'credit_minor')::bigint,line->>'memo');
    total_debit := total_debit + (line->>'debit_minor')::bigint;
  END LOOP;
  -- Event last. Any later failure rolls back the number allocation, voucher, lines and event together.
  event_id := public.financial_append(p_business_id,
    CASE WHEN p_reverses_voucher_id IS NULL THEN 'journal_entry_posted' ELSE 'journal_entry_reversed' END,
    clock_timestamp(),p_voucher_date,'ledger_voucher',v_id,COALESCE(correlation,'fin_voucher_'||v_id),cause_id,'ledger_event:'||v_id,
    p_currency,total_debit,jsonb_build_object('voucher_id',v_id,'series_id',s.id,'series_code',s.code,
      'voucher_number',v_number::text,'reverses_voucher_id',p_reverses_voucher_id,'reversal_root_id',root_id,
      'source_type',p_source_type,'source_id',p_source_id),p_actor_type,p_actor_id);
  RETURN public.financial_voucher_json(p_business_id,v_id) || jsonb_build_object('event_id',event_id,'replayed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.post_financial_voucher(
  p_business_id TEXT,p_series_id TEXT,p_voucher_date DATE,p_currency TEXT,p_description TEXT,
  p_source_type TEXT,p_source_id TEXT,p_idempotency_key TEXT,p_lines JSONB,p_actor_type TEXT,p_actor_id TEXT
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT public.financial_post_voucher_internal(p_business_id,p_series_id,p_voucher_date,p_currency,p_description,
    p_source_type,p_source_id,p_idempotency_key,p_lines,p_actor_type,p_actor_id,NULL)
$fn$;

CREATE OR REPLACE FUNCTION public.reverse_financial_voucher(
  p_business_id TEXT,p_voucher_id TEXT,p_series_id TEXT,p_voucher_date DATE,p_description TEXT,
  p_idempotency_key TEXT,p_actor_type TEXT,p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE target public.financial_vouchers%ROWTYPE; lines JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO target FROM public.financial_vouchers WHERE business_id=p_business_id AND id=p_voucher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_reversal_target_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  SELECT jsonb_agg(jsonb_build_object('account_id',l.account_id,'debit_minor',l.credit_minor::text,
    'credit_minor',l.debit_minor::text,'memo',l.memo) ORDER BY l.line_no) INTO lines
    FROM public.financial_voucher_lines l WHERE l.business_id=p_business_id AND l.voucher_id=p_voucher_id;
  RETURN public.financial_post_voucher_internal(p_business_id,p_series_id,p_voucher_date,target.currency,p_description,
    'reversal',p_voucher_id,p_idempotency_key,lines,p_actor_type,p_actor_id,p_voucher_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.lock_financial_period(
  p_business_id TEXT,p_period_id TEXT,p_reason TEXT,p_actor_type TEXT,p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE p public.financial_fiscal_periods%ROWTYPE; earliest TEXT; audit_id TEXT; event_id TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'financial_period_reason_required' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO p FROM public.financial_fiscal_periods WHERE business_id=p_business_id AND id=p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_period_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  IF p.locked THEN RETURN jsonb_build_object('period_id',p.id,'locked',true,'changed',false); END IF;
  SELECT id INTO earliest FROM public.financial_fiscal_periods WHERE business_id=p_business_id AND NOT locked ORDER BY start_date,id LIMIT 1;
  IF earliest IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'financial_period_lock_out_of_order' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  audit_id := gen_random_uuid()::text;
  UPDATE public.financial_fiscal_periods SET locked=true,locked_at=clock_timestamp(),locked_by=COALESCE(p_actor_id,p_actor_type)
    WHERE business_id=p_business_id AND id=p.id;
  INSERT INTO public.financial_period_lock_audit(id,business_id,period_id,action,actor_type,actor_id,reason)
    VALUES(audit_id,p_business_id,p.id,'lock',p_actor_type,p_actor_id,p_reason);
  event_id := public.financial_append(p_business_id,'period_locked',clock_timestamp(),p.end_date,'ledger_period',p.id,
    'fin_period_'||p.id,NULL,'period_locked:'||audit_id,NULL,NULL,
    jsonb_build_object('period_id',p.id,'fiscal_year_id',p.fiscal_year_id,'start_date',p.start_date,'end_date',p.end_date,'reason',p_reason),p_actor_type,p_actor_id);
  RETURN jsonb_build_object('period_id',p.id,'locked',true,'changed',true,'audit_id',audit_id,'event_id',event_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.unlock_financial_period(
  p_business_id TEXT,p_period_id TEXT,p_reason TEXT,p_actor_type TEXT,p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE p public.financial_fiscal_periods%ROWTYPE; latest TEXT; audit_id TEXT; event_id TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'financial_period_unlock_reason_required' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO p FROM public.financial_fiscal_periods WHERE business_id=p_business_id AND id=p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_period_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  IF NOT p.locked THEN RETURN jsonb_build_object('period_id',p.id,'locked',false,'changed',false); END IF;
  SELECT id INTO latest FROM public.financial_fiscal_periods WHERE business_id=p_business_id AND locked ORDER BY start_date DESC,id DESC LIMIT 1;
  IF latest IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'financial_period_unlock_out_of_order' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  audit_id := gen_random_uuid()::text;
  UPDATE public.financial_fiscal_periods SET locked=false,locked_at=NULL,locked_by=NULL WHERE business_id=p_business_id AND id=p.id;
  INSERT INTO public.financial_period_lock_audit(id,business_id,period_id,action,actor_type,actor_id,reason)
    VALUES(audit_id,p_business_id,p.id,'unlock',p_actor_type,p_actor_id,p_reason);
  event_id := public.financial_append(p_business_id,'period_unlocked',clock_timestamp(),p.end_date,'ledger_period',p.id,
    'fin_period_'||p.id,NULL,'period_unlocked:'||audit_id,NULL,NULL,
    jsonb_build_object('period_id',p.id,'fiscal_year_id',p.fiscal_year_id,'start_date',p.start_date,'end_date',p.end_date,'reason',p_reason),p_actor_type,p_actor_id);
  RETURN jsonb_build_object('period_id',p.id,'locked',false,'changed',true,'audit_id',audit_id,'event_id',event_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.consume_financial_event_for_ledger(
  p_business_id TEXT,p_event_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE e public.financial_events%ROWTYPE; r public.financial_ledger_rules%ROWTYPE; rules INTEGER; y TEXT; s TEXT; lines JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO e FROM public.financial_events WHERE business_id=p_business_id AND id=p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_ledger_event_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  SELECT count(*) INTO rules FROM public.financial_ledger_rules WHERE business_id=p_business_id AND event_type=e.event_type AND enabled;
  IF rules=0 THEN RETURN jsonb_build_object('state','no_rule','event_id',e.id); END IF;
  IF rules>1 THEN RAISE EXCEPTION 'financial_ledger_rule_ambiguous' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO r FROM public.financial_ledger_rules WHERE business_id=p_business_id AND event_type=e.event_type AND enabled;
  IF e.amount_minor IS NULL OR e.amount_minor <= 0 OR e.currency IS NULL OR e.effective_date IS NULL THEN
    RAISE EXCEPTION 'financial_ledger_event_not_postable' USING ERRCODE='check_violation';
  END IF;
  SELECT id INTO y FROM public.financial_fiscal_years WHERE business_id=p_business_id AND e.effective_date BETWEEN start_date AND end_date;
  IF y IS NULL THEN RAISE EXCEPTION 'financial_fiscal_year_for_date_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  SELECT id INTO s FROM public.financial_voucher_series WHERE business_id=p_business_id AND fiscal_year_id=y AND code=r.series_code;
  IF s IS NULL THEN RAISE EXCEPTION 'financial_ledger_rule_series_not_found' USING ERRCODE='foreign_key_violation'; END IF;
  lines := jsonb_build_array(
    jsonb_build_object('account_id',r.debit_account_id,'debit_minor',e.amount_minor::text,'credit_minor','0'),
    jsonb_build_object('account_id',r.credit_account_id,'debit_minor','0','credit_minor',e.amount_minor::text));
  RETURN jsonb_build_object('state','posted','event_id',e.id,'voucher',public.financial_post_voucher_internal(
    p_business_id,s,e.effective_date,e.currency,'Rule '||r.id||' · '||e.event_type,
    'financial_event',e.id,'ledger_rule:'||r.id||':event:'||e.id,lines,'system',NULL,NULL));
END $fn$;

DO $rls$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_ledger_accounts','financial_fiscal_years','financial_fiscal_periods','financial_voucher_series',
    'financial_vouchers','financial_voucher_lines','financial_period_lock_audit','financial_ledger_rules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))',t||'_tenant_read',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated,service_role',t);
  END LOOP;
END $rls$;

DO $grants$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT oid::regprocedure sig,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname = ANY(ARRAY[
    'financial_ledger_immutable','financial_normalize_ledger_lines','financial_voucher_lines_json','financial_voucher_json',
    'create_financial_ledger_account','create_financial_fiscal_year','create_financial_voucher_series','financial_post_voucher_internal',
    'post_financial_voucher','reverse_financial_voucher','lock_financial_period','unlock_financial_period','consume_financial_event_for_ledger']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
    IF f.proname = ANY(ARRAY['create_financial_ledger_account','create_financial_fiscal_year','create_financial_voucher_series',
      'post_financial_voucher','reverse_financial_voucher','lock_financial_period','unlock_financial_period','consume_financial_event_for_ledger']) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
    END IF;
  END LOOP;
END $grants$;

COMMIT;
