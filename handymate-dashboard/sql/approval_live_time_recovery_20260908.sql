-- Reconstruct a lost receipt on the existing synthetic 75-minute test case.
-- No time_entry or project row is created or changed.
UPDATE pending_approvals a
SET payload=jsonb_set(a.payload,'{execution_result}',
  (a.payload->'execution_result') || jsonb_build_object(
    'outcome','failed','error_text','Syntetiskt återhämtningsprov: tidraden finns redan.',
    'receipt',jsonb_build_object('state','failed','text','Syntetiskt återhämtningsprov: kontrollera redan registrerad tid.')))
FROM business_config b, time_entry t
WHERE a.business_id='biz_rollprov_a' AND b.business_id=a.business_id AND b.business_name='TEST Rollprov A'
AND a.id='aplive_20260908_timeproposal' AND a.title='[KORTPROV] Registrera 75 testminuter'
AND a.status='approved' AND a.payload->'execution_result'->>'outcome'='success'
AND t.business_id=a.business_id AND t.time_entry_id='3d4966cb-ab2b-5812-ac4a-7b13dd981f3e'
AND t.duration_minutes=75 AND t.business_user_id='bu_rollprov_owner' AND t.project_id='proj_rollprov_p1'
AND t.work_date='2026-09-08' AND t.is_billable=true AND t.approval_status='approved'
RETURNING a.id,a.status,a.payload->'execution_result' as execution;
