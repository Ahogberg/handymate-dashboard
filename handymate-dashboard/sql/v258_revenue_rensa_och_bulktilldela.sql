-- v258 (2026-09-17): rensa katalogen och tilldela partnerleads i bulk.
--
-- Andreas: "man borde kunna bulktilldela leads … eller bara åtminstone kunna
-- välja flera samtidigt enkelt från menyn. Sen behöver vi också kunna på ett
-- enkelt sätt rensa i vår leadskatalog."
--
-- Två funktioner, båda säljledargrindade, båda idempotenta via
-- revenue_commands (samma request_id ger samma svar, aldrig en andra körning).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. revenue_discard_accounts — rensa flera företag ur katalogen.
--
-- FYRA HINDER, samma som avgränsningen i v257. Ett företag som träffas av
-- något av dem raderas ALDRIG; det rapporteras tillbaka med sitt hinder så
-- säljledaren ser varför, i stället för att en knapp tiger om halva urvalet.
--
--   partnerlead   Raden är partnerns historik. FK:n har redan NO ACTION —
--                 detta är bälte och hängslen, med ett läsbart skäl.
--   kontaktsparr  contact_state <> 'active'. Ett 'opted_out' som raderas är
--                 ett NEJ som glöms: Revenue OS skriver INTE till
--                 gtm_suppression (den listan fylls bara från Launch Desk),
--                 så spärren bor på raden och måste stanna.
--   historik      Det finns aktiviteter. Har vi hört av oss ska kontot
--                 stängas som 'lost' med skäl, inte raderas.
--   kontaktperson En insamlad kontaktuppgift har en källa och en
--                 kontaktgrund. Raderas den tyst tappar vi beviset för
--                 varför vi fick spara den.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.revenue_discard_accounts(
  p_actor uuid, p_email text, p_manager boolean, p_request uuid, p_ids uuid[]
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare prior public.revenue_commands; result jsonb;
begin
  if p_actor is null or nullif(p_email,'') is null or p_request is null then
    raise exception 'Saknar verifierad säljare.' using errcode='42501';
  end if;
  if not p_manager then
    raise exception 'Bara säljledare får rensa i katalogen.' using errcode='42501';
  end if;
  if p_ids is null or array_length(p_ids,1) is null then
    raise exception 'Välj minst ett företag.' using errcode='22023';
  end if;
  if array_length(p_ids,1) > 200 then
    raise exception 'Rensa högst 200 företag i taget.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into prior from public.revenue_commands where request_id=p_request;
  if found then
    if prior.actor_id<>p_actor or prior.command<>'discard' then
      raise exception 'Begäran har redan använts med annat innehåll.' using errcode='22023';
    end if;
    return prior.result;
  end if;

  with valda as (
    select a.id, a.company_name,
      case
        when exists(select 1 from public.revenue_partner_leads l where l.account_id=a.id) then 'partnerlead'
        when a.contact_state <> 'active' then 'kontaktsparr'
        when exists(select 1 from public.revenue_activities v where v.account_id=a.id) then 'historik'
        when exists(select 1 from public.revenue_contacts c where c.account_id=a.id) then 'kontaktperson'
      end as hinder
    from public.revenue_accounts a where a.id = any(p_ids)
  ), bort as (
    delete from public.revenue_accounts
    where id in (select id from valda where hinder is null)
    returning id
  )
  select jsonb_build_object(
    'borttagna', (select count(*) from bort),
    'behallna', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'foretag', company_name, 'hinder', hinder
    ) order by company_name) from valda where hinder is not null), '[]'::jsonb),
    'saknades', array_length(p_ids,1) - (select count(*) from valda)
  ) into result;

  insert into public.revenue_commands(request_id,actor_id,command,input,result)
  values(p_request,p_actor,'discard',jsonb_build_object('ids',to_jsonb(p_ids)),result);
  return result;
end $$;

