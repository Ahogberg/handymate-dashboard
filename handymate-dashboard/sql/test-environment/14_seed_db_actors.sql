-- Isolated branch only. Synthetic DB actors, not login-ready Auth accounts.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.business_config WHERE business_id NOT IN ('biz_vision_test_a','biz_vision_test_b')) THEN RAISE EXCEPTION 'Unexpected company: refusing test seed'; END IF;
END $$;
INSERT INTO public.business_config(business_id,business_name,subscription_status,subscription_plan,onboarding_status,onboarding_completed_at,onboarding_step,agents_globally_paused)
VALUES ('biz_vision_test_a','TEST Vision A','comp','professional','completed',now(),10,false),
       ('biz_vision_test_b','TEST Vision B','comp','professional','completed',now(),10,false);
INSERT INTO public.business_users(id,business_id,name,email,role,is_active)
VALUES ('bu_vision_owner','biz_vision_test_a','Vision testägare','vision-owner@example.invalid','owner',true),
('bu_vision_worker','biz_vision_test_a','Vision testmedarbetare','vision-worker@example.invalid','employee',true),
('bu_vision_other','biz_vision_test_b','Vision annan firma','vision-other@example.invalid','owner',true);
INSERT INTO public.customer(customer_id,business_id,name,phone_number,email)
VALUES ('cust_vision_a','biz_vision_test_a','Syntetisk testkund','+447700900123','vision-customer@example.invalid');
INSERT INTO public.project(project_id,business_id,customer_id,name,status)
VALUES ('project_vision_a','biz_vision_test_a','cust_vision_a','TEST Vision – rapportkedja','active');
INSERT INTO public.project_assignment(id,business_id,project_id,business_user_id)
VALUES ('assignment_vision_worker','biz_vision_test_a','project_vision_a','bu_vision_worker');
INSERT INTO public.quotes(quote_id,business_id,customer_id,title,status,sent_at,valid_until,total,customer_pays,items)
VALUES ('quote_vision_followup','biz_vision_test_a','cust_vision_a','TEST – offertuppföljning utan utskick','sent',now()-interval '1 day',current_date+30,1000,1250,'[]');
COMMIT;
SELECT business_id,business_name FROM public.business_config ORDER BY business_id;
