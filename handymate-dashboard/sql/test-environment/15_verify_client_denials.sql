-- Negative rights probes execute actual SQL under each public client role.
BEGIN;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  BEGIN
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   PERFORM count(*) FROM public.work_report_session;
   RAISE EXCEPTION 'Unexpected direct report read allowed for %',role_name;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   PERFORM public.run_agent_followups(1);
   RAISE EXCEPTION 'Unexpected runner execution allowed for %',role_name;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   PERFORM public.discard_work_report('biz_vision_test_a','bu_vision_worker','not-a-report');
   RAISE EXCEPTION 'Unexpected report mutation allowed for %',role_name;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $$;
ROLLBACK;
SELECT 'PASS: anon/authenticated denied direct report reads, report mutation and runner execution' as result;
