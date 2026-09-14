-- Apply after v2_revenue_os.sql. Reuses its activity/draft transaction and approval path.
begin;
create or replace function public.revenue_prepare_outreach(
  p_actor uuid, p_email text, p_manager boolean, p_request uuid, p_input jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  a public.revenue_accounts;
  prior public.revenue_commands;
  input jsonb;
begin
  if p_actor is null or nullif(p_email,'') is null or p_request is null then
    raise exception 'Saknar verifierad säljare.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into a from public.revenue_accounts where id=(p_input->>'account_id')::uuid for update;
  if not found or (not p_manager and lower(coalesce(a.owner_email,''))<>lower(p_email)) then
    raise exception 'Företaget är inte tillgängligt.' using errcode='42501';
  end if;
  if a.contact_state<>'active' or a.status<>'identified' or a.last_contact_at is not null then
    raise exception 'Första kontakten är inte längre aktuell. Följ upp den befintliga dialogen.' using errcode='PT409';
  end if;
  if exists(select 1 from public.gtm_suppression g
    where right(regexp_replace(g.org_number,'[^0-9]','','g'),10)=a.org_number
    or exists(select 1 from public.revenue_contacts c where c.account_id=a.id and
      ((g.email is not null and lower(g.email)=lower(c.email)) or
       (g.phone is not null and regexp_replace(g.phone,'[^0-9]','','g')=regexp_replace(c.phone,'[^0-9]','','g'))))) then
    raise exception 'Företaget eller kontakten är spärrad.' using errcode='22023';
  end if;
  if nullif(btrim(p_input->>'draft_body'),'') is null or length(p_input->>'draft_body')>10000
    or nullif(btrim(p_input->>'summary'),'') is null then
    raise exception 'Utkast och underlag krävs.' using errcode='22023';
  end if;
  -- Only this server-built note is passed to the existing atomic command.
  -- Omit next_action fields to preserve the seller's existing plan.
  input:=jsonb_build_object('account_id',a.id,'activity_type','note','outcome','completed',
    'summary',p_input->>'summary','draft_body',p_input->>'draft_body',
    'outreach_version',p_input->'version');
  select * into prior from public.revenue_commands where request_id=p_request;
  if found then
    if prior.actor_id<>p_actor or prior.command<>'activity' or prior.input<>input then
      raise exception 'Begäran har redan använts med annat innehåll.' using errcode='22023';
    end if;
    if a.version<>(p_input->>'version')::integer+1 then
      raise exception 'Underlaget ändrades. Uppdatera sidan.' using errcode='PT409';
    end if;
    return prior.result;
  end if;
  if (p_input->>'version')::integer is distinct from a.version then
    raise exception 'Underlaget ändrades. Uppdatera sidan.' using errcode='PT409';
  end if;
  return public.revenue_v2_command(p_actor,p_email,p_manager,p_request,'activity',input);
end;
$$;
revoke all on function public.revenue_prepare_outreach(uuid,text,boolean,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.revenue_prepare_outreach(uuid,text,boolean,uuid,jsonb) to service_role;
commit;
