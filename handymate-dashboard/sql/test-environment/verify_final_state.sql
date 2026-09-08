SELECT state,completed,receipts FROM public.work_report_session WHERE id='report_vision_live';
SELECT time_entry_id,duration_minutes FROM public.time_entry WHERE time_entry_id='time_vision_live';
SELECT f.state,f.reason,f.send_claimed_at,a.status AS approval_status
FROM public.agent_followup f LEFT JOIN public.pending_approvals a ON a.id=f.approval_id
WHERE f.request_key='vision_cron_proof_20260908';
SELECT count(*) AS sms_rows FROM public.sms_log WHERE business_id='biz_vision_test_a';
SELECT count(*) AS auth_users FROM auth.users;
SELECT * FROM public.agent_followup_runner;
SELECT d.status,d.start_time,d.end_time,d.return_message
FROM cron.job_run_details d JOIN cron.job j USING(jobid)
WHERE j.jobname='handymate-durable-quote-followup' ORDER BY d.start_time DESC LIMIT 5;
