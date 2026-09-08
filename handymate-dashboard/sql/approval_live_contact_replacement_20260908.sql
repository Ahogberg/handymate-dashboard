-- Authorized synthetic internal data only in TEST Rollprov A. No external contact.
-- Do not reset completed rows on rerun.
INSERT INTO customer_fact(id,business_id,customer_id,fact_type,content,source_type,confirmed_at)
SELECT 'ec755aad-a332-4c47-9110-2f22137bd918','biz_rollprov_a','cust_rollprov_a1','contact','[KORTPROV] Kontaktperson för testpärmen är Test Alfa.','meeting',now()
WHERE EXISTS(SELECT 1 FROM customer WHERE business_id='biz_rollprov_a' AND customer_id='cust_rollprov_a1' AND name='Rollprov Kund AB')
ON CONFLICT(id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_contact_replace','biz_rollprov_a','customer_fact','[KORTPROV] Ersätt syntetisk kontaktuppgift','Granska gammal och ny kontaktuppgift. Ingen kontakt tas.',
'{"test_run":"approval-live-20260908-internal","customer_id":"cust_rollprov_a1","content":"[KORTPROV] Kontaktperson för testpärmen är Test Beta.","fact_type":"contact","evidence_quote":"Test Beta tar över testpärmen från Test Alfa."}'::jsonb,'pending','low','owner'
WHERE EXISTS(SELECT 1 FROM customer_fact WHERE id='ec755aad-a332-4c47-9110-2f22137bd918' AND business_id='biz_rollprov_a')
ON CONFLICT(id) DO NOTHING;
