-- Run after the migration inside the SAME transaction; always rolls back.
set local role service_role;
DO $proof$
DECLARE a uuid; b uuid; ses jsonb; pub jsonb; r jsonb; stamp date;
BEGIN
 select (public.revenue_v2_command('10000000-0000-4000-8000-000000000001','revenue-proof@example.invalid',true,gen_random_uuid(),'create','{"company_name":"Revenue V2 rollback proof","org_number":"5599999998"}'::jsonb)->>'account_id')::uuid into a;
 perform public.revenue_v2_command('10000000-0000-4000-8000-000000000001','revenue-proof@example.invalid',true,gen_random_uuid(),'activity',jsonb_build_object('account_id',a,'activity_type','note','outcome','completed','summary','Proof note'));
 if (select last_contact_at is not null from revenue_accounts where id=a) then raise exception 'Note became contact'; end if;
 ses:=public.revenue_v2_command('10000000-0000-4000-8000-000000000001','revenue-proof@example.invalid',true,gen_random_uuid(),'session',jsonb_build_object('account_id',a));
 pub:=public.revenue_v2_command('10000000-0000-4000-8000-000000000001','revenue-proof@example.invalid',true,gen_random_uuid(),'case',jsonb_build_object('account_id',a,'session_id',ses->>'session_id','session_version',0,'payload','{"company":{"name":"Proof"},"meeting":{"iso":"2099-01-01"}}'::jsonb,'draft_body','Proof {{CASE_TOKEN}}'));
 if (select payload#>>'{meeting,iso}'='2099-01-01' from sales_case where token=pub->>'token') then raise exception 'Meeting date changed'; end if;
 select id into b from revenue_followup_drafts where account_id=a and status='draft';
 perform public.revenue_v2_command('10000000-0000-4000-8000-000000000001','revenue-proof@example.invalid',true,gen_random_uuid(),'draft',jsonb_build_object('account_id',a,'draft_id',b,'body','Approved, not sent'));
 perform public.revenue_v2_command('10000000-0000-4000-8000-000000000001','revenue-proof@example.invalid',true,gen_random_uuid(),'activity',jsonb_build_object('account_id',a,'activity_type','call','outcome','replied','summary','Proof reply'));
 if exists(select 1 from revenue_followup_drafts where account_id=a and status<>'cancelled') then raise exception 'Reply did not cancel draft'; end if;
 if has_function_privilege('authenticated','public.revenue_v2_command(uuid,text,boolean,uuid,text,jsonb)','execute') then raise exception 'Public command grant'; end if;
 if has_table_privilege('anon','public.revenue_sessions','select') then raise exception 'Public table grant'; end if;
END;
$proof$;
select 'PASS: schema + actual commands + case + approval + reply invalidation + private grants; transaction rolled back' as verification;
rollback;
