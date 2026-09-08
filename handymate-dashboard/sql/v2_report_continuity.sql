-- Apply once (this file OR its matching Supabase migration). No runner or sends.
create table public.work_report_session (
 id text primary key,
 business_id text not null references public.business_config(business_id) on delete cascade,
 business_user_id text not null references public.business_users(id) on delete cascade,
 project_id text not null references public.project(project_id) on delete cascade,
 work_date date not null,
 thread_id text,
 parts jsonb not null check(jsonb_typeof(parts)='array' and jsonb_array_length(parts) between 1 and 4),
 completed integer not null default 0 check(completed between 0 and 4),
 receipts jsonb not null default '[]' check(jsonb_typeof(receipts)='array'),
 state text not null default 'open' check(state in ('open','finished','discarded')),
 claimed_at timestamptz,
 claim_id text,
 last_error boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '14 days',
 check(completed<=jsonb_array_length(parts)),
 check(jsonb_array_length(receipts)=completed)
);
create index work_report_session_owner on public.work_report_session(business_id,business_user_id,project_id,work_date,created_at desc);
create unique index work_report_one_open on public.work_report_session(business_id,business_user_id,project_id,work_date) where state='open';
alter table public.work_report_session enable row level security;
create policy work_report_service_access on public.work_report_session to service_role using (true) with check (true);
revoke all on public.work_report_session from public,anon,authenticated;
grant select,insert,update,delete on public.work_report_session to service_role;

-- Serializes decisions on one immutable plan. A retry after a lost worker is
-- user-triggered and uses the SAME artifact identity; it never advances a step.
create function public.claim_work_report_step(p_business text,p_user text,p_id text,p_tool text,p_input jsonb)
returns public.work_report_session language plpgsql security invoker set search_path='' as $$
declare r public.work_report_session;
begin
 select * into r from public.work_report_session where id=p_id and business_id=p_business and business_user_id=p_user for update;
 if not found then raise exception 'report_not_found'; end if;
 if not exists(select 1 from public.business_users where id=p_user and business_id=p_business and is_active=true) then raise exception 'member_unavailable'; end if;
 if r.state<>'open' or r.expires_at<=now() then raise exception 'report_closed'; end if;
 if r.parts->r.completed->>'toolName' is distinct from p_tool or r.parts->r.completed->'toolInput' is distinct from p_input then raise exception 'stale_report_step'; end if;
 if r.claimed_at>now()-interval '2 minutes' then raise exception 'report_in_progress'; end if;
 update public.work_report_session set claimed_at=now(),claim_id=gen_random_uuid()::text,updated_at=now() where id=r.id returning * into r;
 return r;
end $$;
create function public.finish_work_report_step(p_business text,p_user text,p_id text,p_index integer,p_claim text,p_success boolean,p_receipt jsonb)
returns public.work_report_session language plpgsql security invoker set search_path='' as $$
declare r public.work_report_session;
begin
 select * into r from public.work_report_session where id=p_id and business_id=p_business and business_user_id=p_user for update;
 if not found then raise exception 'report_not_found'; end if;
 -- Late duplicate completion must not overwrite a later step's evidence.
 if r.completed>p_index then return r; end if;
 if r.state<>'open' or r.completed<>p_index or r.claimed_at is null or r.claim_id is distinct from p_claim then raise exception 'stale_report_step'; end if;
 if p_success then
  if p_receipt->>'tool' is distinct from r.parts->p_index->>'toolName' or coalesce(p_receipt->>'status','') not in ('saved','already_saved') then raise exception 'invalid_receipt'; end if;
  update public.work_report_session set receipts=receipts||jsonb_build_array(p_receipt),completed=completed+1,
   state=case when completed+1=jsonb_array_length(parts) then 'finished' else 'open' end,
   claimed_at=null,last_error=false,updated_at=now() where id=r.id returning * into r;
 else
  update public.work_report_session set claimed_at=null,last_error=true,updated_at=now() where id=r.id returning * into r;
 end if;
 return r;
end $$;
create function public.discard_work_report(p_business text,p_user text,p_id text)
returns public.work_report_session language plpgsql security invoker set search_path='' as $$
declare r public.work_report_session;
begin
 select * into r from public.work_report_session where id=p_id and business_id=p_business and business_user_id=p_user for update;
 if not found then raise exception 'report_not_found'; end if;
 if r.claimed_at is not null then raise exception 'report_in_progress'; end if;
 if r.state='open' then update public.work_report_session set state='discarded',updated_at=now() where id=r.id returning * into r; end if;
 return r;
end $$;
revoke all on function public.claim_work_report_step(text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.finish_work_report_step(text,text,text,integer,text,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.discard_work_report(text,text,text) from public,anon,authenticated;
grant execute on function public.claim_work_report_step(text,text,text,text,jsonb) to service_role;
grant execute on function public.finish_work_report_step(text,text,text,integer,text,boolean,jsonb) to service_role;
grant execute on function public.discard_work_report(text,text,text) to service_role;
