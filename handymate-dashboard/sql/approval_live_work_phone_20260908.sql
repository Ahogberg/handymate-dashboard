-- Two isolated draft work orders for continued approval testing.
-- No customers/users are created or changed; no valid telephone recipients, dates or sending.
BEGIN;
INSERT INTO work_orders(id,business_id,project_id,order_number,title,status,assigned_to,assigned_phone)
SELECT v.id,b.business_id,p.project_id,v.id,v.title,'draft',
CASE WHEN v.id='aplive_wo_legacy_20260908' THEN m.name ELSE 'Tidigare testperson' END,
CASE WHEN v.id='aplive_wo_legacy_20260908' THEN NULL ELSE 'TEST-EJ-RINGBART' END
FROM business_config b JOIN project p ON p.business_id=b.business_id AND p.project_id='proj_rollprov_p1'
JOIN business_users m ON m.business_id=b.business_id AND m.id='bu_rollprov_emp_assigned' AND coalesce(trim(m.phone),'')=''
CROSS JOIN (VALUES ('aplive_wo_phone_20260908','[KORTPROV TELEFON] Byt person och rensa gammalt nummer'),('aplive_wo_legacy_20260908','[KORTPROV TELEFON] Återläs äldre tilldelning')) v(id,title)
WHERE b.business_id='biz_rollprov_a' AND b.business_name='TEST Rollprov A'
ON CONFLICT(id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role,resolved_at)
SELECT w.id,w.business_id,'dispatch_suggestion',w.title,'Isolerat internt arbetsorderprov. Inget meddelande skickas.',
jsonb_build_object('test_run','approval-live-work-phone-20260908','context_type','work_order','context_id',w.id,'member_id',m.id,'member_name',m.name,'job_title',w.title,'project_id',w.project_id,'reasons',jsonb_build_array('Verifiera namn och telefon tillsammans')) ||
CASE WHEN w.id='aplive_wo_legacy_20260908' THEN jsonb_build_object('execution_result',jsonb_build_object('outcome','failed','receipt',jsonb_build_object('state','failed','text','Syntetiskt äldre fel utan granskningsunderlag.'))) ELSE '{}'::jsonb END,
CASE WHEN w.id='aplive_wo_legacy_20260908' THEN 'approved' ELSE 'pending' END,
'low','owner',CASE WHEN w.id='aplive_wo_legacy_20260908' THEN now() ELSE NULL END
FROM work_orders w JOIN business_config b ON b.business_id=w.business_id
JOIN business_users m ON m.business_id=w.business_id AND m.id='bu_rollprov_emp_assigned' AND coalesce(trim(m.phone),'')=''
WHERE w.business_id='biz_rollprov_a' AND b.business_name='TEST Rollprov A'
AND w.id IN ('aplive_wo_phone_20260908','aplive_wo_legacy_20260908') AND w.title LIKE '[KORTPROV TELEFON]%'
AND w.status='draft'
ON CONFLICT(id) DO NOTHING;
COMMIT;
