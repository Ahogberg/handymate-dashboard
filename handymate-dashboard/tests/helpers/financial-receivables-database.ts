import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import type { KernelDb } from '../../lib/financial-kernel/events/publish'

export async function receivablesDatabase() {
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE deployer NOSUPERUSER NOBYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE business_config(business_id text PRIMARY KEY,user_id uuid);
    CREATE TABLE business_users(business_id text,user_id uuid,is_active boolean);
    INSERT INTO business_config VALUES ('a',NULL),('b',NULL);
    INSERT INTO business_users VALUES ('a','00000000-0000-0000-0000-000000000001',true);
    CREATE TABLE invoice(invoice_id text PRIMARY KEY,business_id text NOT NULL REFERENCES business_config,
      status text DEFAULT 'sent',paid_amount numeric,paid_at timestamptz,settled_at timestamptz,paid_via text,manual_paid_marked_at timestamptz,manual_paid_by_user_id text,invoice_number text,customer_id text,project_id text,total numeric,customer_pays numeric,
      rot_rut_deduction numeric,rot_rut_type text,invoice_date date,due_date date);
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role,deployer;
    GRANT CREATE ON SCHEMA public TO deployer;
    ALTER TABLE business_config OWNER TO deployer; ALTER TABLE invoice OWNER TO deployer;
    ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;`)
  const helper=readFileSync('sql/testbed_tenant_isolation.sql','utf8').match(/CREATE OR REPLACE FUNCTION public\.is_business_member[\s\S]*?\$function\$;/)
  if (!helper) throw Error('Missing membership function')
  await db.exec(helper[0]); await db.exec('SET ROLE deployer')
  for(const file of ['v235_financial_events.sql','v236_financial_event_consumers.sql','v238_financial_receivables.sql','v239_financial_payment_commands.sql']) await db.exec(readFileSync('sql/'+file,'utf8'))
  await db.exec('RESET ROLE')
  const rpc:KernelDb={async rpc(name,args){
    if(!/^[a-z_]+$/.test(name)||Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k))) throw Error('Unsafe test RPC')
    try {return {data:(await db.query<{value:unknown}>(`SELECT ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args))).rows[0].value,error:null}}
    catch(error){return {data:null,error:{message:(error as Error).message}}}
  }}
  return {db,rpc}
}
export async function seedInvoice(db:PGlite,id='invoice',total='12500.00',business='a',tax:string|null=null,customer:string|null=null) {
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO invoice(invoice_id,business_id,invoice_number,customer_id,total,rot_rut_type,customer_pays,invoice_date,due_date)
    VALUES($1,$2,$1,'customer',$3,$4,$5,'2026-09-01','2026-10-01')`,[id,business,total,tax,customer])
  await db.exec('SET LOCAL ROLE service_role')
}
export async function domain<T=Record<string,unknown>>(db:PGlite,name:string,args:unknown[]):Promise<T> {
  return (await db.query<{value:T}>(`SELECT ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value
}
export type Rec={id:string;component:string;amount_minor:string;outstanding_minor:string;status:string}
export const issue=(db:PGlite,id='invoice',biz='a')=>domain<{inserted:boolean;receivables:Rec[]}>(db,'issue_invoice_receivables',[biz,id,'system',null])
export const settle=(db:PGlite,amount='1250000',key='pay',biz='a',currency='SEK')=>domain<{payment_id:string;inserted:boolean}>(db,'record_payment_settlement',[biz,'manual',null,'inbound',null,currency,amount,null,'manual','2026-09-20T00:00:00Z',null,key,'system',null])
export const allocate=(db:PGlite,payment:string,receivable:string,amount='1250000',key='allocation')=>domain(db,'allocate_payment',['a',payment,receivable,amount,key,'system',null])
export const adjust=(db:PGlite,rec:string,delta:string,reason='rounding',key='adjust',owner:string|null=null)=>domain(db,'adjust_receivable',['a',rec,reason,delta,owner,null,null,key,'system',null])
