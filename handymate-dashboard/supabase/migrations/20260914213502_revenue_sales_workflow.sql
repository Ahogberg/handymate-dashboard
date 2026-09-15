-- Depends on sql/revenue_os_v1.sql, sql/v231_sales_case.sql, sql/v2_revenue_os.sql.
-- Manual seller workflow only. No delivery service or scheduler is activated.
begin;
alter table public.revenue_accounts add column if not exists qualification jsonb;
create table public.revenue_sequences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.revenue_accounts(id) on delete cascade,
  contact_id uuid not null references public.revenue_contacts(id),
  status text not null default 'active' check(status in ('active','stopped','completed')),
  step integer not null default 0 check(step between 0 and 2),
  due_at timestamptz not null,
  body text not null,
  approved_at timestamptz,
  stop_reason text,
  created_at timestamptz not null default now()
);
create unique index revenue_one_active_sequence on public.revenue_sequences(account_id) where status='active';
alter table public.revenue_sequences enable row level security;
revoke all on public.revenue_sequences from public,anon,authenticated;
grant all on public.revenue_sequences to service_role;
alter table public.revenue_activities add column if not exists sequence_id uuid references public.revenue_sequences(id);

create function public.revenue_stop_sequence() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_TABLE_NAME='revenue_accounts' then
    if new.contact_state<>'active' or new.status is distinct from old.status or new.owner_email is distinct from old.owner_email
      or exists(select 1 from public.revenue_sequences s where s.account_id=new.id and s.status='active' and (s.due_at is distinct from new.next_action_at or new.next_action is distinct from case s.step when 0 then 'Ring och undersök behovet' when 1 then 'Följ upp med ett kort mejl' else 'Ring en sista gång' end)) then
      update public.revenue_sequences set status='stopped',approved_at=null,stop_reason='Kontaktstatus, affärssteg eller ansvarig ändrades' where account_id=new.id and status='active';
    end if;
  elsif new.activity_type<>'note' and new.sequence_id is null then
    update public.revenue_sequences set status='stopped',approved_at=null,stop_reason='Ny kontakt loggad: '||coalesce(new.outcome,'') where account_id=new.account_id and status='active';
  end if;
  return new;
end $$;
create trigger revenue_sequence_account_stop after update on public.revenue_accounts for each row execute function public.revenue_stop_sequence();
create trigger revenue_sequence_activity_stop after insert on public.revenue_activities for each row execute function public.revenue_stop_sequence();
revoke all on function public.revenue_stop_sequence() from public,anon,authenticated;
grant execute on function public.revenue_stop_sequence() to service_role;

