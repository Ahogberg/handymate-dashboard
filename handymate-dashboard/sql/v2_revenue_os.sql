-- Revenue OS v2, additive. No messages are sent by this migration.
begin;
alter table public.revenue_accounts
  add column if not exists contact_state text not null default 'active' check (contact_state in ('active','paused','opted_out')),
  add column if not exists version integer not null default 0,
  add column if not exists research_at timestamptz,
  add column if not exists research_error text;
create unique index if not exists revenue_accounts_normalized_org_uidx
  on public.revenue_accounts (right(regexp_replace(org_number, '[^0-9]', '', 'g'),10)) where org_number is not null;
alter table public.revenue_signals add column if not exists external_id text;
create unique index if not exists revenue_signals_external_uidx on public.revenue_signals(source,external_id) where external_id is not null;
create table if not exists public.revenue_contacts (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.revenue_accounts(id) on delete cascade,
  name text not null, email text, phone text, role text, source_url text,
  contact_basis text not null check (contact_basis in ('public_business_contact','public_professional_role','warm_intro','inbound','customer_referral')),
  created_at timestamptz not null default now()
);
create table if not exists public.revenue_sessions (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.revenue_accounts(id) on delete cascade,
  meeting_date date not null default (now() at time zone 'Europe/Stockholm')::date,
  payload jsonb not null default '{}'::jsonb, case_token text unique references public.sales_case(token),
  version integer not null default 0, created_by uuid not null, created_at timestamptz not null default now()
);
create table if not exists public.revenue_followup_drafts (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.revenue_accounts(id) on delete cascade,
  body text not null, status text not null default 'draft' check(status in ('draft','approved','cancelled')),
  account_version integer not null, created_at timestamptz not null default now(), approved_at timestamptz, approved_by uuid
);
create table if not exists public.revenue_commands (
  request_id uuid primary key, actor_id uuid not null, command text not null, input jsonb not null,
  result jsonb not null, created_at timestamptz not null default now()
);
create index if not exists revenue_contacts_account_idx on public.revenue_contacts(account_id);
create index if not exists revenue_sessions_account_idx on public.revenue_sessions(account_id,created_at desc);
create index if not exists revenue_followups_account_idx on public.revenue_followup_drafts(account_id,created_at desc);
create table if not exists public.revenue_source_runs (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null, source text not null,
  status text not null check(status in ('running','succeeded','failed')), imported integer not null default 0,
  error text, started_at timestamptz not null default now(), finished_at timestamptz
);

alter table public.revenue_contacts enable row level security;
alter table public.revenue_sessions enable row level security;
alter table public.revenue_followup_drafts enable row level security;
alter table public.revenue_commands enable row level security;
alter table public.revenue_source_runs enable row level security;
revoke all on public.revenue_contacts,public.revenue_sessions,public.revenue_followup_drafts,public.revenue_commands,public.revenue_source_runs from anon,authenticated;
grant all on public.revenue_contacts,public.revenue_sessions,public.revenue_followup_drafts,public.revenue_commands,public.revenue_source_runs to service_role;

