-- Authorized conflict test: repeat on fixed preview, only this synthetic booking while its review is open.
UPDATE booking b
SET assigned_to=m.name, assigned_user_id=m.id
FROM business_users m, business_config cfg
WHERE b.business_id='biz_rollprov_a'
AND b.booking_id='aplive_active_stale_20260908'
AND b.customer_id='cust_aplive_active_20260908'
AND b.notes='[KORTPROV AKTIV] stale'
AND b.assigned_user_id='bu_rollprov_admin' AND b.assigned_to='Rollprov Admin'
AND cfg.business_id=b.business_id AND cfg.business_name='TEST Rollprov A'
AND m.business_id=b.business_id AND m.id='bu_rollprov_owner'
RETURNING b.booking_id,b.assigned_to,b.assigned_user_id;
