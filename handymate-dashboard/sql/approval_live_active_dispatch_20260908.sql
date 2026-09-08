-- Scoped synthetic assignment fixtures; not customer bookings.
-- Required synthetic customer has no phone/email and opts out of all sending; no calendar target.
BEGIN;
INSERT INTO customer(customer_id,business_id,name,phone_number,email,portal_enabled,sms_opt_out,email_opt_out,invoice_email)
SELECT 'cust_aplive_active_20260908',business_id,'Testkund KORTPROV AKTIV','',NULL,false,true,true,false
FROM business_config WHERE business_id='biz_rollprov_a' AND business_name='TEST Rollprov A'
ON CONFLICT(customer_id) DO NOTHING;
INSERT INTO booking(booking_id,business_id,customer_id,project_id,scheduled_start,scheduled_end,status,job_status,notes,assigned_to,assigned_user_id,reminder_sent,follow_up_sent,meeting_reminder_pushed_at)
SELECT 'aplive_active_' || v.variant || '_20260908',b.business_id,c.customer_id,p.project_id,
'2026-09-12T10:00:00Z'::timestamptz + v.hours * interval '1 hour',
'2026-09-12T11:00:00Z'::timestamptz + v.hours * interval '1 hour',
'confirmed','scheduled','[KORTPROV AKTIV] ' || v.variant,
CASE WHEN v.variant='new' THEN NULL ELSE 'Rollprov Ägare' END,
CASE WHEN v.variant='new' THEN NULL ELSE 'bu_rollprov_owner' END,
now(),true,now()
FROM business_config b JOIN project p ON p.business_id=b.business_id AND p.project_id='proj_rollprov_p1'
JOIN customer c ON c.business_id=b.business_id AND c.customer_id='cust_aplive_active_20260908' AND c.phone_number='' AND c.email IS NULL AND c.sms_opt_out AND c.email_opt_out
CROSS JOIN (VALUES ('new',0),('replace',1),('stale',2)) v(variant,hours)
WHERE b.business_id='biz_rollprov_a' AND b.business_name='TEST Rollprov A'
ON CONFLICT(booking_id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_active_' || v.variant || '_20260908',b.business_id,'dispatch_suggestion',
'[KORTPROV AKTIV] ' || v.variant,
'Syntetiskt tilldelningsprov utan kundmottagare.',
jsonb_build_object('test_run','approval-live-active-20260908','context_type','booking','context_id',b.booking_id,
'member_id','bu_rollprov_emp_assigned','member_name','Rollprov Anställd tilldelad','job_title',b.notes,
'project_id',b.project_id,'reasons',jsonb_build_array('Internt prov av aktiv bokning')),
'pending','low','owner'
FROM booking b JOIN business_config cfg ON cfg.business_id=b.business_id
CROSS JOIN (VALUES ('new'),('replace'),('stale')) v(variant)
WHERE b.business_id='biz_rollprov_a' AND cfg.business_name='TEST Rollprov A'
AND b.booking_id='aplive_active_' || v.variant || '_20260908'
AND b.notes='[KORTPROV AKTIV] ' || v.variant AND b.customer_id='cust_aplive_active_20260908'
ON CONFLICT(id) DO NOTHING;
COMMIT;
