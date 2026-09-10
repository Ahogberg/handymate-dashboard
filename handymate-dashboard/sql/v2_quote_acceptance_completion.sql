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