create function public.revenue_sales_command(p_actor uuid,p_email text,p_manager boolean,p_request uuid,p_command text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a public.revenue_accounts; c public.revenue_contacts; s public.revenue_sequences;
 prior public.revenue_commands; result jsonb; facts jsonb; due timestamptz; msg text; stopped boolean;
begin
 if p_actor is null or nullif(p_email,'') is null or p_request is null then raise exception 'Saknar verifierad säljare.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into a from public.revenue_accounts where id=(p_input->>'account_id')::uuid for update;
 if not found or (not p_manager and lower(coalesce(a.owner_email,''))<>lower(p_email)) then raise exception 'Företaget är inte tillgängligt.' using errcode='42501'; end if;
 select * into prior from public.revenue_commands where request_id=p_request;
 if found then
   if prior.actor_id<>p_actor or prior.command<>p_command or prior.input<>p_input then raise exception 'Begäran har redan använts.' using errcode='22023'; end if;
   if p_command<>'sequence_approve' then return prior.result; end if;
 end if;
 if (p_input->>'version')::integer is distinct from a.version then raise exception 'Företaget ändrades. Uppdatera sidan.' using errcode='PT409'; end if;
 if p_command='qualify' then
   facts:=p_input->'qualification';
   if nullif(btrim(facts->>'evidence'),'') is null or (facts->>'observed_at')::timestamptz>now() then raise exception 'Källunderlag krävs.' using errcode='22023'; end if;
   update public.revenue_accounts set qualification=facts, employee_count=(p_input->>'employee_count')::integer,
    website=p_input->>'website',industry=p_input->>'industry',city=p_input->>'city',
    icp_score=case when (facts->>'swedish_trade')::boolean then 15+case when (p_input->>'employee_count')::integer between 3 and 20 then 10 else 0 end else 0 end,
    pain_score=case when (facts->>'confirmed_pain')::boolean then 20 else 0 end,
    growth_score=case when (facts->>'confirmed_growth')::boolean then 15 else 0 end,
    warmth_score=case when (facts->>'warm_relationship')::boolean then 10 else 0 end,
    ability_to_pay_score=case when (facts->>'confirmed_budget')::boolean then 10 else 0 end,
    version=version+1,updated_at=now() where id=a.id;
   insert into public.revenue_activities(account_id,activity_type,summary,seller_email) values(a.id,'note','Kvalificering uppdaterad: '||(facts->>'evidence'),p_email);
   update public.revenue_followup_drafts set status='cancelled' where account_id=a.id and status in ('draft','approved');
   update public.revenue_sequences set approved_at=null where account_id=a.id and status='active';
   result:=jsonb_build_object('account_id',a.id);
 else
   select * into s from public.revenue_sequences where account_id=a.id and status='active' for update;
   if p_command='sequence_stop' then
     if s.id is null then raise exception 'Ingen aktiv sekvens.' using errcode='PT409'; end if;
     update public.revenue_sequences set status='stopped',approved_at=null,stop_reason='Stoppad av säljaren' where id=s.id;
     update public.revenue_accounts set next_action=null,next_action_at=null,version=version+1,updated_at=now() where id=a.id;
   else
     if a.contact_state<>'active' or a.status in ('won','lost','nurture') then raise exception 'Kontakten är inte aktiv.' using errcode='PT409'; end if;
     if exists(select 1 from public.gtm_suppression g where right(regexp_replace(g.org_number,'[^0-9]','','g'),10)=a.org_number or exists(select 1 from public.revenue_contacts x where x.account_id=a.id and ((g.email is not null and lower(g.email)=lower(x.email)) or (g.phone is not null and regexp_replace(g.phone,'[^0-9]','','g')=regexp_replace(x.phone,'[^0-9]','','g'))))) then raise exception 'Företaget eller kontakten är spärrad.' using errcode='22023'; end if;
     if p_command='sequence_start' then
       if s.id is not null then raise exception 'En sekvens är redan aktiv.' using errcode='PT409'; end if;
       select * into c from public.revenue_contacts where id=(p_input->>'contact_id')::uuid and account_id=a.id;
       if not found or nullif(c.email,'') is null or nullif(c.phone,'') is null then raise exception 'Sekvensen kräver en kontakt med e-post och telefon.' using errcode='22023'; end if;
       due:=(p_input->>'due_at')::timestamptz;
       if due is null then raise exception 'Välj starttid.' using errcode='22023'; end if;
       msg:='Hej '||c.name||'! '||coalesce(nullif(a.personalization_hook,''),'Hur fungerar administrationen runt jobben på '||a.company_name||' i dag?')||E'\n\nVill du boka 20 minuter för att gå igenom var administrationen fastnar?\n\nVänliga hälsningar\nHandymate';
       insert into public.revenue_sequences(account_id,contact_id,due_at,body) values(a.id,c.id,due,msg) returning * into s;
       update public.revenue_accounts set next_action='Ring och undersök behovet',next_action_at=due,version=version+1,updated_at=now() where id=a.id;
     else
       if s.id is null or s.id is distinct from (p_input->>'sequence_id')::uuid then raise exception 'Sekvensen är inte längre aktiv.' using errcode='PT409'; end if;
       if p_command='sequence_approve' then
         if nullif(btrim(p_input->>'body'),'') is null then raise exception 'Text krävs.' using errcode='22023'; end if;
         update public.revenue_sequences set body=p_input->>'body',approved_at=now() where id=s.id;
       elsif p_command='sequence_complete' then
         if s.due_at>now() then raise exception 'Steget är inte förfallet ännu.' using errcode='22023'; end if;
         if s.approved_at is null then raise exception 'Granska underlaget först.' using errcode='22023'; end if;
         if coalesce(p_input->>'outcome','') not in ('no_response','connected','replied','declined','pause','opt_out') then raise exception 'Välj utfall.' using errcode='22023'; end if;
         if nullif(btrim(p_input->>'summary'),'') is null then raise exception 'Beskriv vad som hände.' using errcode='22023'; end if;
         insert into public.revenue_activities(account_id,activity_type,outcome,summary,seller_email,sequence_id)
          values(a.id,case when s.step=1 then 'email' else 'call' end,p_input->>'outcome',(p_input->>'summary')||E'\n\nGranskat underlag:\n'||s.body,p_email,s.id);
         stopped:=p_input->>'outcome'<>'no_response';
         due:=((now() at time zone 'Europe/Stockholm')::date+case when s.step=0 then 2 else 3 end+time '09:00') at time zone 'Europe/Stockholm';
         while extract(isodow from due at time zone 'Europe/Stockholm') in (6,7) loop due:=due+interval '1 day'; end loop;
         update public.revenue_sequences set status=case when stopped then 'stopped' when s.step=2 then 'completed' else 'active' end,
          step=least(2,s.step+1),due_at=due,approved_at=null,stop_reason=case when stopped then p_input->>'outcome' else null end where id=s.id;
         update public.revenue_accounts set last_contact_at=greatest(last_contact_at,now()),version=version+1,updated_at=now(),
          contact_state=case p_input->>'outcome' when 'opt_out' then 'opted_out' when 'declined' then 'paused' when 'pause' then 'paused' else contact_state end,
          next_action=case when stopped or s.step=2 then null when s.step=0 then 'Följ upp med ett kort mejl' else 'Ring en sista gång' end,
          next_action_at=case when stopped or s.step=2 then null else due end where id=a.id;
         update public.revenue_followup_drafts set status='cancelled' where account_id=a.id and status in ('draft','approved');
       else raise exception 'Okänd åtgärd.' using errcode='22023'; end if;
     end if;
   end if;
   result:=jsonb_build_object('account_id',a.id,'sequence_id',s.id);
 end if;
 if prior.request_id is null then insert into public.revenue_commands(request_id,actor_id,command,input,result) values(p_request,p_actor,p_command,p_input,result); end if;
 return result;
end $$;
revoke all on function public.revenue_sales_command(uuid,text,boolean,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.revenue_sales_command(uuid,text,boolean,uuid,text,jsonb) to service_role;

create function public.revenue_sales_metrics(p_email text,p_manager boolean) returns jsonb language sql stable security invoker set search_path='' as $$
with scoped as (select * from public.revenue_accounts where p_manager or lower(owner_email)=lower(p_email)),
events as (select e.* from public.revenue_activities e join scoped a on a.id=e.account_id where e.occurred_at>=now()-interval '30 days'),
stages as (select status,count(*) as count from scoped group by status),
sources as (select source,count(*) as accounts,count(*) filter(where status='won') as won from scoped group by source),
channels as (select activity_type,count(*) as activities,count(distinct account_id) as accounts from events where activity_type<>'note' group by activity_type)
select jsonb_build_object(
 'stages',coalesce((select jsonb_agg(s) from stages s),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(s) from sources s),'[]'::jsonb),
 'channels',coalesce((select jsonb_agg(c) from channels c),'[]'::jsonb),
 'contacted_30d',(select count(distinct account_id) from events where activity_type<>'note'),
 'replied_30d',(select count(distinct account_id) from events where activity_type<>'note' and outcome in ('connected','replied')),
 'meetings_30d',(select count(*) from events where activity_type in ('meeting','audit','demo')),
 'active_sequences',(select count(*) from public.revenue_sequences s join scoped a on a.id=s.account_id where s.status='active'),
 'unqualified',(select count(*) from scoped where qualification is null),
 'stale',(select count(*) from scoped where contact_state='active' and status not in ('won','lost','nurture') and coalesce(last_contact_at,created_at)<now()-interval '14 days')
);
$$;
revoke all on function public.revenue_sales_metrics(text,boolean) from public,anon,authenticated;
grant execute on function public.revenue_sales_metrics(text,boolean) to service_role;
create function public.revenue_crm_export(p_email text,p_manager boolean) returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(r),'[]'::jsonb) from (
 select id,company_name,org_number,website,industry,city,owner_email,status,contact_state,total_score,source,next_action,next_action_at,updated_at
 from public.revenue_accounts where p_manager or lower(owner_email)=lower(p_email) order by id limit 5001
) r;
$$;
revoke all on function public.revenue_crm_export(text,boolean) from public,anon,authenticated;
grant execute on function public.revenue_crm_export(text,boolean) to service_role;
commit;
