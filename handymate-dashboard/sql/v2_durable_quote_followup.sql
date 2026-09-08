-- Durable preparation only. No network calls and no automatic sends.
BEGIN;
CREATE TABLE public.agent_followup_runner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  last_tick_at timestamptz,
  last_error text
);
INSERT INTO public.agent_followup_runner(singleton) VALUES(true);
CREATE TABLE public.agent_followup (
  id text PRIMARY KEY DEFAULT ('afu_' || gen_random_uuid()::text),
  business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  quote_id text NOT NULL REFERENCES public.quotes(quote_id) ON DELETE CASCADE,
  mission_id text REFERENCES public.mission(id) ON DELETE CASCADE,
  created_by text REFERENCES public.business_users(id) ON DELETE SET NULL,
  request_key text NOT NULL CHECK(length(request_key) BETWEEN 8 AND 100),
  due_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  source_fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'scheduled' CHECK(state IN ('scheduled','prepared','completed','cancelled','blocked','failed')),
  reason text,
  approval_id text REFERENCES public.pending_approvals(id),
  attempts integer NOT NULL DEFAULT 0,
  send_claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  resolved_at timestamptz,
  UNIQUE(business_id,request_key)
);
CREATE UNIQUE INDEX agent_followup_one_open_quote ON public.agent_followup(business_id,quote_id) WHERE state IN ('scheduled','prepared');
CREATE INDEX agent_followup_due ON public.agent_followup(next_attempt_at) WHERE state IN ('scheduled','prepared');
CREATE INDEX agent_followup_sms_time ON public.sms_log(business_id,created_at);
CREATE INDEX agent_followup_email_time ON public.email_conversations(business_id,created_at);
CREATE INDEX agent_followup_portal_time ON public.customer_message(business_id,created_at);
CREATE INDEX agent_followup_recording_time ON public.call_recording(business_id,created_at);
CREATE INDEX agent_followup_call_time ON public.call(business_id,started_at);
CREATE TABLE public.agent_followup_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  followup_id text NOT NULL REFERENCES public.agent_followup(id) ON DELETE CASCADE,
  business_id text NOT NULL,
  state text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_followup_event_parent ON public.agent_followup_event(followup_id,id);
ALTER TABLE public.agent_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_followup_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_followup_runner ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_followup,public.agent_followup_event,public.agent_followup_runner FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_followup,public.agent_followup_event,public.agent_followup_runner TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.agent_followup_event_id_seq TO service_role;
CREATE POLICY followup_service ON public.agent_followup TO service_role USING(true) WITH CHECK(true);
CREATE POLICY followup_event_service ON public.agent_followup_event TO service_role USING(true) WITH CHECK(true);
CREATE POLICY followup_runner_service ON public.agent_followup_runner TO service_role USING(true) WITH CHECK(true);

