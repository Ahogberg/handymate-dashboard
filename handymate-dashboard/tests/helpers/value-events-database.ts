import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
export async function valueDatabase(migrate = true) {
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE deployer NOSUPERUSER NOBYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE business_config(business_id text PRIMARY KEY,user_id uuid);
    CREATE TABLE business_users(business_id text,user_id uuid,is_active boolean);
    INSERT INTO business_config VALUES ('a',NULL),('b',NULL);
    INSERT INTO business_users VALUES ('a','00000000-0000-0000-0000-000000000001',true);
    CREATE TABLE invoice(invoice_id text PRIMARY KEY,business_id text,status text,total numeric,paid_amount numeric,paid_at timestamptz,due_date date,sent_at timestamptz,project_id text);
    CREATE TABLE quotes(quote_id text PRIMARY KEY,business_id text,lead_id text,sent_at timestamptz);
    CREATE TABLE project(project_id text PRIMARY KEY,business_id text,completed_at timestamptz);
    CREATE TABLE leads(lead_id text PRIMARY KEY,business_id text,created_at timestamptz);
    CREATE TABLE project_change(change_id text PRIMARY KEY,business_id text,invoice_id text,invoiced_at timestamptz);`)
  await db.exec(readFileSync('sql/v2_pending_approvals.sql','utf8'))
  await db.exec(readFileSync('sql/v3_automation_logs.sql','utf8'))
  const helper=readFileSync('sql/testbed_tenant_isolation.sql','utf8').match(/CREATE OR REPLACE FUNCTION public\.is_business_member[\s\S]*?\$function\$;/)!
  await db.exec(helper[0])
  await db.exec(`GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role,deployer;
    GRANT CREATE ON SCHEMA public TO deployer;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO deployer;
    ALTER TABLE business_config OWNER TO deployer;
    ALTER TABLE pending_approvals OWNER TO deployer;
    ALTER TABLE v3_automation_logs OWNER TO deployer;
    ALTER TABLE quotes OWNER TO deployer;
    ALTER TABLE invoice OWNER TO deployer;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    SET ROLE deployer;`)
  if (migrate) await db.exec(readFileSync('sql/v241_value_events.sql','utf8'))
  await db.exec('RESET ROLE')
  return db
}
export async function card(db: PGlite, id='card1', type='missad_intakt', status='pending', payload: unknown={ amount_kr: 100 }, business='a') {
  await db.query(`INSERT INTO pending_approvals(id,business_id,approval_type,title,status,created_at,resolved_at,payload)
    VALUES($1,$2,$3,'Ett kort',$4,'2026-08-02',CASE WHEN $4='pending' THEN NULL ELSE '2026-08-03'::timestamptz END,$5)`,[id,business,type,status,JSON.stringify(payload)])
}
export async function events(db: PGlite) { return (await db.query<any>('SELECT *,amount_minor::text,seq::text FROM value_events ORDER BY value_events.seq')).rows }
