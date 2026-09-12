const { PGlite } = require('@electric-sql/pglite')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const sql = fs.readFileSync('supabase/migrations/20260912144309_launch_security_billing.sql', 'utf8')
const columns = table => [...sql.matchAll(new RegExp('grant (?:select|update) \\(([^)]*)\\)\\s*on public\\.'+table+' ', 'g'))]
  .flatMap(m => m[1].split(',').map(c => c.trim()))
;(async () => {
  const db = new PGlite()
  const fields = table => [...new Set(columns(table))].filter(c => !['business_id','user_id','is_active','role'].includes(c)).map(c => `"${c}" text`).join(',')
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table business_config(business_id text primary key,user_id uuid,subscription_status text,stripe_subscription_id text,${fields('business_config')});
    create table business_users(business_id text,user_id uuid,is_active boolean,role text,invite_token text,hourly_cost int,${fields('business_users')});
    create table calendar_connection(access_token text,refresh_token text,${[...new Set(columns('calendar_connection'))].map(c=>`"${c}" text`).join(',')});
    create table storage.objects(bucket_id text,name text);
    create function public.rate_limit_check(text,integer,bigint) returns boolean language sql as $$select true$$;
    create function public.rate_limit_cleanup() returns integer language sql as $$select 0$$;
    create function public.is_business_member(target_business_id text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
      select exists(select 1 from business_users where business_id=target_business_id and user_id=auth.uid() and is_active)
      or exists(select 1 from business_config where business_id=target_business_id and user_id=auth.uid())$$;
    alter table business_config enable row level security; alter table business_users enable row level security;
    alter table calendar_connection enable row level security; alter table storage.objects enable row level security;
    grant all on business_config,business_users,calendar_connection,storage.objects to authenticated,service_role;
    create policy business_config_tenant_member on business_config for all to authenticated using(is_business_member(business_id));
    create policy business_users_tenant_member on business_users for all to authenticated using(is_business_member(business_id));
    create policy calendar_connection_tenant_member on calendar_connection for all to authenticated using(is_business_member(business_id));
    create policy "SELECT 1t7nrt5_0" on storage.objects for select to public using(auth.uid() is not null);
    create policy "DELETE 1t7nrt5_0" on storage.objects for delete to public using(auth.uid() is not null);
    create policy "INSERT 1t7nrt5_0" on storage.objects for insert to public with check(auth.uid() is not null);
    create policy public_assets on storage.objects for select using(bucket_id='business-assets');
    insert into business_config(business_id,user_id,subscription_status,business_name) values
      ('A','00000000-0000-0000-0000-000000000001','trial','A'),('B','00000000-0000-0000-0000-000000000003','trial','B');
    insert into business_users(business_id,user_id,is_active,role,name,invite_token) values
      ('A','00000000-0000-0000-0000-000000000002',true,'employee','Employee','synthetic');
    insert into calendar_connection(business_id,access_token,sync_direction) values ('A','synthetic','both');
    insert into storage.objects values ('customer-documents','B/file'),('project-files','B/file'),('meeting-audio','B/file'),('business-assets','logo');
  `)
  await db.exec(sql)
  const user = async id => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-${id.padStart(12,'0')}',false)`)
  const denied = async query => assert.rejects(db.query(query), /permission denied/)
  await user('2')
  await denied("update business_users set role='owner'")
  await denied('select invite_token from business_users')
  await denied('select hourly_cost from business_users')
  await denied('select access_token from calendar_connection')
  await denied("update business_config set subscription_status='active'")
  await denied("update business_config set user_id=auth.uid()")
  assert.equal((await db.query("update business_config set business_name='Hacked' returning business_id")).rows.length,0)
  assert.equal((await db.query('select id,name,role from business_users')).rows.length,1)
  assert.equal((await db.query('select id,gmail_sync_enabled from calendar_connection')).rows.length,1)
  assert.equal((await db.query('select * from business_config')).rows.length,1)
  assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows,[{bucket_id:'business-assets'}])
  assert.equal((await db.query("delete from storage.objects where bucket_id='project-files' returning name")).rows.length,0)
  await assert.rejects(db.query("insert into storage.objects values ('project-files','B/new')"),/row-level security/)
  await denied("select rate_limit_check('victim',1,1000)")
  await user('1')
  assert.equal((await db.query("update business_config set business_name='New name' returning business_id")).rows.length,1)
  assert.equal((await db.query("update calendar_connection set sync_direction='both' returning business_id")).rows.length,1)
  await denied("update business_config set subscription_status='active'")
  await db.exec('reset role; set role service_role')
  assert.equal((await db.query("update business_config set subscription_status='active' where business_id='A' returning business_id")).rows.length,1)
  assert.equal((await db.query('select access_token from calendar_connection')).rows.length,1)
  assert.equal((await db.query('select * from storage.objects')).rows.length,4)
  await db.close()
  console.log('PASS: actual migration blocks escalation, token reads, billing writes, cross-tenant storage and rate-limit poisoning; team reads, manager settings and server operations work.')
})().catch(e => { console.error(e); process.exitCode=1 })