-- Same Swedish normalization rules as lib/phone-normalize.ts, covered by parity tests.
CREATE FUNCTION public.agent_followup_phone(p_phone text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE cleaned text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
BEGIN
 IF cleaned LIKE '0046%' THEN cleaned:='+46'||substring(cleaned FROM 5); END IF;
 IF cleaned LIKE '+46%' THEN RETURN cleaned; END IF;
 IF cleaned LIKE '46%' AND length(cleaned)>=11 THEN RETURN '+'||cleaned; END IF;
 IF cleaned LIKE '0%' AND length(cleaned)>=7 THEN RETURN '+46'||substring(cleaned FROM 2); END IF;
 RETURN trim(coalesce(p_phone,''));
END;
$$;
REVOKE ALL ON FUNCTION public.agent_followup_phone(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_followup_phone(text) TO service_role;

CREATE FUNCTION public.agent_followup_fingerprint(q public.quotes,c public.customer) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
SELECT md5(jsonb_build_object('customer',q.customer_id,'title',q.title,'description',q.description,
 'items',q.items,'total',q.total,'customer_pays',q.customer_pays,'terms',q.terms,
 'valid_until',q.valid_until,'sent_at',q.sent_at,'phone',c.phone_number,'email',c.email,
 'rows',(SELECT coalesce(jsonb_agg(to_jsonb(i)-'created_at' ORDER BY i.id),'[]'::jsonb) FROM public.quote_items i WHERE i.quote_id=q.quote_id AND i.business_id=q.business_id))::text);
$$;
CREATE FUNCTION public.agent_followup_guard(p_id text,p_business text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE f public.agent_followup; q public.quotes; c public.customer; b public.business_config;
BEGIN
 SELECT * INTO f FROM public.agent_followup WHERE id=p_id AND business_id=p_business;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 SELECT * INTO b FROM public.business_config WHERE business_id=f.business_id;
 IF NOT FOUND OR b.agents_globally_paused IS TRUE THEN RETURN 'team_paused'; END IF;
 IF NOT coalesce((coalesce(b.subscription_status,'') IN ('active','comp') OR
   (b.subscription_status IN ('trial','trialing') AND b.onboarding_completed_at IS NOT NULL AND b.trial_ends_at > now())),false) THEN RETURN 'team_inactive'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.business_users WHERE id=f.created_by AND business_id=f.business_id AND is_active IS TRUE AND role IN ('owner','admin')) THEN RETURN 'owner_unavailable'; END IF;
 IF f.mission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.mission WHERE id=f.mission_id AND business_id=f.business_id AND status='active' AND deadline >= (now() AT TIME ZONE 'Europe/Stockholm')::date) THEN RETURN 'mission_ended'; END IF;
 SELECT * INTO q FROM public.quotes WHERE quote_id=f.quote_id AND business_id=f.business_id;
 IF NOT FOUND OR q.status IS NULL OR q.status NOT IN ('sent','opened') OR q.sent_at IS NULL OR q.accepted_at IS NOT NULL OR q.declined_at IS NOT NULL THEN RETURN 'quote_closed'; END IF;
 IF EXISTS(SELECT 1 FROM public.quotes newer WHERE newer.business_id=f.business_id AND coalesce(newer.parent_quote_id,newer.quote_id)=coalesce(q.parent_quote_id,q.quote_id) AND coalesce(newer.version_number,1)>coalesce(q.version_number,1)) THEN RETURN 'source_changed'; END IF;
 IF q.valid_until IS NOT NULL AND q.valid_until < (now() AT TIME ZONE 'Europe/Stockholm')::date THEN RETURN 'quote_expired'; END IF;
 SELECT * INTO c FROM public.customer WHERE customer_id=q.customer_id AND business_id=f.business_id;
 IF NOT FOUND OR public.agent_followup_phone(c.phone_number) !~ '^\+[1-9][0-9]{7,14}$' OR c.sms_opt_out IS TRUE THEN RETURN 'recipient_unavailable'; END IF;
 IF public.agent_followup_fingerprint(q,c) <> f.source_fingerprint THEN RETURN 'source_changed'; END IF;
 -- Any new customer contact is treated conservatively. No model guesses whether it was a reply.
 IF EXISTS(SELECT 1 FROM public.sms_log WHERE business_id=f.business_id AND created_at>=f.created_at AND direction IN ('inbound','incoming') AND (customer_id=c.customer_id OR public.agent_followup_phone(phone_from)=public.agent_followup_phone(c.phone_number)))
 OR EXISTS(SELECT 1 FROM public.email_conversations WHERE business_id=f.business_id AND created_at>=f.created_at AND direction IN ('inbound','incoming') AND (customer_id=c.customer_id OR lower(from_email)=lower(c.email)))
 OR EXISTS(SELECT 1 FROM public.customer_message WHERE business_id=f.business_id AND customer_id=c.customer_id AND created_at>=f.created_at AND direction IN ('inbound','incoming'))
 OR EXISTS(SELECT 1 FROM public.call_recording WHERE business_id=f.business_id AND created_at>=f.created_at AND direction IN ('inbound','incoming') AND (customer_id=c.customer_id OR public.agent_followup_phone(from_number)=public.agent_followup_phone(c.phone_number)))
 OR EXISTS(SELECT 1 FROM public.call WHERE business_id=f.business_id AND started_at>=f.created_at AND direction IN ('inbound','incoming') AND (customer_id=c.customer_id OR public.agent_followup_phone(phone_number)=public.agent_followup_phone(c.phone_number)))
 OR EXISTS(SELECT 1 FROM public.communication_log WHERE business_id=f.business_id AND customer_id=c.customer_id AND created_at>=f.created_at AND direction IN ('inbound','incoming')) THEN RETURN 'customer_contact'; END IF;
 IF EXISTS(SELECT 1 FROM public.sms_log WHERE business_id=f.business_id AND related_id=f.quote_id AND created_at>=f.created_at AND direction='outbound' AND status NOT IN ('failed','error'))
 OR EXISTS(SELECT 1 FROM public.communication_log WHERE business_id=f.business_id AND customer_id=c.customer_id AND created_at>=f.created_at AND direction='outbound' AND status NOT IN ('failed','error'))
 OR EXISTS(SELECT 1 FROM public.email_conversations WHERE business_id=f.business_id AND customer_id=c.customer_id AND created_at>=f.created_at AND direction='outbound')
 THEN RETURN 'already_contacted'; END IF;
 RETURN NULL;
END;
$$;

CREATE FUNCTION public.schedule_agent_followup(p_business text,p_user text,p_quote text,p_due timestamptz,p_key text,p_mission text DEFAULT NULL)
RETURNS public.agent_followup LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE f public.agent_followup; q public.quotes; c public.customer; reason text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.business_users WHERE id=p_user AND business_id=p_business AND is_active IS TRUE AND role IN ('owner','admin')) THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.quotes WHERE quote_id=p_quote AND business_id=p_business FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'quote_missing' USING ERRCODE='P0002'; END IF;
 SELECT * INTO f FROM public.agent_followup WHERE business_id=p_business AND request_key=p_key;
 IF FOUND THEN
  IF f.quote_id<>p_quote OR f.due_at<>p_due OR f.mission_id IS DISTINCT FROM p_mission THEN RAISE EXCEPTION 'request_changed'; END IF;
  RETURN f;
 END IF;
 IF p_due IS NULL OR p_due<now()+interval '1 minute' OR p_due>now()+interval '90 days' THEN RAISE EXCEPTION 'invalid_due'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_followup_runner WHERE enabled AND last_tick_at > now()-interval '5 minutes') THEN RAISE EXCEPTION 'runner_unavailable'; END IF;
 IF p_mission IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.mission WHERE id=p_mission AND business_id=p_business AND status='active' AND deadline >= (p_due AT TIME ZONE 'Europe/Stockholm')::date) THEN RAISE EXCEPTION 'mission_ended'; END IF;
 IF q.valid_until IS NOT NULL AND q.valid_until < (p_due AT TIME ZONE 'Europe/Stockholm')::date THEN RAISE EXCEPTION 'due_after_quote'; END IF;
 SELECT * INTO c FROM public.customer WHERE customer_id=q.customer_id AND business_id=p_business;
 IF NOT FOUND THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;
 INSERT INTO public.agent_followup(business_id,quote_id,mission_id,created_by,request_key,due_at,next_attempt_at,source_fingerprint)
 VALUES(p_business,p_quote,p_mission,p_user,p_key,p_due,p_due,public.agent_followup_fingerprint(q,c)) RETURNING * INTO f;
 reason:=public.agent_followup_guard(f.id,p_business);
 IF reason IS NOT NULL THEN RAISE EXCEPTION '%',reason; END IF;
 INSERT INTO public.agent_followup_event(followup_id,business_id,state) VALUES(f.id,p_business,'scheduled');
 RETURN f;
