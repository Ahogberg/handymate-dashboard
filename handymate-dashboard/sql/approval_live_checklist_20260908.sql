INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_checklist','biz_rollprov_a','checklist_forslag','[KORTPROV] Skapa syntetisk checklista','Två testpunkter, en obligatorisk. Inga punkter ska vara utförda från början.',
'{"test_run":"approval-live-20260908-checklist","project_id":"proj_rollprov_p1","template_name":"[KORTPROV] Testpärmens kontroll","template_items":[{"id":"test-one","text":"[KORTPROV] Kontrollera testpärmens etikett","required":true,"checked":true},{"id":"test-two","text":"[KORTPROV] Läs syntetisk anteckning","required":false,"checked":false}]}'::jsonb,'pending','low','owner'
FROM project WHERE business_id='biz_rollprov_a' AND project_id='proj_rollprov_p1' AND name='P1 Solvägen 12 – badrum (tilldelat)'
ON CONFLICT(id) DO NOTHING;
