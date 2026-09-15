import { test, expect } from '@playwright/test'
import { Pool, type PoolClient } from 'pg'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

// Isolated CI service only, following the durable-followup harness. Never production.
const url = process.env.FOLLOWUP_TEST_DATABASE_URL
test.skip(!url, 'Requires FOLLOWUP_TEST_DATABASE_URL: real PostgreSQL two-session proof runs in durable-followup-postgres CI')
test.describe.configure({ mode: 'serial' })
const schema = 'financial_c5_test_' + randomUUID().replace(/-/g, '')
let root: Pool, pool: Pool
const scoped = (sql: string) => sql.replace(/public\./g, schema + '.').replace(/\bSCHEMA public\b/g, 'SCHEMA ' + schema).replace(/search_path\s*=\s*public/g, 'search_path = ' + schema)
test.beforeAll(async () => {
  root = new Pool({ connectionString: url, max: 1 })
  await root.query(`BEGIN; SELECT pg_advisory_xact_lock(824091); DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$; COMMIT; CREATE SCHEMA ${schema}; GRANT USAGE ON SCHEMA ${schema} TO service_role;`)
  pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema},public -c statement_timeout=15000` })
  await pool.query(`CREATE TABLE business_config(business_id text PRIMARY KEY);
 CREATE TABLE invoice(invoice_id text PRIMARY KEY,business_id text,invoice_number text,customer_id text,project_id text,total numeric,customer_pays numeric,rot_rut_deduction numeric,rot_rut_type text,invoice_date date,due_date date,status text,paid_amount numeric,paid_at timestamptz,settled_at timestamptz,paid_via text,manual_paid_marked_at timestamptz,manual_paid_by_user_id text);
    CREATE FUNCTION is_business_member(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;`)
  await pool.query(scoped(readFileSync('sql/v235_financial_events.sql','utf8')))
  await pool.query(scoped(readFileSync('sql/v236_financial_event_consumers.sql','utf8')))
  await pool.query(scoped(readFileSync('sql/v238_financial_receivables.sql','utf8')))
  await pool.query(scoped(readFileSync('sql/v239_financial_payment_commands.sql','utf8')))
  await pool.query(scoped(readFileSync('sql/v240_financial_bridge_intents.sql','utf8')))
})
test.afterAll(async () => {
  await pool?.end()
  if (root) { await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.end() }
})

async function clients(biz:string){
 await pool.query('INSERT INTO business_config(business_id) VALUES($1)',[biz]);await pool.query("INSERT INTO invoice(invoice_id,business_id,invoice_number,total,customer_pays,rot_rut_type,invoice_date,status) VALUES($1,$1,$1,12500,9500,'rot','2026-09-01','sent')",[biz]);
 const a=await pool.connect(),b=await pool.connect();return {a,b,async close(){await a.query('ROLLBACK;RESET ROLE');await b.query('ROLLBACK;RESET ROLE');a.release();b.release()}}
}
const command=(c:PoolClient,biz:string)=>c.query("SELECT execute_payment_command($1,'manual:same',$1,'manual',NULL,NULL,NULL,'manual','manual','manual',NULL,100,ARRAY['portal_message'],'manual',NULL,'system',NULL) value",[biz])
const claim=(c:PoolClient,biz:string)=>c.query('SELECT claim_effect_intents($1,$1,3,10) value',[biz])
const finish=(c:PoolClient,biz:string,id:string,token:string)=>c.query("SELECT finish_effect_intent($1,$2,$3,'failed','{}',NULL)",[biz,id,token])
test('same command racing in two connections commits one payment and one projection',async()=>{
 const {a,b,close}=await clients('race');let pending:ReturnType<typeof command>|undefined
 try{
 await a.query('BEGIN;SET LOCAL ROLE service_role');const first=(await command(a,'race')).rows[0].value
 await b.query('SET ROLE service_role');const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;pending=command(b,'race');void pending.catch(()=>{})
 await expect.poll(async()=>(await pool.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event).toBe('advisory')
 await a.query('COMMIT');const second=(await pending).rows[0].value;expect(second.command.replayed).toBe(true);expect(second.command.payment_id).toBe(first.command.payment_id)
 expect((await pool.query("SELECT id FROM financial_payments WHERE business_id='race'")).rows).toHaveLength(1)
 expect((await pool.query("SELECT status,paid_amount::text FROM invoice WHERE business_id='race'")).rows[0]).toEqual({status:'customer_paid',paid_amount:'9500.00'})
 }finally{await a.query('ROLLBACK');await pending?.catch(()=>{});await close()}
})
test('delayed finish waits for a newer claim and cannot change its attempt',async()=>{
 const {a,b,close}=await clients('finish');let pending:ReturnType<typeof finish>|undefined
 try{
 await a.query('SET ROLE service_role');await command(a,'finish');const first=(await claim(a,'finish')).rows[0].value.claimed[0];await finish(a,'finish',first.id,first.attempt_token)
 await b.query('BEGIN;SET LOCAL ROLE service_role');const second=(await claim(b,'finish')).rows[0].value.claimed[0]
 const pid=(await a.query('SELECT pg_backend_pid() pid')).rows[0].pid;pending=finish(a,'finish',first.id,first.attempt_token);void pending.catch(()=>{})
 await expect.poll(async()=>(await pool.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event).toBe('advisory')
 await b.query('COMMIT');await expect(pending).rejects.toThrow('financial_effect_attempt_stale')
 const row=(await pool.query('SELECT status,attempts,attempt_token FROM financial_effect_intents WHERE id=$1',[first.id])).rows[0]
 expect(row).toEqual({status:'attempting',attempts:2,attempt_token:second.attempt_token})
 expect((await claim(a,'finish')).rows[0].value.claimed).toEqual([])
 }finally{await b.query('ROLLBACK');await pending?.catch(()=>{});await close()}
})


test('two sweepers serialize claims and each intent is dispatched once',async()=>{
 const {a,b,close}=await clients('sweep');let pending:ReturnType<typeof claim>|undefined
 try {
  await a.query('SET ROLE service_role');await command(a,'sweep')
  await a.query('BEGIN');const first=(await claim(a,'sweep')).rows[0].value
  await b.query('SET ROLE service_role');const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid
  pending=claim(b,'sweep');void pending.catch(()=>{})
  await expect.poll(async()=>(await pool.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event).toBe('advisory')
  await a.query('COMMIT');const second=(await pending).rows[0].value
  expect(first.claimed).toHaveLength(1);expect(second.claimed).toEqual([])
  const dispatched=[...first.claimed,...second.claimed].map((i:any)=>i.id)
  expect(new Set(dispatched).size).toBe(dispatched.length)
 } finally {await a.query('ROLLBACK');await pending?.catch(()=>{});await close()}
})
