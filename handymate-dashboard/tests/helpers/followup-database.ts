import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import {Pool} from 'pg'
import {randomUUID} from 'crypto'
export interface FollowupDatabase {exec(sql:string):Promise<unknown>;query<T=any>(sql:string,params?:any[]):Promise<{rows:T[]}>;close():Promise<void>}
export async function followupDatabase(){
 let db:FollowupDatabase
 const url=process.env.FOLLOWUP_TEST_DATABASE_URL
 if(url){
  // Supplied only for an isolated CI PostgreSQL service. No production credentials.
  const schema='followup_test_'+randomUUID().replace(/-/g,'')
  const root=new Pool({connectionString:url,max:1})
  await root.query(`BEGIN;SELECT pg_advisory_xact_lock(824091);DO $$ BEGIN
   IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
  END $$;COMMIT;CREATE SCHEMA ${schema};GRANT USAGE ON SCHEMA ${schema} TO service_role;`)
  const pool=new Pool({connectionString:url,max:4,options:`-c search_path=${schema},public`})
  const scoped=(sql:string)=>sql.replace(/public\./g,schema+'.').replace(/\bSCHEMA public\b/g,'SCHEMA '+schema).replace(/CREATE ROLE (anon|authenticated|service_role);/g,'')
  db={exec:sql=>pool.query(scoped(sql)),query:async<T>(sql:string,params?:any[])=>({rows:(await pool.query(scoped(sql),params)).rows as T[]}),close:async()=>{await pool.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end()}}
 }else db=new PGlite() as FollowupDatabase
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE business_config(business_id text primary key,agents_globally_paused boolean default false,subscription_status text default 'active',trial_ends_at timestamptz,onboarding_completed_at timestamptz);
 CREATE TABLE business_users(id text primary key,business_id text,is_active boolean,role text);
 CREATE TABLE mission(id text primary key,business_id text,status text,deadline date);
 CREATE TABLE customer(customer_id text primary key,business_id text,name text,phone_number text,email text,sms_opt_out boolean default false);
 CREATE TABLE quotes(quote_id text primary key,business_id text,customer_id text,title text,description text,items jsonb,total numeric,customer_pays numeric,terms text,valid_until date,sent_at timestamptz,status text,accepted_at timestamptz,declined_at timestamptz,parent_quote_id text,version_number integer default 1);
 CREATE TABLE quote_items(id text primary key,business_id text,quote_id text,description text,quantity numeric,unit_price numeric,created_at timestamptz default now());
 CREATE TABLE pending_approvals(id text primary key,business_id text,approval_type text,title text,description text,payload jsonb,status text,risk_level text,expires_at timestamptz,resolved_at timestamptz,resolved_by text);
 CREATE TABLE sms_log(business_id text,customer_id text,created_at timestamptz default now(),direction text,phone_from text,related_id text,status text);
 CREATE TABLE email_conversations(business_id text,customer_id text,created_at timestamptz default now(),direction text,from_email text);
 CREATE TABLE customer_message(business_id text,customer_id text,created_at timestamptz default now(),direction text);
 CREATE TABLE call_recording(business_id text,customer_id text,created_at timestamptz default now(),direction text,from_number text);
 CREATE TABLE call(business_id text,customer_id text,started_at timestamptz default now(),direction text,phone_number text);
 CREATE TABLE communication_log(business_id text,customer_id text,created_at timestamptz default now(),direction text,status text);
 `)
 await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;')
 await db.exec(readFileSync('sql/v2_durable_quote_followup.sql','utf8'))
 return db
}
export async function seedFollowup(db:FollowupDatabase){
 await db.exec(`TRUNCATE agent_followup_event,agent_followup,pending_approvals,quote_items,quotes,customer,business_users,mission,business_config,call_recording,call,sms_log,email_conversations,customer_message,communication_log CASCADE;
 INSERT INTO business_config(business_id) VALUES('a'),('b');
 INSERT INTO business_users VALUES('owner','a',true,'owner'),('employee','a',true,'employee'),('other','b',true,'owner');
 INSERT INTO customer(customer_id,business_id,name,phone_number,email) VALUES('c','a','Testkund','+46700000000','test@example.invalid');
 INSERT INTO quotes(quote_id,business_id,customer_id,title,total,valid_until,sent_at,status) VALUES('q','a','c','Dörrar',1200,current_date+30,now()-interval '2 days','sent');
 INSERT INTO quote_items(id,business_id,quote_id,description,quantity,unit_price) VALUES('i','a','q','Dörr',1,1200);
 INSERT INTO mission VALUES('m','a','active',current_date+20);
 UPDATE agent_followup_runner SET enabled=true,last_tick_at=now();`)
}
export async function scheduleTest(db:FollowupDatabase,key='request-0001'){
 const r=await db.query<any>(`SELECT (schedule_agent_followup('a','owner','q',date_trunc('hour',now())+interval '2 hours',$1,'m')).*`,[key]);return r.rows[0]
}
export async function makeDue(db:FollowupDatabase){await db.exec(`UPDATE agent_followup SET due_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute';`)}
