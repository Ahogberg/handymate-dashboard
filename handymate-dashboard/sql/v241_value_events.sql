-- V1. Review-only: do not apply as part of this PR.
-- Producers run in the source write transaction. No network calls or money-stage writes.
BEGIN;
CREATE TABLE public.value_events (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 seq bigserial UNIQUE NOT NULL,
 business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK (event_type IN ('opportunity_identified','opportunity_acted','opportunity_dismissed','time_measured','time_estimated')),
 occurred_at timestamptz NOT NULL,
 subject_type text NOT NULL CHECK (subject_type IN ('approval','automation_log','quote','invoice')),
 subject_id text NOT NULL CHECK (subject_id <> ''),
 card_id text,
 amount_minor bigint CHECK (amount_minor >= 0),
 amount_basis text CHECK (amount_basis = 'card_estimate'),
 minutes numeric CHECK (minutes >= 0 AND minutes < 100000000),
 minutes_basis text CHECK (minutes_basis IN ('measured','estimate')),
 source_type text NOT NULL CHECK (source_type IN ('approval','automation_log','quote','invoice')),
 source_id text NOT NULL CHECK (source_id <> ''),
 idempotency_key text NOT NULL CHECK (idempotency_key <> ''),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
 method_version integer NOT NULL DEFAULT 3 CHECK (method_version = 3),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,id), UNIQUE(business_id,idempotency_key),
 CHECK ((amount_minor IS NULL) = (amount_basis IS NULL)),
 CHECK ((minutes IS NULL) = (minutes_basis IS NULL)),
 CHECK ((event_type = 'time_measured' AND minutes_basis = 'measured' AND amount_minor IS NULL)
     OR (event_type = 'time_estimated' AND minutes_basis = 'estimate' AND amount_minor IS NULL)
     OR (event_type LIKE 'opportunity_%' AND minutes IS NULL)),
 CHECK (event_type NOT IN ('time_measured','time_estimated') OR minutes IS NOT NULL)
);
CREATE INDEX value_events_period ON public.value_events(business_id,event_type,occurred_at,seq);
CREATE INDEX value_events_card ON public.value_events(business_id,card_id,seq);
CREATE FUNCTION public.value_events_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'value_events_immutable'; END $$;
CREATE TRIGGER value_events_no_mutation BEFORE UPDATE OR DELETE ON public.value_events
 FOR EACH ROW EXECUTE FUNCTION public.value_events_immutable();
CREATE TRIGGER value_events_no_truncate BEFORE TRUNCATE ON public.value_events
 FOR EACH STATEMENT EXECUTE FUNCTION public.value_events_immutable();
ALTER TABLE public.value_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY value_events_member_read ON public.value_events FOR SELECT TO authenticated
 USING (public.is_business_member(business_id));
REVOKE ALL ON public.value_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.value_events TO authenticated,service_role;
REVOKE ALL ON SEQUENCE public.value_events_seq_seq FROM PUBLIC,anon,authenticated,service_role;

