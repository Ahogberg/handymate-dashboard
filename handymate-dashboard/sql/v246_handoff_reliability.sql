-- H3a/H4 only. No outbound_intents and no financial changes. Run before flags.
BEGIN;
CREATE TABLE public.channel_notices (
 business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('sms','email','push')),
 day date NOT NULL,
 reason text NOT NULL CHECK(reason IN ('saldo','konfiguration','mottagare','kontrollfel')),
 message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,channel,day)
);
ALTER TABLE public.channel_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.channel_notices FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.channel_notices TO service_role;
CREATE FUNCTION public.record_channel_notice(p_business_id text,p_channel text,p_reason text,p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO channel_notices(business_id,channel,day,reason,message)
 VALUES(p_business_id,p_channel,(now() AT TIME ZONE 'Europe/Stockholm')::date,p_reason,left(p_message,500))
 ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.record_channel_notice(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_channel_notice(text,text,text,text) TO service_role;

CREATE TABLE public.morning_report_runs (
 business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 day date NOT NULL,
 rule_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','waiting','retry','delivered','exhausted','unknown','cancelled')),
 attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 2),
 attempt_token uuid NOT NULL,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz,
 failure_class text CHECK(failure_class IN ('ko','kredit','konfiguration','underlag','orkestrator','leverans','okant')),
 report jsonb,
 notice text,
 notice_push_accepted boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,day)
);
CREATE INDEX morning_report_due ON public.morning_report_runs(next_attempt_at) WHERE status IN ('retry','waiting');
ALTER TABLE public.morning_report_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.morning_report_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.morning_report_runs TO service_role;
CREATE FUNCTION public.claim_morning_report(p_business_id text,p_rule_id text)
RETURNS SETOF public.morning_report_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d date := (now() AT TIME ZONE 'Europe/Stockholm')::date; r morning_report_runs;
BEGIN
 -- The action owner is checked again at claim, including tenant and pause state.
 IF NOT EXISTS(SELECT 1 FROM v3_automation_rules v JOIN business_config b USING(business_id)
   WHERE v.id=p_rule_id AND v.business_id=p_business_id AND v.is_active AND v.is_system
     AND v.action_type='run_agent' AND v.trigger_type='cron'
     AND v.action_config->>'instruction'='Generera morgonrapport med dagens bokningar, utestående offerter, försenade fakturor och insikter.'
     AND NOT coalesce(b.agents_globally_paused,false)) THEN
   UPDATE morning_report_runs SET status='cancelled',notice='Morgonrapportens återförsök har pausats.',updated_at=now()
    WHERE business_id=p_business_id AND day=d AND rule_id=p_rule_id AND status IN ('retry','waiting');
   RETURN;
 END IF;
 INSERT INTO morning_report_runs(business_id,day,rule_id,status,attempts,attempt_token)
 VALUES(p_business_id,d,p_rule_id,'running',1,gen_random_uuid()) ON CONFLICT DO NOTHING RETURNING * INTO r;
 IF FOUND THEN RETURN NEXT r; RETURN; END IF;
 SELECT * INTO r FROM morning_report_runs WHERE business_id=p_business_id AND day=d FOR UPDATE;
 -- An interrupted worker might have dispatched a push: never blindly reclaim it.
 IF r.status='running' AND r.claimed_at < now()-interval '5 minutes' THEN
   UPDATE morning_report_runs SET status='unknown',failure_class='ko',notice='Morgonrapportens leverans kunde inte bekräftas. Kontrollera rapporten här.',updated_at=now()
    WHERE business_id=p_business_id AND day=d;
   RETURN;
 END IF;
 IF r.status NOT IN ('retry','waiting') OR (r.status='retry' AND r.attempts<>1) OR r.next_attempt_at>now() OR r.rule_id<>p_rule_id THEN RETURN; END IF;
 UPDATE morning_report_runs SET status='running',attempts=CASE WHEN r.status='retry' THEN 2 ELSE r.attempts END,attempt_token=gen_random_uuid(),claimed_at=now(),updated_at=now(),next_attempt_at=NULL
 WHERE business_id=p_business_id AND day=d RETURNING * INTO r;
 RETURN NEXT r;
END $$;
CREATE FUNCTION public.finish_morning_report(p_business_id text,p_day date,p_token uuid,p_outcome text,p_failure_class text,p_report jsonb,p_notice text,p_notice_push_accepted boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_outcome NOT IN ('delivered','failed','unknown','cancelled','deferred') THEN RAISE EXCEPTION 'invalid outcome'; END IF;
 UPDATE morning_report_runs SET
  status=CASE WHEN p_outcome='deferred' THEN 'waiting' WHEN p_outcome='failed' THEN CASE WHEN attempts=1 THEN 'retry' ELSE 'exhausted' END ELSE p_outcome END,
  next_attempt_at=CASE WHEN p_outcome='deferred' OR (p_outcome='failed' AND attempts=1) THEN now()+interval '10 minutes' ELSE NULL END,
  failure_class=p_failure_class,report=coalesce(p_report,report),notice=p_notice,
  notice_push_accepted=morning_report_runs.notice_push_accepted OR p_notice_push_accepted,updated_at=now()
 WHERE business_id=p_business_id AND day=p_day AND attempt_token=p_token AND status='running';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_morning_report(text,text),public.finish_morning_report(text,date,uuid,text,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_morning_report(text,text),public.finish_morning_report(text,date,uuid,text,text,jsonb,text,boolean) TO service_role;
COMMIT;