revoke all on function public.revenue_discard_accounts(uuid,text,boolean,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.revenue_discard_accounts(uuid,text,boolean,uuid,uuid[]) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. revenue_assign_partner_bulk — tilldela flera företag till EN partner.
--
-- UNDERLAGET SKRIVS INTE GENERISKT. Enstyckstilldelningen kräver att
-- säljledaren skriver ett underlag per företag, och det kravet finns för att
-- en partner som får "här är tio bolag" utan sammanhang inte ringer något av
-- dem. Bulkvägen kringgår inte kravet — den bygger underlaget ur FÖRETAGETS
-- EGEN research (why_now, pain_hypothesis, personalization_hook,
-- recommended_cta). Saknas researchen får företaget inget underlag och
-- hoppas över. Ingen påhittad text, ingen mall som passar alla.
--
-- HINDER som rapporteras tillbaka i stället för att tigas bort:
--   ingen_kontakt  Företaget har ingen kontaktperson. En lead utan någon att
--                  ringa är arbete partnern inte kan utföra.
--   ingen_research why_now saknas — det finns inget att skriva underlag av.
--   redan_tilldelad Det finns redan en aktiv lead på företaget.
--   sparrad        gtm_suppression träffar företaget eller kontakten.
--   ej_oppen       Kontot är vunnet, förlorat, i nurture eller inte aktivt.
--   nekades        Tilldelningsregeln sa nej av något annat skäl; skälet
--                  följer med ordagrant i svaret.
--
-- Själva tilldelningen delegeras till revenue_partner_lead_command, som är
-- och förblir enda stället där en partnerlead skapas.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.revenue_assign_partner_bulk(
  p_actor uuid, p_email text, p_manager boolean, p_request uuid,
  p_partner uuid, p_ids uuid[], p_agreement text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  prior public.revenue_commands; result jsonb;
  a public.revenue_accounts; kontakt uuid; underlag text; hinder text;
  tilldelade jsonb := '[]'::jsonb; hoppade jsonb := '[]'::jsonb; konto uuid;
begin
  if p_actor is null or nullif(p_email,'') is null or p_request is null then
    raise exception 'Saknar verifierad säljare.' using errcode='42501';
  end if;
  if not p_manager then
    raise exception 'Bara säljledare får fördela partnerleads.' using errcode='42501';
  end if;
  if p_ids is null or array_length(p_ids,1) is null then
    raise exception 'Välj minst ett företag.' using errcode='22023';
  end if;
  if array_length(p_ids,1) > 50 then
    raise exception 'Tilldela högst 50 företag i taget.' using errcode='22023';
  end if;
  if not exists(select 1 from public.partners
                where id=p_partner and status='active' and agreement_version=p_agreement) then
    raise exception 'Partnern är inte aktiv med gällande avtal.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into prior from public.revenue_commands where request_id=p_request;
  if found then
    if prior.actor_id<>p_actor or prior.command<>'assign_bulk' then
      raise exception 'Begäran har redan använts med annat innehåll.' using errcode='22023';
    end if;
    return prior.result;
  end if;

  foreach konto in array p_ids loop
    select * into a from public.revenue_accounts where id=konto;
    hinder := null; kontakt := null;

    if a.id is null then
      hinder := 'saknas';
    elsif a.contact_state <> 'active' or a.status in ('won','lost','nurture') then
      hinder := 'ej_oppen';
    elsif public.revenue_partner_suppressed(a.id) then
      hinder := 'sparrad';
    elsif exists(select 1 from public.revenue_partner_leads l
                 where l.account_id=a.id and l.status not in ('revoked','declined')) then
      hinder := 'redan_tilldelad';
    elsif nullif(btrim(coalesce(a.why_now,'')),'') is null then
      hinder := 'ingen_research';
    else
      -- Enstycksvägen kräver en kontakt MED e-post eller telefon. Samma krav
      -- här, annars hade bulken fallit på första kontakten utan nåbarhet.
      select c.id into kontakt from public.revenue_contacts c
      where c.account_id=a.id
        and (nullif(c.email,'') is not null or nullif(c.phone,'') is not null)
      order by c.created_at limit 1;
      if kontakt is null then hinder := 'ingen_kontakt'; end if;
    end if;

    if hinder is not null then
      hoppade := hoppade || jsonb_build_object(
        'id', konto, 'foretag', coalesce(a.company_name,''), 'hinder', hinder);
      continue;
    end if;

    -- Underlaget ur företagets egen research. Varje del bara om den finns.
    underlag := concat_ws(E'\n\n',
      nullif(btrim(a.why_now),''),
      nullif(btrim(coalesce(a.pain_hypothesis,'')),''),
      nullif(btrim(coalesce(a.personalization_hook,'')),''),
      nullif(btrim(coalesce(a.recommended_cta,'')),''));

    -- Egen begäran per företag, härledd ur bulkens request_id: en delvis
    -- lyckad bulk kan köras om utan att skapa dubbletter av det som redan
    -- gick igenom. md5 i stället för uuid_generate_v5 — ingen extension.
    begin
      perform public.revenue_partner_lead_command(
        p_actor, true, null,
        md5(p_request::text || ':' || konto::text)::uuid,
        'assign',
        jsonb_build_object('account_id', konto, 'partner_id', p_partner,
                           'contact_id', kontakt, 'brief', underlag,
                           'version', a.version),
        p_agreement);
      tilldelade := tilldelade || jsonb_build_object('id', konto, 'foretag', a.company_name);
    exception when others then
      -- Ett företag som nekas av tilldelningsregeln får inte ta med sig de
      -- 49 andra. Skälet rapporteras ordagrant i stället för att sväljas —
      -- en tyst bulk är värre än en som säger vad den inte gjorde.
      hoppade := hoppade || jsonb_build_object(
        'id', konto, 'foretag', coalesce(a.company_name,''),
        'hinder', 'nekades', 'skal', SQLERRM);
    end;
  end loop;

  result := jsonb_build_object(
    'tilldelade', tilldelade,
    'hoppade', hoppade,
    'antal', jsonb_array_length(tilldelade));

  insert into public.revenue_commands(request_id,actor_id,command,input,result)
  values(p_request,p_actor,'assign_bulk',
         jsonb_build_object('partner_id',p_partner,'ids',to_jsonb(p_ids)),result);
  return result;
end $$;

revoke all on function public.revenue_assign_partner_bulk(uuid,text,boolean,uuid,uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.revenue_assign_partner_bulk(uuid,text,boolean,uuid,uuid,uuid[],text) to service_role;

-- Read-only verifiering efter körning.
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname IN ('revenue_discard_accounts','revenue_assign_partner_bulk');
SELECT count(*) AS konton FROM public.revenue_accounts;

-- ─────────────────────────────────────────────────────────────────────────
-- LEVANDE BEVIS för rensningens hinder, kört 2026-09-17 mot produktion.
-- Tre testkonton läggs in, rensningen anropas på alla tre, och bara det
-- orörda ska försvinna. Testraderna städas efteråt, avgränsat på namnet.
-- ─────────────────────────────────────────────────────────────────────────
-- INSERT INTO public.revenue_accounts (company_name, source, why_now)
--   VALUES ('ZZ-TEST-v258 rent', 'manual', 'test'),
--          ('ZZ-TEST-v258 kontakt', 'manual', 'test'),
--          ('ZZ-TEST-v258 sparr', 'manual', 'test');
-- (kontakt får en revenue_contacts-rad, sparr får contact_state='opted_out')
-- SELECT public.revenue_discard_accounts(
--   '00000000-0000-4000-8000-000000000001', 'andreas@byglo.se', true,
--   gen_random_uuid(), ARRAY[<de tre id:na>]);
-- Förväntat: borttagna=1, behallna=[kontakt → kontaktperson,
--            sparr → kontaktsparr], saknades=0.
-- DELETE FROM public.revenue_accounts WHERE company_name LIKE 'ZZ-TEST-v258%';
