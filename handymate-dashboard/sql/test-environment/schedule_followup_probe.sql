-- TEST ONLY: after seed and a real pg_cron heartbeat. No provider call.
SELECT id,state,due_at,approval_id FROM public.schedule_agent_followup(
 'biz_vision_test_a','bu_vision_owner','quote_vision_followup',
 now()+interval '70 seconds','vision_cron_proof_20260908',NULL
);
