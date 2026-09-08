-- Reconstructed old failed state, points only to the already-confirmed synthetic memory.
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role,resolved_at)
SELECT 'aplive_20260908_old_recovery','biz_rollprov_a','agent_memory_confirmation','[KORTPROV] Återläs äldre minnesbeslut','Syntetiskt äldre fel för prov av historikens återförsök.',
'{"test_run":"approval-live-20260908-old-recovery","memory_id":"0f91614e-ae2a-4d2f-9ec1-8329c713bb8a","execution_result":{"outcome":"failed","receipt":{"state":"failed","text":"Syntetiskt äldre fel: kontrollera det redan bekräftade testminnet."}}}'::jsonb,'approved','low','owner',now()-interval '14 days'
FROM agent_memories WHERE business_id='biz_rollprov_a' AND id='0f91614e-ae2a-4d2f-9ec1-8329c713bb8a' AND content='[KORTPROV] Den syntetiska testmappen heter Grön pärm.' AND confirmed_at IS NOT NULL
ON CONFLICT(id) DO NOTHING;