END;
$$;

CREATE FUNCTION public.cancel_agent_followup(p_business text,p_user text,p_id text) RETURNS public.agent_followup
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE f public.agent_followup; a public.pending_approvals;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.business_users WHERE id=p_user AND business_id=p_business AND is_active IS TRUE AND role IN ('owner','admin')) THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM public.agent_followup WHERE business_id=p_business AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'missing' USING ERRCODE='P0002'; END IF;
 IF f.state NOT IN ('scheduled','prepared') THEN RETURN f; END IF;
 IF f.approval_id IS NOT NULL THEN
  SELECT * INTO a FROM public.pending_approvals WHERE id=f.approval_id AND business_id=p_business FOR UPDATE;
  IF FOUND AND a.status NOT IN ('pending','rejected','expired','cancelled') THEN RAISE EXCEPTION 'approval_in_progress'; END IF;
  UPDATE public.pending_approvals SET status='rejected',resolved_at=now(),resolved_by=p_user WHERE id=f.approval_id AND business_id=p_business AND status='pending';
 END IF;
 UPDATE public.agent_followup SET state='cancelled',reason='owner_cancelled',resolved_at=now(),checked_at=now() WHERE id=p_id RETURNING * INTO f;
 INSERT INTO public.agent_followup_event(followup_id,business_id,state,reason) VALUES(f.id,p_business,f.state,f.reason);
 RETURN f;