-- Validates the source's tenant at the privileged boundary. Amounts cross JSON as strings.
-- Same key returns the original immutable snapshot, even after the source was edited.
CREATE FUNCTION public.append_value_event(p_business_id text,p_event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.value_events; source_business text; card_business text;
BEGIN
 IF p_event->>'event_type' IS NULL OR p_event->>'event_type' NOT IN
 ('opportunity_identified','opportunity_acted','opportunity_dismissed','time_measured','time_estimated')
 THEN RAISE EXCEPTION 'value_event_type_not_allowed'; END IF;
 CASE p_event->>'source_type'
 WHEN 'approval' THEN SELECT business_id INTO source_business FROM public.pending_approvals WHERE id=p_event->>'source_id';
 WHEN 'automation_log' THEN SELECT business_id INTO source_business FROM public.v3_automation_logs WHERE id=p_event->>'source_id';
 WHEN 'quote' THEN SELECT business_id INTO source_business FROM public.quotes WHERE quote_id=p_event->>'source_id';
 WHEN 'invoice' THEN SELECT business_id INTO source_business FROM public.invoice WHERE invoice_id=p_event->>'source_id';
 ELSE RAISE EXCEPTION 'value_source_not_allowed'; END CASE;
 IF source_business IS DISTINCT FROM p_business_id OR p_business_id IS NULL THEN RAISE EXCEPTION 'value_source_tenant_mismatch'; END IF;
 IF p_event->>'subject_type' IS DISTINCT FROM p_event->>'source_type'
 OR p_event->>'subject_id' IS DISTINCT FROM p_event->>'source_id' THEN RAISE EXCEPTION 'value_subject_mismatch'; END IF;
 IF p_event->>'card_id' IS NOT NULL THEN
 SELECT business_id INTO card_business FROM public.pending_approvals WHERE id=p_event->>'card_id';
 IF card_business IS DISTINCT FROM p_business_id THEN RAISE EXCEPTION 'value_card_tenant_mismatch'; END IF;
 END IF;
 IF p_event->>'source_type'='approval' AND p_event->>'card_id' IS DISTINCT FROM p_event->>'source_id'
 THEN RAISE EXCEPTION 'value_card_source_mismatch'; END IF;
 IF p_event->>'event_type'='time_measured' THEN
 IF coalesce(p_event#>>'{payload,metric}','') <> 'elapsed_minutes'
 OR p_event#>>'{payload,started_at}' IS NULL OR p_event#>>'{payload,ended_at}' IS NULL
 OR (p_event#>>'{payload,ended_at}')::timestamptz < (p_event#>>'{payload,started_at}')::timestamptz
 OR (p_event->>'minutes')::numeric IS DISTINCT FROM
 round(extract(epoch FROM ((p_event#>>'{payload,ended_at}')::timestamptz-(p_event#>>'{payload,started_at}')::timestamptz))/60,3)
 THEN RAISE EXCEPTION 'value_time_evidence_invalid'; END IF;
 END IF;
 INSERT INTO public.value_events(business_id,event_type,occurred_at,subject_type,subject_id,card_id,
 amount_minor,amount_basis,minutes,minutes_basis,source_type,source_id,idempotency_key,payload)
 VALUES(p_business_id,p_event->>'event_type',(p_event->>'occurred_at')::timestamptz,p_event->>'subject_type',p_event->>'subject_id',p_event->>'card_id',
 (p_event->>'amount_minor')::bigint,p_event->>'amount_basis',(p_event->>'minutes')::numeric,p_event->>'minutes_basis',
 p_event->>'source_type',p_event->>'source_id',p_event->>'idempotency_key',coalesce(p_event->'payload','{}'))
 ON CONFLICT(business_id,idempotency_key) DO NOTHING RETURNING * INTO e;
 IF e.id IS NULL THEN SELECT * INTO e FROM public.value_events WHERE business_id=p_business_id AND idempotency_key=p_event->>'idempotency_key'; END IF;
 IF e.event_type IS DISTINCT FROM p_event->>'event_type' OR e.source_type IS DISTINCT FROM p_event->>'source_type' OR e.source_id IS DISTINCT FROM p_event->>'source_id' THEN RAISE EXCEPTION 'value_idempotency_identity_conflict'; END IF;
 RETURN to_jsonb(e)||jsonb_build_object('seq',e.seq::text,'amount_minor',e.amount_minor::text);
END $$;
REVOKE ALL ON FUNCTION public.append_value_event(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_value_event(text,jsonb) TO service_role;

-- Source snapshots deliberately contain only attribution fields, no full message/customer payload.
CREATE FUNCTION public.record_value_approval(p_business_id text,p_id text,p_backfilled boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.pending_approvals; base jsonb; snapshot jsonb; amount numeric; raw_amount jsonb; kind text;
BEGIN
 SELECT * INTO a FROM public.pending_approvals WHERE business_id=p_business_id AND id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'value_approval_not_found'; END IF;
 IF a.approval_type NOT IN ('send_sms','quote_nudge','proactive_care','warranty_followup','customer_reactivation','seasonal_campaign','autopilot_package','invoice_reminder','create_ata_draft','missad_intakt','fakturera_projekt','profitability_warning') THEN RETURN; END IF;
 raw_amount:=CASE a.approval_type WHEN 'profitability_warning' THEN a.payload->'projected_overrun'
 WHEN 'create_ata_draft' THEN a.payload->'amount_estimate' ELSE a.payload->'amount_kr' END;
 amount:=CASE WHEN jsonb_typeof(raw_amount)='number' THEN greatest(0,(raw_amount#>>'{}')::numeric) ELSE 0 END;
 snapshot:=jsonb_strip_nulls(jsonb_build_object('approval_type',a.approval_type,'title',a.title,'status',a.status,
 'resolved_at',a.resolved_at,'backfilled',p_backfilled,'card_payload',jsonb_build_object(
 'customer_id',a.payload->'customer_id','quote_id',a.payload->'quote_id','related_id',a.payload->'related_id',
 'invoice_id',a.payload->'invoice_id','draft_invoice_id',a.payload->'draft_invoice_id',
 'execution_result',jsonb_build_object('artifacts',a.payload#>'{execution_result,artifacts}'))));
 base:=jsonb_build_object('subject_type','approval','subject_id',a.id,'card_id',a.id,'source_type','approval','source_id',a.id,
 'amount_minor',round(amount*100)::bigint::text,'amount_basis','card_estimate','payload',snapshot);
 PERFORM public.append_value_event(a.business_id,base||jsonb_build_object('event_type','opportunity_identified',
 'occurred_at',coalesce(a.created_at,now()),'idempotency_key','opportunity_identified:'||a.id));
 kind:=CASE WHEN a.status IN ('approved','auto_approved') THEN 'opportunity_acted'
 WHEN a.status IN ('rejected','expired') THEN 'opportunity_dismissed' END;
 IF kind IS NOT NULL THEN
 PERFORM public.append_value_event(a.business_id,base||jsonb_build_object('event_type',kind,
 'occurred_at',coalesce(a.resolved_at,CASE WHEN a.status='expired' THEN a.expires_at END,a.created_at,now()),'idempotency_key',kind||':'||a.id));
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_value_approval(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_value_approval(text,text,boolean) TO service_role;

CREATE FUNCTION public.value_approval_written() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.record_value_approval(NEW.business_id,NEW.id,false);
 RETURN NEW;
END $$;
CREATE TRIGGER value_approval_producer AFTER INSERT OR UPDATE OF status,payload ON public.pending_approvals
 FOR EACH ROW EXECUTE FUNCTION public.value_approval_written();

-- Durable time observation. Elapsed lead time is NOT labour saved.
CREATE FUNCTION public.record_value_time(p_business_id text,p_source_type text,p_source_id text,
 p_metric text,p_started_at timestamptz,p_ended_at timestamptz,p_estimate numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE measured boolean; kind text; payload jsonb; minutes numeric;
BEGIN
 IF p_ended_at IS NULL THEN RETURN; END IF;
 measured:=p_started_at IS NOT NULL AND p_ended_at>=p_started_at;
 kind:=CASE WHEN measured THEN 'time_measured' ELSE 'time_estimated' END;
 minutes:=CASE WHEN measured THEN round(extract(epoch FROM(p_ended_at-p_started_at))/60,3) ELSE p_estimate END;
 payload:=jsonb_build_object('metric',CASE WHEN measured THEN 'elapsed_minutes' ELSE 'estimated_labour_minutes' END,
 'journey',p_metric,'started_at',CASE WHEN measured THEN p_started_at END,'ended_at',p_ended_at,
 'estimate_basis',CASE WHEN NOT measured THEN jsonb_build_object('minutes',p_estimate,'method','V1 activity estimate; not measured') END);
 PERFORM public.append_value_event(p_business_id,jsonb_build_object('event_type',kind,'occurred_at',p_ended_at,
 'subject_type',p_source_type,'subject_id',p_source_id,'source_type',p_source_type,'source_id',p_source_id,
 'idempotency_key','time:'||p_source_type||':'||p_source_id||':'||p_metric,'minutes',minutes,
 'minutes_basis',CASE WHEN measured THEN 'measured' ELSE 'estimate' END,'payload',payload));
END $$;
REVOKE ALL ON FUNCTION public.record_value_time(text,text,text,text,timestamptz,timestamptz,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_value_time(text,text,text,text,timestamptz,timestamptz,numeric) TO service_role;

CREATE FUNCTION public.record_value_automation(p_business_id text,p_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.v3_automation_logs; key text; started timestamptz;
BEGIN
 SELECT * INTO a FROM public.v3_automation_logs WHERE business_id=p_business_id AND id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'value_automation_not_found'; END IF;
 IF a.status<>'success' THEN RETURN; END IF;
 key:=a.context->>'autonomy_key';
 IF a.approval_id IS NULL AND a.context->>'earned_autonomy'='true'
 AND key IN ('invoice_reminder','booking_reminder','quote_followup_sms','review_request') THEN
 PERFORM public.append_value_event(a.business_id,jsonb_build_object('event_type','opportunity_acted','occurred_at',a.created_at,
 'subject_type','automation_log','subject_id',a.id,'source_type','automation_log','source_id',a.id,
 'idempotency_key','opportunity_acted:automation_log:'||a.id,'payload',jsonb_build_object('autonomy_key',key,'action_type',a.action_type)));
 END IF;
 IF key='invoice_reminder' OR a.action_type IN ('send_invoice_reminder','send_reminder') OR a.rule_name='invoice_reminder' THEN
 SELECT (i.due_date+1)::timestamp AT TIME ZONE 'Europe/Stockholm' INTO started FROM public.invoice i
 WHERE i.business_id=a.business_id AND i.invoice_id=a.context->>'invoice_id';
 PERFORM public.record_value_time(a.business_id,'automation_log',a.id,'invoice_due_to_reminder',started,a.created_at,12);
 ELSE
 PERFORM public.record_value_time(a.business_id,'automation_log',a.id,'automation_action',NULL,a.created_at,
 CASE WHEN a.action_type IN ('update_pipeline','move_deal') THEN 2 WHEN key='booking_reminder' THEN 5
 WHEN a.action_type IN ('create_booking','schedule_followup') THEN 10
 WHEN a.action_type IN ('notify_owner','create_approval') THEN 4 ELSE 6 END);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_value_automation(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_value_automation(text,text) TO service_role;
CREATE FUNCTION public.value_automation_written() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN PERFORM public.record_value_automation(NEW.business_id,NEW.id); RETURN NEW; END $$;
CREATE TRIGGER value_automation_producer AFTER INSERT OR UPDATE OF status ON public.v3_automation_logs
 FOR EACH ROW EXECUTE FUNCTION public.value_automation_written();

CREATE FUNCTION public.value_document_sent() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE started timestamptz; row_data jsonb:=to_jsonb(NEW);
BEGIN
 IF row_data->>'sent_at' IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND to_jsonb(OLD)->>'sent_at' IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='quotes' THEN
 SELECT created_at INTO started FROM public.leads WHERE business_id=NEW.business_id AND lead_id=row_data->>'lead_id';
 PERFORM public.record_value_time(NEW.business_id,'quote',row_data->>'quote_id','lead_received_to_quote_sent',started,NEW.sent_at,15);
 ELSE
 SELECT completed_at INTO started FROM public.project WHERE business_id=NEW.business_id AND project_id=row_data->>'project_id';
 PERFORM public.record_value_time(NEW.business_id,'invoice',row_data->>'invoice_id','job_completed_to_invoice_sent',started,NEW.sent_at,10);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER value_quote_sent AFTER INSERT OR UPDATE OF sent_at ON public.quotes
 FOR EACH ROW EXECUTE FUNCTION public.value_document_sent();
CREATE TRIGGER value_invoice_sent AFTER INSERT OR UPDATE OF sent_at ON public.invoice
 FOR EACH ROW EXECUTE FUNCTION public.value_document_sent();

-- Explicit bounded historical seed; safe default is dry run. Cursor is returned by caller's last_id.
-- Only approvals are backfilled: old sent_at includes synthetic v126 dates, never measure those.
CREATE FUNCTION public.backfill_value_events(p_business_id text,p_dry_run boolean DEFAULT true,
 p_after_id text DEFAULT '',p_limit integer DEFAULT 500) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a record; examined integer:=0; last_id text:=p_after_id;
BEGIN
 IF p_business_id IS NULL OR p_after_id IS NULL OR p_dry_run IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'invalid_backfill_options'; END IF;
 FOR a IN SELECT id FROM public.pending_approvals WHERE business_id=p_business_id AND id>p_after_id ORDER BY id LIMIT p_limit LOOP
 examined:=examined+1; last_id:=a.id;
 IF NOT p_dry_run THEN PERFORM public.record_value_approval(p_business_id,a.id,true); END IF;
 END LOOP;
 RETURN jsonb_build_object('dry_run',p_dry_run,'examined',examined,'last_id',last_id,'has_more',
 EXISTS(SELECT 1 FROM public.pending_approvals WHERE business_id=p_business_id AND id>last_id));
END $$;
REVOKE ALL ON FUNCTION public.backfill_value_events(text,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_value_events(text,boolean,text,integer) TO service_role;
COMMIT;
