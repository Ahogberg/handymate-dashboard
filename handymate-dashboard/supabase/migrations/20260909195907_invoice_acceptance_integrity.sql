-- Server-only atomic invoice + source ownership. Apply before deploying callers.
BEGIN;
ALTER TABLE public.invoice ADD COLUMN create_request_key text;
ALTER TABLE public.invoice ADD COLUMN create_request_intent jsonb;
CREATE UNIQUE INDEX invoice_create_request_unique ON public.invoice(business_id,create_request_key) WHERE create_request_key IS NOT NULL;

CREATE FUNCTION public.create_invoice_with_sources(p_row jsonb,p_key text,p_intent jsonb,
 p_times text[] DEFAULT '{}',p_materials text[] DEFAULT '{}',p_changes text[] DEFAULT '{}')
RETURNS public.invoice LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE b text:=p_row->>'business_id'; i public.invoice; cols text; n integer;
BEGIN
 IF b IS NULL OR nullif(p_key,'') IS NULL OR p_intent IS NULL THEN RAISE EXCEPTION 'invoice_request_required'; END IF;
 -- All callers acquire the same business lock, including overlapping source sets.
 PERFORM 1 FROM public.business_config WHERE business_id=b FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'business_missing'; END IF;
 SELECT * INTO i FROM public.invoice WHERE business_id=b AND create_request_key=p_key;
 IF FOUND THEN
  IF i.create_request_intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'invoice_request_changed'; END IF;
  RETURN i;
 END IF;
 IF p_row->>'project_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project WHERE project_id=p_row->>'project_id' AND business_id=b AND customer_id IS NOT DISTINCT FROM p_row->>'customer_id') THEN RAISE EXCEPTION 'invoice_project_mismatch'; END IF;
 IF p_row->>'customer_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customer WHERE customer_id=p_row->>'customer_id' AND business_id=b) THEN RAISE EXCEPTION 'invoice_customer_mismatch'; END IF;
 p_times:=coalesce(p_times,'{}');p_materials:=coalesce(p_materials,'{}');p_changes:=coalesce(p_changes,'{}');
 IF cardinality(p_times)<>(SELECT count(DISTINCT x) FROM unnest(p_times) x)
 OR cardinality(p_materials)<>(SELECT count(DISTINCT x) FROM unnest(p_materials) x)
 OR cardinality(p_changes)<>(SELECT count(DISTINCT x) FROM unnest(p_changes) x) THEN RAISE EXCEPTION 'invoice_sources_invalid'; END IF;
 p_row:=p_row||jsonb_build_object('create_request_key',p_key,'create_request_intent',p_intent);
 -- Only supplied, quoted column identifiers; values remain a bound JSON parameter.
 -- Omitted columns retain table defaults (unlike inserting an entire populated record).
 SELECT string_agg(format('%I',key),',' ORDER BY key) INTO cols FROM jsonb_object_keys(p_row) key;
 EXECUTE format('INSERT INTO public.invoice(%s) SELECT %s FROM jsonb_populate_record(NULL::public.invoice,$1) RETURNING *',cols,cols) INTO i USING p_row;
 UPDATE public.time_entry t SET invoiced=true,invoice_id=i.invoice_id
 WHERE t.business_id=b AND t.time_entry_id=ANY(p_times) AND t.invoice_id IS NULL AND NOT coalesce(t.invoiced,false)
 AND (i.project_id IS NULL OR t.project_id=i.project_id)
 AND (t.customer_id=i.customer_id OR EXISTS(SELECT 1 FROM public.project p WHERE p.project_id=t.project_id AND p.business_id=b AND p.customer_id=i.customer_id));
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>cardinality(p_times) THEN RAISE EXCEPTION 'invoice_source_conflict'; END IF;
 UPDATE public.project_material m SET invoiced=true,invoice_id=i.invoice_id
 WHERE m.business_id=b AND m.material_id=ANY(p_materials) AND m.invoice_id IS NULL AND NOT coalesce(m.invoiced,false)
 AND (i.project_id IS NULL OR m.project_id=i.project_id)
 AND EXISTS(SELECT 1 FROM public.project p WHERE p.project_id=m.project_id AND p.business_id=b AND p.customer_id=i.customer_id);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>cardinality(p_materials) THEN RAISE EXCEPTION 'invoice_source_conflict'; END IF;
 UPDATE public.project_change a SET status='invoiced',invoice_id=i.invoice_id,invoiced_at=now()
 WHERE a.business_id=b AND a.change_id=ANY(p_changes) AND a.invoice_id IS NULL AND a.status IN ('approved','signed')
 AND (i.project_id IS NULL OR a.project_id=i.project_id)
 AND EXISTS(SELECT 1 FROM public.project p WHERE p.project_id=a.project_id AND p.business_id=b AND p.customer_id=i.customer_id);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>cardinality(p_changes) THEN RAISE EXCEPTION 'invoice_source_conflict'; END IF;
 RETURN i;
