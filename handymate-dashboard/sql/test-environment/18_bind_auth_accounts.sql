-- TEST ONLY: bind provider-created Auth accounts to existing synthetic actors.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM auth.users WHERE email IN ('vision-owner@example.invalid','vision-worker@example.invalid','vision-other@example.invalid'))<>3 THEN
 RAISE EXCEPTION 'Expected three test Auth accounts'; END IF;
 IF EXISTS(SELECT 1 FROM public.business_config WHERE business_id NOT IN ('biz_vision_test_a','biz_vision_test_b')) THEN
 RAISE EXCEPTION 'Unexpected business: refusing test binding'; END IF;
END $$;
UPDATE public.business_users b SET user_id=u.id FROM auth.users u
WHERE b.email=u.email AND b.id IN ('bu_vision_owner','bu_vision_worker','bu_vision_other')
AND b.business_id IN ('biz_vision_test_a','biz_vision_test_b') AND b.user_id IS NULL;
UPDATE public.business_config b SET user_id=u.id FROM auth.users u
WHERE ((b.business_id='biz_vision_test_a' AND u.email='vision-owner@example.invalid')
OR (b.business_id='biz_vision_test_b' AND u.email='vision-other@example.invalid')) AND b.user_id IS NULL;
COMMIT;
SELECT b.id,b.role,b.business_id,b.user_id,u.email_confirmed_at IS NOT NULL AS confirmed
FROM public.business_users b JOIN auth.users u ON u.id=b.user_id
WHERE b.id IN ('bu_vision_owner','bu_vision_worker','bu_vision_other');
