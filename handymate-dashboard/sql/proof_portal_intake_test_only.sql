-- Isolated project eoodwyfxrdjmlqaealhj ONLY. Transaction rolls back every fixture.
BEGIN;
DO $$
DECLARE r public.lead_intake_request; done jsonb; again jsonb; l public.leads; c public.customer;
 v jsonb := jsonb_build_object('name','TEST Codex Portal rollback','phone','+460000099909','email','portal-proof@example.invalid','message','Test av sparad förfrågan','source_ref',null,'lead_source_id',null,'category','bygg','estimated_value',0,'address_line','Testadress 1');
BEGIN
 SELECT * INTO r FROM public.receive_portal_lead_intake('biz_vision_test_a','portal-proof','portal-proof-20260909',v);
 IF r.state <> 'received' THEN RAISE EXCEPTION 'fixture_not_fresh'; END IF;
 done:=public.complete_lead_intake('biz_vision_test_a',r.id);
 IF done->'receipt'->>'state' <> 'completed' THEN RAISE EXCEPTION 'completion_failed: %',done; END IF;
 again:=public.complete_lead_intake('biz_vision_test_a',r.id);
 IF again->>'fresh' <> 'false' OR again->'receipt'->>'lead_id' <> done->'receipt'->>'lead_id' THEN RAISE EXCEPTION 'replay_failed'; END IF;
 SELECT * INTO STRICT l FROM public.leads WHERE business_id='biz_vision_test_a' AND lead_id=done->'receipt'->>'lead_id';
 SELECT * INTO STRICT c FROM public.customer WHERE business_id='biz_vision_test_a' AND customer_id=l.customer_id;
 IF l.category IS DISTINCT FROM 'bygg' OR l.estimated_value IS DISTINCT FROM 0 OR c.address_line IS DISTINCT FROM 'Testadress 1' THEN RAISE EXCEPTION 'metadata_missing'; END IF;
 BEGIN
  PERFORM public.receive_portal_lead_intake('biz_vision_test_a','portal-proof','portal-proof-20260909',v||'{"estimated_value":42}'::jsonb);
  RAISE EXCEPTION 'changed_input_was_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'intake_request_changed' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.complete_lead_intake('biz_vision_test_b',r.id);
  RAISE EXCEPTION 'foreign_completion_was_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'intake_missing' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
SELECT count(*)=0 AS fixtures_rolled_back FROM public.lead_intake_request WHERE business_id='biz_vision_test_a' AND source_scope='portal-proof' AND request_key='portal-proof-20260909';