END; $$;
REVOKE ALL ON FUNCTION public.create_invoice_with_sources(jsonb,text,jsonb,text[],text[],text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_sources(jsonb,text,jsonb,text[],text[],text[]) TO service_role;
COMMIT;

-- An acceptance and its completion journal must commit together.
BEGIN;
CREATE TABLE public.quote_acceptance_completion (
 business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 quote_id text NOT NULL REFERENCES public.quotes(quote_id) ON DELETE CASCADE,
 project_state text NOT NULL DEFAULT 'pending',
 deal_state text NOT NULL DEFAULT 'pending',
 email_state text NOT NULL DEFAULT 'pending',
 project_claim text,deal_claim text,email_claim text,
 project_claimed_at timestamptz,deal_claimed_at timestamptz,email_claimed_at timestamptz,
 project_error text,deal_error text,email_error text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,quote_id),
 CHECK(project_state IN ('pending','running','done','failed')),
 CHECK(deal_state IN ('pending','running','done','failed','skipped')),
 CHECK(email_state IN ('pending','running','done','skipped','uncertain','failed'))
);
ALTER TABLE public.quote_acceptance_completion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_acceptance_completion FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.quote_acceptance_completion TO service_role;
CREATE POLICY acceptance_service ON public.quote_acceptance_completion TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.queue_quote_acceptance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.status='accepted' THEN
  INSERT INTO public.quote_acceptance_completion(business_id,quote_id) VALUES(NEW.business_id,NEW.quote_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.queue_quote_acceptance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER quote_acceptance_queue AFTER INSERT OR UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.queue_quote_acceptance();
-- No historical email backfill: old accepts must never resend automatically.

CREATE FUNCTION public.claim_quote_acceptance_step(p_business text,p_quote text,p_step text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.quote_acceptance_completion; state text; claimed timestamptz; token text:=gen_random_uuid()::text;
BEGIN
 IF p_step NOT IN ('project','deal','email') THEN RAISE EXCEPTION 'invalid_step'; END IF;
 PERFORM 1 FROM public.quotes WHERE business_id=p_business AND quote_id=p_quote AND status='accepted';
 IF NOT FOUND THEN RAISE EXCEPTION 'quote_not_accepted'; END IF;
 SELECT * INTO r FROM public.quote_acceptance_completion WHERE business_id=p_business AND quote_id=p_quote FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'acceptance_journal_missing'; END IF;
 state:=to_jsonb(r)->>(p_step||'_state');claimed:=(to_jsonb(r)->>(p_step||'_claimed_at'))::timestamptz;
 IF state IN ('done','skipped','uncertain') THEN RETURN NULL; END IF;
 -- Email claims NEVER expire into a retry: a lost provider receipt is uncertain.
 IF state='running' AND (p_step='email' OR claimed>now()-interval '5 minutes') THEN RETURN NULL; END IF;
 EXECUTE format('UPDATE public.quote_acceptance_completion SET %I=$1,%I=$2,%I=now(),%I=NULL,updated_at=now() WHERE business_id=$3 AND quote_id=$4',p_step||'_state',p_step||'_claim',p_step||'_claimed_at',p_step||'_error') USING 'running',token,p_business,p_quote;
 RETURN token;
END; $$;

CREATE FUNCTION public.finish_quote_acceptance_step(p_business text,p_quote text,p_step text,p_claim text,p_state text,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
 IF p_step NOT IN ('project','deal','email') OR p_state NOT IN ('done','failed','skipped','uncertain') OR (p_step<>'email' AND p_state='uncertain') OR (p_step='project' AND p_state='skipped') THEN RAISE EXCEPTION 'invalid_step_result'; END IF;
 EXECUTE format('UPDATE public.quote_acceptance_completion SET %I=$1,%I=$2,updated_at=now() WHERE business_id=$3 AND quote_id=$4 AND %I=$5 AND %I=$6',p_step||'_state',p_step||'_error',p_step||'_claim',p_step||'_state') USING p_state,left(p_error,500),p_business,p_quote,p_claim,'running';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'acceptance_stale_claim'; END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.claim_quote_acceptance_step(text,text,text),public.finish_quote_acceptance_step(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_quote_acceptance_step(text,text,text),public.finish_quote_acceptance_step(text,text,text,text,text,text) TO service_role;
COMMIT;
