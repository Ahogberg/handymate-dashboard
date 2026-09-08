-- Live database/RPC proof, not an HTTP, model or native UI test.
-- Explicitly writes synthetic time and its receipt. All IDs are fixture constants.
BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE r public.work_report_session; input jsonb; BEGIN
 input:=jsonb_build_object('project_id','project_vision_a','work_date',current_date::text,'duration_minutes',75,'description','Syntetiskt RPC-prov');
 INSERT INTO public.work_report_session(id,business_id,business_user_id,project_id,work_date,parts)
 VALUES('report_vision_live','biz_vision_test_a','bu_vision_worker','project_vision_a',current_date,
 jsonb_build_array(jsonb_build_object('toolName','log_time','toolInput',input,'summary','TEST: 75 minuter'),
 jsonb_build_object('toolName','add_work_note','toolInput',jsonb_build_object('project_id','project_vision_a','log_date',current_date::text,'work_performed','Syntetisk nästa anteckning'),'summary','TEST: nästa anteckning')));
 BEGIN
  PERFORM public.claim_work_report_step('biz_vision_test_b','bu_vision_other','report_vision_live','log_time',input);
  RAISE EXCEPTION 'Cross-company claim incorrectly allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'report_not_found' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.claim_work_report_step('biz_vision_test_a','bu_vision_owner','report_vision_live','log_time',input);
  RAISE EXCEPTION 'Another member claimed the report';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'report_not_found' THEN RAISE; END IF; END;
 SELECT * INTO r FROM public.claim_work_report_step('biz_vision_test_a','bu_vision_worker','report_vision_live','log_time',input);
 BEGIN
  PERFORM public.claim_work_report_step('biz_vision_test_a','bu_vision_worker','report_vision_live','log_time',input);
  RAISE EXCEPTION 'Duplicate concurrent claim incorrectly allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'report_in_progress' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.discard_work_report('biz_vision_test_a','bu_vision_worker','report_vision_live');
  RAISE EXCEPTION 'Discard during save incorrectly allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'report_in_progress' THEN RAISE; END IF; END;
 INSERT INTO public.time_entry(time_entry_id,business_id,business_user_id,project_id,work_date,duration_minutes,description,check_in_time,check_out_time)
 VALUES('time_vision_live','biz_vision_test_a','bu_vision_worker','project_vision_a',current_date,75,'Syntetiskt RPC-prov',current_date+time '08:00',current_date+time '09:15');
 PERFORM public.finish_work_report_step('biz_vision_test_a','bu_vision_worker','report_vision_live',0,r.claim_id,true,'{"tool":"log_time","status":"saved"}');
 -- A late duplicate completion must leave the later part and receipt intact.
 SELECT * INTO r FROM public.finish_work_report_step('biz_vision_test_a','bu_vision_worker','report_vision_live',0,r.claim_id,true,'{"tool":"log_time","status":"saved"}');
 IF r.completed<>1 OR jsonb_array_length(r.receipts)<>1 OR r.parts->r.completed->>'toolName'<>'add_work_note' THEN RAISE EXCEPTION 'Receipt or next part changed'; END IF;
 BEGIN
  PERFORM public.claim_work_report_step('biz_vision_test_a','bu_vision_worker','report_vision_live','log_time',input);
  RAISE EXCEPTION 'Stale first part incorrectly reclaimed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'stale_report_step' THEN RAISE; END IF; END;
END $$;
COMMIT;
SELECT id,completed,receipts,parts->completed->>'toolName' as next_tool,state FROM public.work_report_session WHERE id='report_vision_live';
