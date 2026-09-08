-- Synthetic diary underlay; recording_id is a fixture marker, not a real call.
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_diary','biz_rollprov_a','project_log_note','[KORTPROV] Spara syntetisk dagboksanteckning','Syntetiskt samtalsunderlag för testprojektets dagbok.',
'{"test_run":"approval-live-20260908-diary","project_id":"proj_rollprov_p1","recording_id":"aplive_diary_call_20260908","summary":"[KORTPROV] Testpärmen granskades. Ingen kundkontakt genomfördes.","call_date":"2026-09-08"}'::jsonb,'pending','low','owner'
FROM project WHERE business_id='biz_rollprov_a' AND project_id='proj_rollprov_p1' AND name='P1 Solvägen 12 – badrum (tilldelat)'
ON CONFLICT(id) DO NOTHING;
