BEGIN;
INSERT INTO booking(booking_id,business_id,customer_id,project_id,scheduled_start,scheduled_end,status,notes,reminder_sent,follow_up_sent,job_status)
SELECT 'aplive_dispatch_booking_20260908',b.business_id,c.customer_id,'proj_rollprov_p1','2020-01-02T10:00:00Z','2020-01-02T11:00:00Z','cancelled','[KORTPROV] Isolerad bokningstilldelning',now(),true,'completed'
FROM business_config b JOIN customer c ON c.business_id=b.business_id AND c.customer_id='cust_rollprov_a1'
WHERE b.business_id='biz_rollprov_a' AND b.business_name='TEST Rollprov A'
ON CONFLICT(booking_id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_dispatch_booking',b.business_id,'dispatch_suggestion','[KORTPROV] Tilldela isolerad bokning','Tekniskt tilldelningsprov på en gammal avbokad testbokning.',
'{"test_run":"approval-live-20260908-dispatch-booking","context_type":"booking","context_id":"aplive_dispatch_booking_20260908","member_id":"bu_rollprov_owner","member_name":"Rollprov Ägare","job_title":"[KORTPROV] Isolerad bokningstilldelning","project_id":"proj_rollprov_p1","reasons":["Isolerat internt tilldelningsprov"]}'::jsonb,'pending','low','owner'
FROM booking b JOIN business_config cfg ON cfg.business_id=b.business_id
WHERE b.booking_id='aplive_dispatch_booking_20260908' AND b.business_id='biz_rollprov_a' AND b.notes='[KORTPROV] Isolerad bokningstilldelning' AND cfg.business_name='TEST Rollprov A'
ON CONFLICT(id) DO NOTHING;
COMMIT;
