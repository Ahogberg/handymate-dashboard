-- Requires Revenue OS v2 + revenue_sales_workflow and existing partners.
begin;
create table public.revenue_partner_leads (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.revenue_accounts(id),
 partner_id uuid not null references public.partners(id),
 snapshot jsonb not null,
 brief text not null,
 status text not null default 'assigned' check(status in ('assigned','accepted','contacted','meeting','won','lost','declined','revoked')),
 feedback text,
 next_action text,
 next_action_at timestamptz,
 version integer not null default 0,
 assigned_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index revenue_partner_one_owner on public.revenue_partner_leads(account_id) where status in ('assigned','accepted','contacted','meeting');
create index revenue_partner_inbox on public.revenue_partner_leads(partner_id,created_at desc);
create table public.revenue_partner_lead_events (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.revenue_partner_leads(id),
 actor text not null,
 status text not null,
 note text,
 created_at timestamptz not null default now()
);
create table public.revenue_partner_lead_commands (
 request_id uuid primary key,
 actor text not null,
 command text not null,
 input jsonb not null,
 result jsonb not null
);
alter table public.revenue_partner_leads enable row level security;
alter table public.revenue_partner_lead_events enable row level security;
alter table public.revenue_partner_lead_commands enable row level security;
revoke all on public.revenue_partner_leads,public.revenue_partner_lead_events,public.revenue_partner_lead_commands from public,anon,authenticated;
grant all on public.revenue_partner_leads,public.revenue_partner_lead_events,public.revenue_partner_lead_commands to service_role;

create function public.revenue_partner_suppressed(p_account uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.gtm_suppression g join public.revenue_accounts a on a.id=p_account
 where right(regexp_replace(g.org_number,'[^0-9]','','g'),10)=a.org_number or exists(
 select 1 from public.revenue_contacts c where c.account_id=a.id and
 ((g.email is not null and lower(g.email)=lower(c.email)) or (g.phone is not null and regexp_replace(g.phone,'[^0-9]','','g')=regexp_replace(c.phone,'[^0-9]','','g')))))
$$;
revoke all on function public.revenue_partner_suppressed(uuid) from public,anon,authenticated;
grant execute on function public.revenue_partner_suppressed(uuid) to service_role;

create function public.revenue_partner_lead_command(p_actor uuid,p_manager boolean,p_partner uuid,p_request uuid,p_command text,p_input jsonb,p_agreement text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a public.revenue_accounts; l public.revenue_partner_leads; c public.revenue_contacts;
 prior public.revenue_partner_lead_commands; who text; result jsonb; target uuid; new_status text;
begin
 if p_command in ('assign','revoke') then
   if p_actor is null or p_manager is distinct from true or p_partner is not null then raise exception 'Endast säljledare får tilldela leads.' using errcode='42501'; end if;
   who:='admin:'||p_actor;
 else
   if p_actor is not null or p_partner is null or not exists(select 1 from public.partners where id=p_partner and status='active' and agreement_version=p_agreement) then raise exception 'Partneråtkomst saknas.' using errcode='42501'; end if;
   who:='partner:'||p_partner;
 end if;
 if p_request is null then raise exception 'Begärans id krävs.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 if p_command='assign' then target:=(p_input->>'account_id')::uuid;
 else select account_id into target from public.revenue_partner_leads where id=(p_input->>'lead_id')::uuid and (p_command='revoke' or partner_id=p_partner); end if;
 select * into a from public.revenue_accounts where id=target for update;
 if not found then raise exception 'Leaden är inte tillgänglig.' using errcode='42501'; end if;
 if p_command<>'assign' then
   select * into l from public.revenue_partner_leads where id=(p_input->>'lead_id')::uuid for update;
   if l.id is null or (p_command<>'revoke' and l.partner_id<>p_partner) then raise exception 'Leaden är inte tillgänglig.' using errcode='42501'; end if;
 end if;
 select * into prior from public.revenue_partner_lead_commands where request_id=p_request;
 if found then
   if prior.actor<>who or prior.command<>p_command or prior.input<>p_input then raise exception 'Begäran har redan använts.' using errcode='22023'; end if;
   if p_command='update' and l.status='revoked' then raise exception 'Tilldelningen är återkallad.' using errcode='PT409'; end if;
   return prior.result;
 end if;
 if p_command='assign' then
   if (p_input->>'version')::integer is distinct from a.version then raise exception 'Företaget ändrades. Uppdatera sidan.' using errcode='PT409'; end if;
   if a.contact_state<>'active' or a.status in ('won','lost','nurture') or public.revenue_partner_suppressed(a.id) then raise exception 'Företaget får inte tilldelas för kontakt.' using errcode='22023'; end if;
   if not exists(select 1 from public.partners where id=(p_input->>'partner_id')::uuid and status='active' and agreement_version=p_agreement) then raise exception 'Välj en aktiv partner med godkänt avtal.' using errcode='22023'; end if;
   if exists(select 1 from public.revenue_partner_leads where account_id=a.id and status in ('assigned','accepted','contacted','meeting')) then raise exception 'Leaden är redan tilldelad. Återkalla först.' using errcode='PT409'; end if;
   select * into c from public.revenue_contacts where id=(p_input->>'contact_id')::uuid and account_id=a.id;
   if not found or (nullif(c.email,'') is null and nullif(c.phone,'') is null) then raise exception 'Välj en kontakt med e-post eller telefon.' using errcode='22023'; end if;
   if nullif(btrim(p_input->>'brief'),'') is null then raise exception 'Skriv ett underlag till partnern.' using errcode='22023'; end if;
   insert into public.revenue_partner_leads(account_id,partner_id,assigned_by,brief,snapshot)
   values(a.id,(p_input->>'partner_id')::uuid,p_actor,p_input->>'brief',jsonb_build_object(
    'company_name',a.company_name,'org_number',a.org_number,'city',a.city,'industry',a.industry,'website',a.website,
    'contact_name',c.name,'contact_email',c.email,'contact_phone',c.phone,'contact_role',c.role,'contact_source_url',c.source_url)) returning * into l;
   update public.revenue_sequences set status='stopped',approved_at=null,stop_reason='Tilldelad till partner' where account_id=a.id and status='active';
   update public.revenue_followup_drafts set status='cancelled' where account_id=a.id and status in ('draft','approved');
   update public.revenue_accounts set next_action='Följ upp partnerns lead',next_action_at=null,version=version+1,updated_at=now() where id=a.id;
 elsif p_command='revoke' then
   if (p_input->>'version')::integer is distinct from l.version then raise exception 'Tilldelningen ändrades.' using errcode='PT409'; end if;
   update public.revenue_partner_leads set status='revoked',next_action=null,next_action_at=null,version=version+1,updated_at=now() where id=l.id returning * into l;
 elsif p_command='update' then
   if (p_input->>'version')::integer is distinct from l.version or l.status in ('declined','revoked','won','lost') then raise exception 'Leaden är avslutad eller ändrad. Uppdatera sidan.' using errcode='PT409'; end if;
   if a.contact_state<>'active' or a.status in ('won','lost','nurture') or public.revenue_partner_suppressed(a.id) then raise exception 'Leaden är pausad, avslutad eller spärrad för kontakt.' using errcode='PT409'; end if;
   new_status:=p_input->>'status';
   if not ((l.status='assigned' and new_status in ('accepted','declined')) or
     (l.status in ('accepted','contacted','meeting') and new_status in ('contacted','meeting','won','lost'))) then raise exception 'Ogiltigt nästa steg.' using errcode='22023'; end if;
   if new_status in ('declined','won','lost') and nullif(btrim(p_input->>'feedback'),'') is null then raise exception 'Beskriv utfallet.' using errcode='22023'; end if;
   update public.revenue_partner_leads set status=new_status,feedback=nullif(p_input->>'feedback',''),
    next_action=case when new_status in ('won','lost','declined') then null else nullif(p_input->>'next_action','') end,
    next_action_at=case when new_status in ('won','lost','declined') then null else (p_input->>'next_action_at')::timestamptz end,
    version=version+1,updated_at=now() where id=l.id returning * into l;
 else raise exception 'Okänd åtgärd.' using errcode='22023'; end if;
 insert into public.revenue_partner_lead_events(lead_id,actor,status,note) values(l.id,who,l.status,coalesce(p_input->>'feedback',p_input->>'brief'));
 result:=jsonb_build_object('lead_id',l.id,'status',l.status);
 insert into public.revenue_partner_lead_commands(request_id,actor,command,input,result) values(p_request,who,p_command,p_input,result);
 return result;
end $$;
revoke all on function public.revenue_partner_lead_command(uuid,boolean,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.revenue_partner_lead_command(uuid,boolean,uuid,uuid,text,jsonb,text) to service_role;

-- Explicit partner projection: never internal notes, scoring, seller identities or other partners.
create function public.revenue_partner_lead_inbox(p_partner uuid,p_agreement text,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
with allowed as (
 select l.* from public.revenue_partner_leads l join public.revenue_accounts a on a.id=l.account_id
 where l.partner_id=p_partner and l.status not in ('revoked','declined') and a.contact_state='active' and a.status not in ('won','lost','nurture')
 and not public.revenue_partner_suppressed(a.id)
 and exists(select 1 from public.partners where id=p_partner and status='active' and agreement_version=p_agreement)
), listed as (
 select id,snapshot,brief,status,feedback,next_action,next_action_at,version,created_at,updated_at from allowed
 order by case when status='assigned' then 0 else 1 end,created_at desc,id limit 50 offset greatest(0,p_offset)
)
select jsonb_build_object('leads',coalesce((select jsonb_agg(l) from listed l),'[]'::jsonb),'total',(select count(*) from allowed));
$$;
revoke all on function public.revenue_partner_lead_inbox(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.revenue_partner_lead_inbox(uuid,text,integer) to service_role;

create function public.revenue_partner_sequence_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='active' then
   perform 1 from public.revenue_accounts where id=new.account_id for update;
   if exists(select 1 from public.revenue_partner_leads where account_id=new.account_id and status in ('assigned','accepted','contacted','meeting')) then
     raise exception 'Leaden hanteras av en partner. Återkalla tilldelningen först.' using errcode='PT409';
   end if;
 end if;
 return new;
end $$;
create trigger revenue_partner_sequence_guard before insert or update on public.revenue_sequences for each row execute function public.revenue_partner_sequence_guard();
revoke all on function public.revenue_partner_sequence_guard() from public,anon,authenticated;
grant execute on function public.revenue_partner_sequence_guard() to service_role;
commit;
