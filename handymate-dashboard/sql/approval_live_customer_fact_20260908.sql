-- Synthetic preference only: no promise, deadline, replacement or external send.
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
SELECT 'aplive_20260908_customer_fact','biz_rollprov_a','customer_fact','[KORTPROV] Spara kundpreferens','Spara den syntetiska kundens önskemål för kommande arbete.',
'{"test_run":"approval-live-20260908-internal","customer_id":"cust_rollprov_a1","content":"[KORTPROV] Kunden föredrar blå pärm för syntetiska arbetsanteckningar.","fact_type":"preference","evidence_quote":"Lägg testanteckningarna i den blå pärmen."}'::jsonb,'pending','low','owner'
WHERE EXISTS(SELECT 1 FROM customer WHERE business_id='biz_rollprov_a' AND customer_id='cust_rollprov_a1' AND name='Rollprov Kund AB')
ON CONFLICT(id) DO NOTHING;
