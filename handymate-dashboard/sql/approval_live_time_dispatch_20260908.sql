-- Only isolated synthetic internal records in verified TEST Rollprov A.
BEGIN;
INSERT INTO time_checkins(id,business_id,user_id,user_name,project_id,project_name,checked_in_at,checked_out_at,duration_minutes,status,note)
SELECT 'a5807a7e-836a-499f-954e-66f132887301',b.business_id,u.user_id,u.name,'proj_rollprov_p1','P1 Solvägen 12 – badrum (tilldelat)','2026-09-08T09:00:00Z','2026-09-08T10:30:00Z',90,'completed','[KORTPROV] Syntetisk incheckning'
FROM business_config b JOIN business_users u ON u.business_id=b.business_id AND u.id='bu_rollprov_owner'
WHERE b.business_id='biz_rollprov_a' AND b.business_name='TEST Rollprov A'
ON CONFLICT(id) DO NOTHING;
INSERT INTO work_orders(id,business_id,project_id,order_number,title,scheduled_date,scheduled_start,scheduled_end,status)
SELECT 'aplive_work_order_20260908',business_id,'proj_rollprov_p1','KORTPROV-20260908','[KORTPROV] Sortera testpärmen','2026-09-08','12:00','13:00','draft'
FROM business_config WHERE business_id='biz_rollprov_a' AND business_name='TEST Rollprov A'
ON CONFLICT(id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_attestation',business_id,'time_attestation','[KORTPROV] Attestera 90 testminuter','Syntetisk tid i testprojektet.',
jsonb_build_object('test_run','approval-live-20260908-time','checkin_id',id,'user_id',user_id,'project_id',project_id,'project_name',project_name,'duration_minutes',90,'checked_in_at',checked_in_at,'checked_out_at',checked_out_at,'user_name',user_name),'pending','low','owner'
FROM time_checkins WHERE id='a5807a7e-836a-499f-954e-66f132887301' AND business_id='biz_rollprov_a' AND note='[KORTPROV] Syntetisk incheckning'
ON CONFLICT(id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_timeproposal',b.business_id,'tidrapport_forslag','[KORTPROV] Registrera 75 testminuter','Syntetiskt tidförslag för testprojektet.',
jsonb_build_object('test_run','approval-live-20260908-time','project_id','proj_rollprov_p1','project_name','P1 Solvägen 12 – badrum (tilldelat)','booking_date','2026-09-08','suggested_minutes',75,'assigned_user_id',u.id),'pending','low','owner'
FROM business_config b JOIN business_users u ON u.business_id=b.business_id AND u.id='bu_rollprov_owner'
WHERE b.business_id='biz_rollprov_a' AND b.business_name='TEST Rollprov A'
ON CONFLICT(id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_dispatch',w.business_id,'dispatch_suggestion','[KORTPROV] Tilldela testpärmen','Tilldela det syntetiska arbetsorderutkastet till testägaren.',
'{"test_run":"approval-live-20260908-time","context_type":"work_order","context_id":"aplive_work_order_20260908","member_id":"bu_rollprov_owner","member_name":"Rollprov Ägare","job_title":"[KORTPROV] Sortera testpärmen","project_id":"proj_rollprov_p1","reasons":["Syntetiskt internt tilldelningsprov"]}'::jsonb,'pending','low','owner'
FROM work_orders w JOIN business_config b ON b.business_id=w.business_id
WHERE w.id='aplive_work_order_20260908' AND w.business_id='biz_rollprov_a' AND w.title='[KORTPROV] Sortera testpärmen' AND b.business_name='TEST Rollprov A'
ON CONFLICT(id) DO NOTHING;
COMMIT;
