-- H1/H2. Applied to production 2026-09-15. H3b is v249 (it replaces stop_supervised_autonomy below).
-- No grants to customers or external dispatch occur on migration.
BEGIN;
CREATE TABLE public.handoff_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 source_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('expired','autonomy')),
 title text NOT NULL,
 autonomy_key text,
 outcome text,
 mode text,
 outcome_finished_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 digest_day date,
 UNIQUE(business_id,source_key)
);
CREATE TABLE public.handoff_digests (
 business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 day date NOT NULL,
 attempt_token uuid NOT NULL DEFAULT gen_random_uuid(),
 snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'attempting' CHECK(status IN ('attempting','delivered','failed','unknown')),
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 PRIMARY KEY(business_id,day)
);
CREATE TABLE public.autonomy_consents (
 business_id text PRIMARY KEY REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 answer boolean NOT NULL,
 actor_id text NOT NULL,
 answered_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.autonomy_controls (
 business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 key text NOT NULL CHECK(key IN ('invoice_reminder','booking_reminder','quote_followup_sms','review_request')),
 granted boolean NOT NULL,
 mode text NOT NULL CHECK(mode IN ('supervised','earned')),
 source text NOT NULL CHECK(source IN ('consent','customer','streak','failure','offer')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 cooldown_until timestamptz,
 PRIMARY KEY(business_id,key)
);
ALTER TABLE public.pending_approvals ADD COLUMN IF NOT EXISTS card_kind text NOT NULL DEFAULT 'decision' CHECK(card_kind IN ('decision','notice'));
CREATE INDEX handoff_items_unreported ON public.handoff_items(business_id,created_at) WHERE digest_day IS NULL;
CREATE INDEX handoff_notices ON public.pending_approvals(business_id,created_at) WHERE card_kind='notice';
CREATE OR REPLACE FUNCTION public.handoff_card_kind(p_type text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_type = ANY(ARRAY['agent_observation','dispatch_suggestion','agent_insight','monthly_review','monday_brief','quote_signed','ata_signed_notification','ata_declined_notification','profitability_warning','meeting_summary','autonomy_revoked','team_intro','expectation_drift_signal','promise_deadline_signal','mandate_paused_signal','external_delivery_failure_signal','payment_failed_signal','kort_gar_ut']) THEN 'notice' ELSE 'decision' END
$$;
CREATE OR REPLACE FUNCTION public.handoff_expiry_days(p_type text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE
  WHEN p_type='autonomy_offer' THEN 14
  WHEN p_type = ANY(ARRAY['send_sms','send_email','send_quote','send_invoice','send_matte_customer_reply','quote_nudge','confirm_payment','create_booking','create_quote_draft','create_ata_draft','create_invoice_from_report','autopilot_package','review_request','scheduled_review_request','yearly_followup','proactive_care','warranty_followup','seasonal_campaign','customer_reactivation','customer_message','customer_quote_question','quote_request','quote_addition','propose_booking_times','propose_site_visit','reschedule_request','new_booking_request','publish_microsite','invoice_reminder','automation','price_adjustment','fakturera_projekt','playbook_pattern_confirmation','playbook_kickoff_suggestion','operating_experiment_proposal','operating_experiment_readout','missad_intakt','jobbpass_proposal','deal_flow_site_visit','cert_expiry_reminder','low_stock_alert','meeting_followup','project_log_note','customer_fact','agent_memory_confirmation']) THEN 7
  ELSE NULL
 END
$$;
CREATE OR REPLACE FUNCTION public.handoff_normalize_card() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE days integer;
BEGIN
 NEW.card_kind:=public.handoff_card_kind(NEW.approval_type);
 days:=public.handoff_expiry_days(NEW.approval_type);
 IF days IS NULL THEN
  NEW.expires_at:=NULL;
  IF TG_OP='UPDATE' AND OLD.status='pending' AND NEW.status='expired' THEN NEW.status:=OLD.status; NEW.resolved_at:=OLD.resolved_at; END IF;
 ELSIF TG_OP='INSERT' AND NEW.status='pending' THEN
  NEW.expires_at:=coalesce(NEW.created_at,now()) + make_interval(days=>days);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER handoff_normalize_card BEFORE INSERT OR UPDATE ON public.pending_approvals FOR EACH ROW EXECUTE FUNCTION public.handoff_normalize_card();
UPDATE public.pending_approvals SET
 card_kind=public.handoff_card_kind(approval_type),
 expires_at=CASE
  WHEN public.handoff_expiry_days(approval_type) IS NULL THEN NULL
  WHEN status='pending' THEN greatest(
   coalesce(expires_at,created_at+make_interval(days=>public.handoff_expiry_days(approval_type))),
   now()+interval '1 day')
  ELSE expires_at
 END;
CREATE OR REPLACE FUNCTION public.handoff_collect_expiry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status IS DISTINCT FROM 'expired' AND NEW.status='expired' AND NEW.card_kind='decision' THEN
  INSERT INTO public.handoff_items(business_id,source_key,kind,title) VALUES(NEW.business_id,'approval:'||NEW.id,'expired',NEW.title) ON CONFLICT(business_id,source_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER handoff_collect_expiry AFTER UPDATE ON public.pending_approvals FOR EACH ROW EXECUTE FUNCTION public.handoff_collect_expiry();

CREATE OR REPLACE FUNCTION public.answer_autonomy_consent(p_business_id text,p_actor_id text,p_answer boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text; inserted integer;
BEGIN
 IF p_answer IS NULL OR nullif(btrim(p_actor_id),'') IS NULL THEN RAISE EXCEPTION 'invalid_consent'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('autonomy:'||p_business_id,0));
 INSERT INTO public.autonomy_consents(business_id,actor_id,answer) VALUES(p_business_id,p_actor_id,p_answer) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN false; END IF;
 IF p_answer THEN
  INSERT INTO public.v3_automation_settings(business_id) VALUES(p_business_id) ON CONFLICT(business_id) DO NOTHING;
  FOREACH k IN ARRAY ARRAY['invoice_reminder','booking_reminder','quote_followup_sms','review_request'] LOOP
   -- Explicit prior off wins over delayed consent or stale requests.
   IF EXISTS(SELECT 1 FROM public.autonomy_controls WHERE business_id=p_business_id AND key=k)
    OR EXISTS(SELECT 1 FROM public.v3_automation_settings WHERE business_id=p_business_id AND earned_autonomy->k->>'status'='autonomous') THEN CONTINUE; END IF;
   INSERT INTO public.autonomy_controls(business_id,key,granted,mode,source) VALUES(p_business_id,k,true,'supervised','consent') ON CONFLICT(business_id,key) DO NOTHING;
   UPDATE public.v3_automation_settings SET earned_autonomy=coalesce(earned_autonomy,'{}'::jsonb)||jsonb_build_object(k,jsonb_build_object('status','autonomous','granted_at',now(),'mode','supervised','source','consent')) WHERE business_id=p_business_id;
  END LOOP;
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.stop_supervised_autonomy(p_business_id text,p_key text,p_source text DEFAULT 'customer') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_key<>ALL(ARRAY['invoice_reminder','booking_reminder','quote_followup_sms','review_request']) OR p_key IS NULL OR p_source<>ALL(ARRAY['customer','failure']) THEN RAISE EXCEPTION 'invalid_autonomy_key'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('autonomy:'||p_business_id,0));
 INSERT INTO public.autonomy_controls(business_id,key,granted,mode,source,cooldown_until) VALUES(p_business_id,p_key,false,'supervised',p_source,now()+interval '30 days')
 ON CONFLICT(business_id,key) DO UPDATE SET granted=false,source=EXCLUDED.source,updated_at=now(),cooldown_until=EXCLUDED.cooldown_until;
 UPDATE public.v3_automation_settings SET earned_autonomy=coalesce(earned_autonomy,'{}'::jsonb)-p_key WHERE business_id=p_business_id;
END $$;

CREATE OR REPLACE FUNCTION public.claim_handoff_digest(p_business_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d date:=(now() AT TIME ZONE 'Europe/Stockholm')::date; token uuid:=gen_random_uuid(); snap jsonb; items jsonb; decisions jsonb; remaining integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('handoff:'||p_business_id,0));
 IF EXISTS(SELECT 1 FROM public.handoff_digests WHERE business_id=p_business_id AND day=d) THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at,i.id),'[]') INTO items FROM public.handoff_items i WHERE business_id=p_business_id AND digest_day IS NULL AND (kind='expired' OR created_at < d::timestamp AT TIME ZONE 'Europe/Stockholm');
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO decisions FROM (
 SELECT id,title,approval_type,created_at,expires_at FROM public.pending_approvals WHERE business_id=p_business_id AND status='pending' AND card_kind='decision' AND (expires_at IS NULL OR expires_at>now()) AND (snoozed_until IS NULL OR snoozed_until<=now())
 ORDER BY expires_at ASC NULLS LAST,CASE WHEN expires_at IS NOT NULL AND (payload->>'amount_kr') ~ '^\d+(\.\d+)?$' THEN (payload->>'amount_kr')::numeric ELSE 0 END DESC,created_at ASC,id LIMIT 3) x;
 SELECT greatest(count(*)-jsonb_array_length(decisions),0)::integer INTO remaining FROM public.pending_approvals WHERE business_id=p_business_id AND status='pending' AND card_kind='decision' AND (expires_at IS NULL OR expires_at>now()) AND (snoozed_until IS NULL OR snoozed_until<=now());
 IF jsonb_array_length(items)=0 AND jsonb_array_length(decisions)=0 THEN RETURN NULL; END IF;
 snap:=jsonb_build_object('items',items,'decisions',decisions,'remaining',remaining);
 INSERT INTO public.handoff_digests(business_id,day,attempt_token,snapshot) VALUES(p_business_id,d,token,snap);
 UPDATE public.handoff_items SET digest_day=d WHERE business_id=p_business_id AND id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(items) x);
 RETURN snap||jsonb_build_object('day',d,'attempt_token',token);
END $$;
CREATE OR REPLACE FUNCTION public.finish_handoff_digest(p_business_id text,p_day date,p_token uuid,p_status text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snap jsonb;
BEGIN
 IF p_status<>ALL(ARRAY['delivered','failed','unknown']) THEN RAISE EXCEPTION 'invalid_status'; END IF;
 UPDATE public.handoff_digests SET status=p_status,finished_at=now() WHERE business_id=p_business_id AND day=p_day AND attempt_token=p_token AND status='attempting' RETURNING snapshot INTO snap;
 IF snap IS NULL THEN RETURN false; END IF;
 IF p_status='delivered' THEN
  UPDATE public.pending_approvals SET payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('expiry_reported_at',now()) WHERE business_id=p_business_id AND status='expired' AND 'approval:'||id IN(SELECT x->>'source_key' FROM jsonb_array_elements(snap->'items') x WHERE x->>'kind'='expired');
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.accept_earned_autonomy_offer(p_business_id text,p_key text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_key IS NULL OR p_key<>ALL(ARRAY['invoice_reminder','booking_reminder','quote_followup_sms','review_request']) THEN RAISE EXCEPTION 'invalid_autonomy_key'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('autonomy:'||p_business_id,0));
 IF EXISTS(SELECT 1 FROM public.autonomy_controls WHERE business_id=p_business_id AND key=p_key AND cooldown_until>now()) THEN RAISE EXCEPTION 'autonomy_cooldown'; END IF;
 INSERT INTO public.autonomy_controls(business_id,key,granted,mode,source) VALUES(p_business_id,p_key,true,'earned','offer') ON CONFLICT(business_id,key) DO UPDATE SET granted=true,mode='earned',source='offer',updated_at=now(),cooldown_until=NULL;
 INSERT INTO public.v3_automation_settings(business_id) VALUES(p_business_id) ON CONFLICT(business_id) DO NOTHING;
 UPDATE public.v3_automation_settings SET earned_autonomy=coalesce(earned_autonomy,'{}'::jsonb)||jsonb_build_object(p_key,jsonb_build_object('status','autonomous','mode','earned','source','offer','granted_at',now())) WHERE business_id=p_business_id;
END $$;
CREATE OR REPLACE FUNCTION public.handoff_protect_revocations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text;
BEGIN
 -- Supabase's request role survives SECURITY DEFINER; customers cannot write grants directly.
 IF current_setting('role',true) IN ('anon','authenticated') AND
   ((TG_OP='INSERT' AND coalesce(NEW.earned_autonomy,'{}'::jsonb)<>'{}'::jsonb) OR
    (TG_OP='UPDATE' AND NEW.earned_autonomy IS DISTINCT FROM OLD.earned_autonomy)) THEN
  RAISE EXCEPTION 'autonomy_requires_server_transition' USING ERRCODE='42501';
 END IF;
 FOR k IN SELECT key FROM public.autonomy_controls WHERE business_id=NEW.business_id AND NOT granted LOOP NEW.earned_autonomy:=coalesce(NEW.earned_autonomy,'{}'::jsonb)-k; END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER handoff_protect_revocations BEFORE INSERT OR UPDATE ON public.v3_automation_settings FOR EACH ROW EXECUTE FUNCTION public.handoff_protect_revocations();
CREATE OR REPLACE FUNCTION public.record_autonomy_attempt(p_business_id text,p_key text,p_title text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE control public.autonomy_controls; legacy jsonb; new_id uuid:=gen_random_uuid(); m text;
BEGIN
 IF p_key<>ALL(ARRAY['invoice_reminder','booking_reminder','quote_followup_sms','review_request']) OR p_key IS NULL THEN RAISE EXCEPTION 'invalid_autonomy_key'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('autonomy:'||p_business_id,0));
 SELECT * INTO control FROM public.autonomy_controls WHERE business_id=p_business_id AND key=p_key;
 IF FOUND THEN IF NOT control.granted THEN RETURN NULL; END IF; m:=control.mode;
 ELSE SELECT earned_autonomy->p_key INTO legacy FROM public.v3_automation_settings WHERE business_id=p_business_id;
  IF legacy->>'status' IS DISTINCT FROM 'autonomous' THEN RETURN NULL; END IF; m:='earned';
 END IF;
 INSERT INTO public.handoff_items(id,business_id,source_key,kind,title,autonomy_key,outcome,mode) VALUES(new_id,p_business_id,'autonomy:'||new_id,'autonomy',left(p_title,300),p_key,'unknown',m);
 RETURN new_id;
END $$;
CREATE OR REPLACE FUNCTION public.finish_autonomy_attempt(p_business_id text,p_id uuid,p_outcome text,p_log boolean DEFAULT false,p_channel text DEFAULT 'sms') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.handoff_items;
BEGIN
 IF p_outcome<>ALL(ARRAY['success','failed','skipped','unknown']) OR p_channel<>ALL(ARRAY['sms','email']) THEN RAISE EXCEPTION 'invalid_outcome'; END IF;
 UPDATE public.handoff_items SET outcome=p_outcome,outcome_finished_at=now() WHERE business_id=p_business_id AND id=p_id AND kind='autonomy' AND outcome_finished_at IS NULL RETURNING * INTO item;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_log THEN
  INSERT INTO public.v3_automation_logs(id,business_id,rule_name,trigger_type,action_type,status,context,result)
  VALUES('autonomy:'||p_id,p_business_id,item.title,'cron','send_'||p_channel,CASE WHEN p_outcome='unknown' THEN 'failed' ELSE p_outcome END,
   jsonb_build_object('earned_autonomy',true,'autonomy_key',item.autonomy_key,'autonomy_audit_id',p_id),jsonb_build_object('outcome',p_outcome)) ON CONFLICT(id) DO NOTHING;
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.promote_supervised_autonomy(p_business_id text,p_key text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer:=0; r record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('autonomy:'||p_business_id,0));
 IF NOT EXISTS(SELECT 1 FROM public.autonomy_controls WHERE business_id=p_business_id AND key=p_key AND granted AND mode='supervised') THEN RETURN false; END IF;
 FOR r IN SELECT approval_type,status,payload FROM public.pending_approvals WHERE business_id=p_business_id AND created_at>=now()-interval '60 days' AND status IN ('approved','rejected') AND approval_type IN ('automation','invoice_reminder','send_sms','review_request') ORDER BY resolved_at DESC LIMIT 200 LOOP
  IF (r.approval_type='review_request' AND p_key='review_request') OR (r.approval_type IN ('automation','invoice_reminder','send_sms') AND r.payload->>'autonomy_key'=p_key) THEN
   IF r.payload->>'edited'='true' OR r.status='rejected' THEN EXIT; END IF;
   n:=n+1;
  END IF;
 END LOOP;
 IF n<15 THEN RETURN false; END IF;
 UPDATE public.autonomy_controls SET mode='earned',updated_at=now() WHERE business_id=p_business_id AND key=p_key AND granted;
 UPDATE public.v3_automation_settings SET earned_autonomy=jsonb_set(earned_autonomy,ARRAY[p_key,'mode'],'"earned"') WHERE business_id=p_business_id AND earned_autonomy?p_key;
 RETURN true;
END $$;
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['handoff_items','handoff_digests','autonomy_consents','autonomy_controls'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,DELETE ON public.%I TO service_role',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY['accept_earned_autonomy_offer','handoff_protect_revocations','record_autonomy_attempt','finish_autonomy_attempt','promote_supervised_autonomy','handoff_card_kind','handoff_expiry_days','handoff_normalize_card','handoff_collect_expiry','answer_autonomy_consent','stop_supervised_autonomy','claim_handoff_digest','finish_handoff_digest']) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
COMMIT;
