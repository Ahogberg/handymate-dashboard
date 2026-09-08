-- Synthetic non-default price list in the explicitly authorized test company.
BEGIN;
INSERT INTO price_lists_v2(id,business_id,name,is_default,hourly_rate_normal)
VALUES('b5215093-826b-49c1-a60c-2e7eb32bf071','biz_rollprov_a','[KORTPROV] Isolerad prislista',false,800)
ON CONFLICT(id) DO NOTHING;
INSERT INTO pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,routing_role)
VALUES('aplive_20260908_price','biz_rollprov_a','price_adjustment','[KORTPROV] Ändra isolerat timpris','Ändra testprislistans ordinarie timpris från 800 till 950 kr.',
'{"test_run":"approval-live-20260908-price","price_list_id":"b5215093-826b-49c1-a60c-2e7eb32bf071","price_list_name":"[KORTPROV] Isolerad prislista","current_rate":800,"suggested_rate":950}'::jsonb,'pending','low','owner')
ON CONFLICT(id) DO NOTHING;
COMMIT;
