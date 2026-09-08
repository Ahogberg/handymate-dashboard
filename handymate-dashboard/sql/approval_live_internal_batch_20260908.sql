-- Authorized synthetic data only in TEST Rollprov A. Does not reset existing rows.
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_meeting_followup','biz_rollprov_a','meeting_followup','[KORTPROV] Skapa intern mötesuppgift','Skapa en intern testuppgift för att kontrollera handling och kvittens.',
'{"test_run":"approval-live-20260908-internal","title":"[KORTPROV] Kontrollera syntetiskt mötesunderlag","description":"Kontrollera de tre syntetiska anteckningarna. Ingen kundkontakt.","source_text":"Vi kontrollerar anteckningarna internt före nästa steg.","priority":"high","due_date":"2026-09-10"}'::jsonb,'pending','low','owner'
WHERE EXISTS (SELECT 1 FROM business_config WHERE business_id='biz_rollprov_a' AND business_name='TEST Rollprov A')
ON CONFLICT(id) DO NOTHING;
