-- Synthetic harmless memory in verified TEST Rollprov A only.
BEGIN;
INSERT INTO agent_memories(id,business_id,agent_id,memory_type,content,source_type,confirmed_at)
SELECT '0f91614e-ae2a-4d2f-9ec1-8329c713bb8a','biz_rollprov_a','matte','observation','[KORTPROV] Den syntetiska testmappen heter Grön pärm.','test',null
FROM business_config WHERE business_id='biz_rollprov_a' AND business_name='TEST Rollprov A'
ON CONFLICT(id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_memory','biz_rollprov_a','agent_memory_confirmation','[KORTPROV] Bekräfta syntetiskt minne','Bekräfta namnet på en syntetisk testmapp.',
'{"test_run":"approval-live-20260908-memory","memory_id":"0f91614e-ae2a-4d2f-9ec1-8329c713bb8a"}'::jsonb,'pending','low','owner'
FROM agent_memories WHERE id='0f91614e-ae2a-4d2f-9ec1-8329c713bb8a' AND business_id='biz_rollprov_a' AND content='[KORTPROV] Den syntetiska testmappen heter Grön pärm.'
ON CONFLICT(id) DO NOTHING;
COMMIT;
