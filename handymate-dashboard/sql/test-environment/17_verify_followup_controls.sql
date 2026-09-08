-- Live SQL/RPC probes. No provider invocation and no HTTP approval claim.
BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE f public.agent_followup; approved boolean; BEGIN
 SELECT * INTO f FROM public.agent_followup WHERE request_key='vision_cron_proof_20260908';
 IF f.state IS DISTINCT FROM 'prepared' THEN RAISE EXCEPTION 'Cron did not prepare a review'; END IF;
 BEGIN
  PERFORM public.claim_agent_followup_send(f.business_id,f.id,f.approval_id,'+447700900123');
  RAISE EXCEPTION 'Send lock accepted without approved review';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'approval_required' THEN RAISE; END IF; END;
 UPDATE public.pending_approvals SET status='approved' WHERE id=f.approval_id AND business_id=f.business_id;
 SELECT public.claim_agent_followup_send(f.business_id,f.id,f.approval_id,'+447700900123') INTO approved;
 IF approved IS DISTINCT FROM true THEN RAISE EXCEPTION 'Approved DB claim was not accepted'; END IF;
 BEGIN
  PERFORM public.claim_agent_followup_send(f.business_id,f.id,f.approval_id,'+447700900123');
  RAISE EXCEPTION 'Second send claim incorrectly accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'followup_not_sendable' THEN RAISE; END IF; END;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE f public.agent_followup; guard_reason text; BEGIN
 SELECT * INTO f FROM public.agent_followup WHERE request_key='vision_cron_proof_20260908';
 INSERT INTO public.customer_message(business_id,customer_id,direction,message)
 VALUES('biz_vision_test_a','cust_vision_a','inbound','Syntetiskt nytt kundsvar; detta är inte ett utskick.');
 SELECT public.agent_followup_guard(f.id,f.business_id) INTO guard_reason;
 IF guard_reason IS DISTINCT FROM 'customer_contact' THEN RAISE EXCEPTION 'New contact failed to stop stale plan: %',guard_reason; END IF;
 PERFORM public.run_agent_followups(50);
 IF NOT EXISTS(SELECT 1 FROM public.agent_followup WHERE id=f.id AND state='blocked' AND reason='customer_contact') THEN RAISE EXCEPTION 'Runner failed to block stale plan'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pending_approvals WHERE id=f.approval_id AND status='expired') THEN RAISE EXCEPTION 'Stale review remained pending'; END IF;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE f public.agent_followup; r public.work_report_session; BEGIN
 SELECT * INTO f FROM public.agent_followup WHERE request_key='vision_cron_proof_20260908';
 SELECT * INTO f FROM public.cancel_agent_followup('biz_vision_test_a','bu_vision_owner',f.id);
 IF f.state IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION 'Cancellation not saved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pending_approvals WHERE id=f.approval_id AND status='rejected') THEN RAISE EXCEPTION 'Cancelled review remained pending'; END IF;
 SELECT * INTO r FROM public.discard_work_report('biz_vision_test_a','bu_vision_worker','report_vision_live');
 IF r.state IS DISTINCT FROM 'discarded' OR r.completed<>1 OR jsonb_array_length(r.receipts)<>1 THEN RAISE EXCEPTION 'Discard lost saved receipt'; END IF;
 IF (SELECT count(*) FROM public.time_entry WHERE time_entry_id='time_vision_live')<>1 THEN RAISE EXCEPTION 'Saved time changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.sms_log WHERE business_id='biz_vision_test_a') THEN RAISE EXCEPTION 'Unexpected SMS log'; END IF;
END $$;
COMMIT;
SELECT 'PASS: review required, one send claim, new contact blocks stale plan, cancellation persists, report discard preserves receipt, zero SMS' AS result;