END;
$$;

CREATE FUNCTION public.run_agent_followups(p_limit integer DEFAULT 50) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
<<worker>>
DECLARE f public.agent_followup; a public.pending_approvals; q public.quotes; c public.customer;
 reason text; next_state text; n integer:=0; aid text; msg text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.agent_followup_runner WHERE enabled) THEN RETURN 0; END IF;
 UPDATE public.agent_followup_runner SET last_tick_at=now(),last_error=NULL WHERE singleton;
 FOR f IN SELECT * FROM public.agent_followup WHERE (state='scheduled' AND next_attempt_at<=now()) OR (state='prepared' AND next_attempt_at<=now())
  ORDER BY next_attempt_at,id LIMIT greatest(1,least(p_limit,200)) FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   reason:=NULL; next_state:=NULL;
   IF f.state='prepared' THEN
    SELECT * INTO a FROM public.pending_approvals WHERE id=f.approval_id AND business_id=f.business_id;
    IF NOT FOUND THEN next_state:='blocked';reason:='approval_missing';
    ELSIF a.payload->'execution_result'->>'outcome'='success' THEN next_state:='completed';reason:='action_confirmed';
    ELSIF a.status IN ('rejected','expired','cancelled') THEN next_state:='cancelled';reason:='approval_closed';
    ELSIF a.status IS DISTINCT FROM 'pending' THEN
     UPDATE public.agent_followup SET reason='execution_unconfirmed',checked_at=now(),next_attempt_at=now()+interval '1 minute' WHERE id=f.id;
     CONTINUE;
    ELSE
     reason:=public.agent_followup_guard(f.id,f.business_id);
     IF reason IS NOT NULL THEN
      -- Never revoke an action another request already claimed.
      UPDATE public.pending_approvals SET status='expired',resolved_at=now() WHERE id=a.id AND business_id=f.business_id AND status='pending';
      IF NOT FOUND THEN CONTINUE; END IF;
      next_state:='blocked';
     END IF;
    END IF;
   ELSE
    reason:=public.agent_followup_guard(f.id,f.business_id);
    IF reason IS NOT NULL THEN next_state:='blocked';
    ELSIF f.due_at < now()-interval '24 hours' THEN next_state:='blocked';reason:='missed_window';
    ELSIF EXISTS(SELECT 1 FROM public.pending_approvals WHERE business_id=f.business_id AND status='pending' AND (payload->>'related_id'=f.quote_id OR payload->>'quote_id'=f.quote_id OR payload->>'entity_id'=f.quote_id)) THEN next_state:='blocked';reason:='existing_decision';
    ELSE
     SELECT * INTO q FROM public.quotes WHERE quote_id=f.quote_id AND business_id=f.business_id;
     SELECT * INTO c FROM public.customer WHERE customer_id=q.customer_id AND business_id=f.business_id;
     aid:='appr_'||f.id;
     msg:='Hej! Jag följer upp vår offert'||CASE WHEN coalesce(q.title,'')<>'' THEN ' om '||left(q.title,120) ELSE '' END||'. Har du några frågor eller vill du gå vidare? Hör gärna av dig.';
     INSERT INTO public.pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,expires_at)
     VALUES(aid,f.business_id,'send_sms','Granska offertuppföljningen','Daniel har förberett en uppföljning. Granska mottagare och text innan du skickar.',
      jsonb_build_object('to',public.agent_followup_phone(c.phone_number),'message',msg,'customer_id',c.customer_id,'customer_name',c.name,
       'related_id',q.quote_id,'quote_id',q.quote_id,'agent_id','daniel','autonomy_key','quote_followup_sms',
       'amount_kr',coalesce(q.customer_pays,q.total),'followup_id',f.id,'mission_id',f.mission_id,'requires_manual_approval',true),
      'pending','medium',least(now()+interval '7 days',coalesce((q.valid_until+1)::timestamp AT TIME ZONE 'Europe/Stockholm',now()+interval '7 days')));
     UPDATE public.agent_followup SET approval_id=aid WHERE id=f.id;
     next_state:='prepared';reason:='review_required';
    END IF;
   END IF;
   IF next_state IS NOT NULL THEN
    UPDATE public.agent_followup SET state=next_state,reason=worker.reason,checked_at=now(),
     resolved_at=CASE WHEN next_state='prepared' THEN NULL ELSE now() END WHERE id=f.id;
    INSERT INTO public.agent_followup_event(followup_id,business_id,state,reason) VALUES(f.id,f.business_id,next_state,reason);
    n:=n+1;
   ELSE UPDATE public.agent_followup SET checked_at=now(),next_attempt_at=now()+interval '1 minute' WHERE id=f.id;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   -- Subtransaction rolls back card + receipt together. Bounded retries cannot duplicate cards.
   UPDATE public.agent_followup SET attempts=attempts+1,reason='preparation_failed',checked_at=now(),
    state=CASE WHEN attempts>=4 THEN 'failed' ELSE state END,
    next_attempt_at=now()+interval '5 minutes'*(attempts+1) WHERE id=f.id;
   INSERT INTO public.agent_followup_event(followup_id,business_id,state,reason) VALUES(f.id,f.business_id,'retry','preparation_failed');
   UPDATE public.agent_followup_runner SET last_error='preparation_failed' WHERE singleton;
  END;
 END LOOP;
 RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_followup_fingerprint(public.quotes,public.customer),public.agent_followup_guard(text,text),public.schedule_agent_followup(text,text,text,timestamptz,text,text),public.cancel_agent_followup(text,text,text),public.run_agent_followups(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_followup_fingerprint(public.quotes,public.customer),public.agent_followup_guard(text,text),public.schedule_agent_followup(text,text,text,timestamptz,text,text),public.cancel_agent_followup(text,text,text),public.run_agent_followups(integer) TO service_role;
CREATE FUNCTION public.claim_agent_followup_send(p_business text,p_id text,p_approval text,p_to text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE f public.agent_followup; reason text;
BEGIN
 SELECT * INTO f FROM public.agent_followup WHERE id=p_id AND business_id=p_business FOR UPDATE;
 IF NOT FOUND OR f.state<>'prepared' OR f.approval_id IS DISTINCT FROM p_approval OR f.send_claimed_at IS NOT NULL THEN RAISE EXCEPTION 'followup_not_sendable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pending_approvals WHERE id=p_approval AND business_id=p_business AND status='approved' AND payload->>'to'=p_to AND payload->>'followup_id'=p_id) THEN RAISE EXCEPTION 'approval_required'; END IF;
 reason:=public.agent_followup_guard(p_id,p_business);
 IF reason IS NOT NULL THEN RAISE EXCEPTION '%',reason; END IF;
 UPDATE public.agent_followup SET send_claimed_at=now() WHERE id=p_id;
 INSERT INTO public.agent_followup_event(followup_id,business_id,state,reason) VALUES(p_id,p_business,'send_claimed','manual_approval');
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_agent_followup_send(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_followup_send(text,text,text,text) TO service_role;

COMMIT;