-- Internal command boundary. Actor and role are supplied ONLY by the verified server.
-- Account lock serializes activity, response/stop, session publishing and draft approval.
create or replace function public.revenue_v2_command(p_actor uuid, p_email text, p_manager boolean, p_request uuid, p_command text, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  a public.revenue_accounts; s public.revenue_sessions; d public.revenue_followup_drafts;
  prior public.revenue_commands; result jsonb; row_id uuid; at_time timestamptz;
  org text; state text; payload jsonb; new_token text; stage text; followup_at timestamptz;
begin
  if p_actor is null or nullif(p_email,'') is null or p_request is null then raise exception 'Saknar verifierad säljare.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into prior from public.revenue_commands where request_id=p_request;
  if found then
    if prior.actor_id<>p_actor or prior.command<>p_command or prior.input<>p_input then raise exception 'Begäran har redan använts med annat innehåll.' using errcode='22023'; end if;
    -- Re-check ownership on retries too: reassignment must revoke historical command access.
    if prior.result ? 'account_id' then
      perform 1 from public.revenue_accounts where id=(prior.result->>'account_id')::uuid and (p_manager or lower(owner_email)=lower(p_email));
      if not found then raise exception 'Företaget är inte tillgängligt.' using errcode='42501'; end if;
    end if;
    if p_command='draft' then
      select * into a from public.revenue_accounts where id=(prior.result->>'account_id')::uuid for update;
      select * into d from public.revenue_followup_drafts where id=(prior.result->>'id')::uuid;
      if exists(select 1 from public.gtm_suppression g where right(regexp_replace(g.org_number,'[^0-9]','','g'),10)=a.org_number or exists(select 1 from public.revenue_contacts c where c.account_id=a.id and ((g.email is not null and lower(g.email)=lower(c.email)) or (g.phone is not null and regexp_replace(g.phone,'[^0-9]','','g')=regexp_replace(c.phone,'[^0-9]','','g'))))) then raise exception 'Företaget eller kontakten är spärrad.' using errcode='22023'; end if;
      if d.status<>'approved' or d.account_version<>a.version or a.contact_state<>'active' or a.status in ('won','lost','nurture') then
        raise exception 'Utkastet är inte längre aktuellt.' using errcode='40001';
      end if;
    end if;
    return prior.result;
  end if;

  if p_command in ('create','import') then
    org:=nullif(right(regexp_replace(coalesce(p_input->>'org_number',''),'[^0-9]','','g'),10),'');
    if org is not null and length(org)<>10 then raise exception 'Ogiltigt organisationsnummer.' using errcode='22023'; end if;
    if nullif(btrim(p_input->>'company_name'),'') is null then raise exception 'Företagsnamn krävs.' using errcode='22023'; end if;
    if org is not null then
      perform pg_advisory_xact_lock(hashtextextended('revenue-org:'||org,0));
      if exists(select 1 from public.gtm_suppression where right(regexp_replace(org_number,'[^0-9]','','g'),10)=org) then raise exception 'Företaget är spärrat för kontakt.' using errcode='22023'; end if;
      select * into a from public.revenue_accounts where right(regexp_replace(org_number,'[^0-9]','','g'),10)=org;
    end if;
    if a.id is not null then
      if not p_manager and lower(coalesce(a.owner_email,''))<>lower(p_email) then raise exception 'Företaget har redan en annan ansvarig säljare.' using errcode='42501'; end if;
    else
      insert into public.revenue_accounts(company_name,org_number,industry,city,owner_email,source,source_url,created_by,next_action)
      values(btrim(p_input->>'company_name'),org,p_input->>'industry',p_input->>'city',lower(p_email),coalesce(p_input->>'source','manual'),p_input->>'source_url',p_actor,'Undersök behov och kontaktväg') returning * into a;
    end if;
  else
    select * into a from public.revenue_accounts where id=(p_input->>'account_id')::uuid for update;
    if not found or (not p_manager and lower(coalesce(a.owner_email,''))<>lower(p_email)) then raise exception 'Företaget är inte tillgängligt.' using errcode='42501'; end if;
  end if;

  if p_command='import' then
    insert into public.revenue_signals(account_id,signal_type,title,detail,source,source_url,observed_at,external_id)
    values(a.id,'hiring',p_input->>'title',p_input->>'detail','Platsbanken',p_input->>'source_url',(p_input->>'observed_at')::timestamptz,p_input->>'external_id') on conflict do nothing;
    result:=jsonb_build_object('account_id',a.id);
  elsif p_command='create' then result:=jsonb_build_object('account_id',a.id);
  elsif p_command='contact' then
    if nullif(btrim(p_input->>'name'),'') is null then raise exception 'Namn krävs.' using errcode='22023'; end if;
    insert into public.revenue_contacts(account_id,name,email,phone,role,source_url,contact_basis)
    values(a.id,p_input->>'name',nullif(lower(p_input->>'email'),''),nullif(p_input->>'phone',''),p_input->>'role',p_input->>'source_url',p_input->>'contact_basis') returning id into row_id;
    result:=jsonb_build_object('account_id',a.id,'id',row_id);
  elsif p_command='activity' then
    at_time:=coalesce((p_input->>'occurred_at')::timestamptz,now());
    if at_time>now()+interval '5 minutes' then raise exception 'Kontakt kan inte dateras i framtiden.' using errcode='22023'; end if;
    insert into public.revenue_activities(account_id,activity_type,outcome,summary,seller_email,occurred_at)
    values(a.id,p_input->>'activity_type',p_input->>'outcome',p_input->>'summary',p_email,at_time) returning id into row_id;
    state:=case p_input->>'outcome' when 'opt_out' then 'opted_out' when 'declined' then 'paused' when 'pause' then 'paused' else a.contact_state end;
    -- Notes are not contact. A late import cannot move the contact clock backwards.
    update public.revenue_accounts set
      last_contact_at=case when p_input->>'activity_type'='note' then last_contact_at else greatest(last_contact_at,at_time) end,
      contact_state=state, version=version+1, updated_at=now(),
      next_action=case when state<>'active' then null when p_input ? 'next_action' then nullif(p_input->>'next_action','') else next_action end,
      next_action_at=case when state<>'active' then null when p_input ? 'next_action_at' then (p_input->>'next_action_at')::timestamptz else next_action_at end
      where id=a.id returning * into a;
    update public.revenue_followup_drafts set status='cancelled' where account_id=a.id and status in ('draft','approved');
    if nullif(p_input->>'draft_body','') is not null and state='active' and coalesce(p_input->>'outcome','') not in ('replied','declined','pause','opt_out') then
      insert into public.revenue_followup_drafts(account_id,body,account_version) values(a.id,p_input->>'draft_body',a.version);
    end if;
    result:=jsonb_build_object('account_id',a.id,'id',row_id);
  elsif p_command='next' then
    if (p_input->>'version')::integer is distinct from a.version then raise exception 'Företaget ändrades. Uppdatera sidan.' using errcode='40001'; end if;
    stage:=coalesce(p_input->>'status',a.status);
    state:=coalesce(p_input->>'contact_state',a.contact_state);
    if a.contact_state='opted_out' and state<>'opted_out' then raise exception 'Kontaktspärren måste hanteras separat.' using errcode='22023'; end if;
    if not p_manager and p_input ? 'owner_email' and lower(p_input->>'owner_email')<>lower(p_email) then raise exception 'Endast säljledare får byta ansvarig.' using errcode='42501'; end if;
    update public.revenue_accounts set status=stage,contact_state=state,version=version+1,updated_at=now(),
      owner_email=case when p_input ? 'owner_email' then lower(p_input->>'owner_email') else owner_email end,
      lost_reason=case when stage='lost' then p_input->>'lost_reason' else null end,
      next_action=case when state<>'active' or stage in ('won','lost','nurture') then null else nullif(p_input->>'next_action','') end,
      next_action_at=case when state<>'active' or stage in ('won','lost','nurture') then null else (p_input->>'next_action_at')::timestamptz end
      where id=a.id;
    update public.revenue_followup_drafts set status='cancelled' where account_id=a.id and status in ('draft','approved');
    result:=jsonb_build_object('account_id',a.id);
  elsif p_command='session' then
    insert into public.revenue_sessions(account_id,created_by,payload) values(a.id,p_actor,jsonb_build_object('company',jsonb_build_object('name',a.company_name,'org',a.org_number))) returning id into row_id;
    result:=jsonb_build_object('account_id',a.id,'session_id',row_id);
  elsif p_command='case' then
    select * into s from public.revenue_sessions where id=(p_input->>'session_id')::uuid and account_id=a.id for update;
    if not found then raise exception 'Genomgången saknas.' using errcode='22023'; end if;
    if s.version is distinct from (p_input->>'session_version')::integer then raise exception 'Genomgången ändrades. Uppdatera sidan.' using errcode='40001'; end if;
    payload:=jsonb_set(p_input->'payload','{meeting}',jsonb_build_object('iso',s.meeting_date::text,'date',s.meeting_date::text));
    -- Re-publishing issues a new immutable snapshot. Existing links keep their original meeting data.
    new_token:=gen_random_uuid()::text;
    insert into public.sales_case(token,business_name,org_number,prospect_name,prospect_email,payload,created_by_user_id,created_by_business_id,expires_at)
    values(new_token,a.company_name,a.org_number,payload#>>'{prospect,name}',payload#>>'{prospect,email}',payload,p_actor,p_input->>'business_id',now()+interval '90 days');
    update public.revenue_sessions set payload=jsonb_set(p_input->'payload','{meeting}',jsonb_build_object('iso',s.meeting_date::text,'date',s.meeting_date::text)),case_token=new_token,version=version+1 where id=s.id;
    followup_at:=((now() at time zone 'Europe/Stockholm')::date+2+time '09:00') at time zone 'Europe/Stockholm';
    while extract(isodow from followup_at at time zone 'Europe/Stockholm') in (6,7) loop
      followup_at:=followup_at+interval '1 day';
    end loop;
    update public.revenue_accounts set version=version+1,updated_at=now(),
      next_action=case when contact_state='active' and status not in ('won','lost','nurture') then 'Följ upp genomgången' else next_action end,
      next_action_at=case when contact_state='active' and status not in ('won','lost','nurture') then
        case when next_action_at>now() then next_action_at else followup_at end else next_action_at end
      where id=a.id returning * into a;
    update public.revenue_followup_drafts set status='cancelled' where account_id=a.id and status in ('draft','approved');
    if a.contact_state='active' and a.status not in ('won','lost','nurture') then
      insert into public.revenue_followup_drafts(account_id,body,account_version)
      values(a.id,replace(p_input->>'draft_body','{{CASE_TOKEN}}',new_token),a.version);
    end if;
    result:=jsonb_build_object('account_id',a.id,'session_id',s.id,'token',new_token);
  elsif p_command='draft' then
    select * into d from public.revenue_followup_drafts where id=(p_input->>'draft_id')::uuid and account_id=a.id for update;
    if not found or d.status='cancelled' or d.account_version<>a.version or a.contact_state<>'active' or a.status in ('won','lost','nurture') then raise exception 'Utkastet är inte längre aktuellt.' using errcode='40001'; end if;
    if exists(select 1 from public.gtm_suppression g where right(regexp_replace(g.org_number,'[^0-9]','','g'),10)=a.org_number or exists(select 1 from public.revenue_contacts c where c.account_id=a.id and ((g.email is not null and lower(g.email)=lower(c.email)) or (g.phone is not null and regexp_replace(g.phone,'[^0-9]','','g')=regexp_replace(c.phone,'[^0-9]','','g'))))) then raise exception 'Företaget eller kontakten är spärrad.' using errcode='22023'; end if;
    update public.revenue_followup_drafts set body=p_input->>'body',status='approved',approved_at=now(),approved_by=p_actor where id=d.id;
    result:=jsonb_build_object('account_id',a.id,'id',d.id);
  elsif p_command='research' then
    update public.revenue_accounts set why_now=p_input->>'why_now',pain_hypothesis=p_input->>'pain_hypothesis',personalization_hook=p_input->>'personalization_hook',timing_score=(p_input->>'timing_score')::integer,research_at=now(),research_error=null,updated_at=now() where id=a.id;
    result:=jsonb_build_object('account_id',a.id);
  else raise exception 'Okänd åtgärd.' using errcode='22023';
  end if;
  insert into public.revenue_commands(request_id,actor_id,command,input,result) values(p_request,p_actor,p_command,p_input,result);
  return result;
end;
$$;
revoke all on function public.revenue_v2_command(uuid,text,boolean,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.revenue_v2_command(uuid,text,boolean,uuid,text,jsonb) to service_role;
create or replace function public.revenue_v2_overview(p_email text,p_manager boolean,p_search text default '',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
with scoped as (
 select a.* from public.revenue_accounts a where p_manager or lower(a.owner_email)=lower(p_email)
), listed as (
 select * from scoped where company_name ilike '%'||p_search||'%' or org_number ilike '%'||p_search||'%'
 order by total_score desc,company_name,id limit 50 offset greatest(p_offset,0)
), queue as (
 select * from scoped where status not in ('won','lost','nurture') and contact_state='active'
 order by case when next_action_at<=now() then 0 else 1 end,
 case when next_action_at<=now() then next_action_at end asc,
 total_score desc,id limit 30
)
select jsonb_build_object(
 'accounts',coalesce((select jsonb_agg(l) from listed l),'[]'::jsonb),
 'queue',coalesce((select jsonb_agg(q) from queue q),'[]'::jsonb),
 'total',(select count(*) from scoped),
 'matching',(select count(*) from scoped where company_name ilike '%'||p_search||'%' or org_number ilike '%'||p_search||'%'),
 'due',(select count(*) from scoped where next_action_at<=now() and contact_state='active' and status not in ('won','lost','nurture')),
 'missing_next',(select count(*) from scoped where next_action_at is null and contact_state='active' and status not in ('won','lost','nurture')),
 'won',(select count(*) from scoped where status='won'),
 'owners',coalesce((select jsonb_agg(distinct owner_email) from scoped where owner_email is not null),'[]'::jsonb)
);
$$;
revoke all on function public.revenue_v2_overview(text,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.revenue_v2_overview(text,boolean,text,integer) to service_role;
commit;
