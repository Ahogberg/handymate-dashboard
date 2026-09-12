-- Pin application functions to trusted schemas. Extension functions are excluded.
-- No function body, data, or existing EXECUTE permission is changed.
revoke create on schema public from public, anon, authenticated;
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proconfig is null
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid
          and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.signature);
  end loop;
end $$;
