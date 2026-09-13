import { test, expect } from '@playwright/test'
import { Pool, type PoolClient } from 'pg'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

// Isolated CI service only, following the durable-followup harness. Never production.
const url = process.env.FOLLOWUP_TEST_DATABASE_URL
test.skip(!url, 'Requires FOLLOWUP_TEST_DATABASE_URL: real PostgreSQL two-session proof runs in durable-followup-postgres CI')
test.describe.configure({ mode: 'serial' })
const schema = 'financial_c3_test_' + randomUUID().replace(/-/g, '')
let root: Pool, pool: Pool
const scoped = (sql: string) => sql.replace(/public\./g, schema + '.').replace(/\bSCHEMA public\b/g, 'SCHEMA ' + schema).replace(/search_path = public/g, 'search_path = ' + schema)
test.beforeAll(async () => {
  root = new Pool({ connectionString: url, max: 1 })
  await root.query(`BEGIN; SELECT pg_advisory_xact_lock(824091); DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$; COMMIT; CREATE SCHEMA ${schema}; GRANT USAGE ON SCHEMA ${schema} TO service_role;`)
  pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema},public -c statement_timeout=15000` })
  await pool.query(`CREATE TABLE business_config(business_id text PRIMARY KEY);
    CREATE FUNCTION is_business_member(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;`)
  await pool.query(scoped(readFileSync('sql/v235_financial_events.sql','utf8')))
  await pool.query(scoped(readFileSync('sql/v236_financial_event_consumers.sql','utf8')))
})
test.afterAll(async () => {
  await pool?.end()
  if (root) { await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.end() }
})
async function clients(business: string) {
  await pool.query('INSERT INTO business_config VALUES ($1)',[business])
  const a=await pool.connect(), b=await pool.connect()
  return {a,b,async close(){ await a.query('ROLLBACK; RESET ROLE'); await b.query('ROLLBACK; RESET ROLE'); a.release(); b.release() }}
}
const append=(c:PoolClient,business:string,key:string)=>c.query<{id:string;seq:string}>(`SELECT id,seq FROM append_financial_event(
  $1,'payment_settled',1,clock_timestamp(),NULL,'payment',$2,'fin_payment_ci',NULL,$2,'SEK',100,'{}','system',NULL)`,[business,key])
const claim=(c:PoolClient,business:string)=>c.query<{id:string;seq:string;lease_token:string}>('SELECT id,seq,lease_token FROM claim_financial_events($1,\'ci-consumer\',10,60)',[business])

test('writer commit order: second connection blocks before seq allocation and polling never misses X',async()=>{
  const {a,b,close}=await clients('commit-order')
  let pending: ReturnType<typeof append> | undefined
  try {
    await a.query('BEGIN; SET LOCAL ROLE service_role')
    const x=(await append(a,'commit-order','x')).rows[0]
    const pid=(await b.query<{pid:number}>('SELECT pg_backend_pid() pid')).rows[0].pid
    await b.query('SET ROLE service_role')
    pending=append(b,'commit-order','y'); void pending.catch(()=>{})
    await expect.poll(async()=> (await pool.query<{wait_event:string}>('SELECT wait_event FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event).toBe('advisory')
    for(let i=0;i<3;i++) expect((await pool.query('SELECT id FROM financial_events WHERE business_id=$1',['commit-order'])).rows).toEqual([])
    await a.query('COMMIT')
    const y=(await pending).rows[0]; expect(BigInt(y.seq)).toBeGreaterThan(BigInt(x.seq))
    const observed=(await claim(b,'commit-order')).rows
    expect(observed.map(e=>e.id)).toEqual([x.id,y.id])
  } finally { await a.query('ROLLBACK'); await pending?.catch(()=>{}); await close() }
})

test('two simultaneous first claims have exactly one owner; committed lease survives RPC return',async()=>{
  const {a,b,close}=await clients('claim-race')
  try {
    await append(a,'claim-race','one'); await a.query('SET ROLE service_role'); await b.query('SET ROLE service_role')
    const [first,second]=await Promise.all([claim(a,'claim-race'),claim(b,'claim-race')])
    expect([first.rows.length,second.rows.length].sort()).toEqual([0,1])
    expect((await claim(a,'claim-race')).rows).toEqual([]); expect((await claim(b,'claim-race')).rows).toEqual([])
    const owner=[...first.rows,...second.rows][0]
    await pool.query("UPDATE financial_event_consumers SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE business_id='claim-race'")
    const replacement=(await claim(b,'claim-race')).rows[0]
    expect(replacement.id).toBe(owner.id); expect(replacement.lease_token).not.toBe(owner.lease_token)
    await expect(a.query("SELECT ack_financial_event('claim-race','ci-consumer',$1,$2,60)",[owner.id,owner.lease_token])).rejects.toThrow(/lease_lost/)
    await expect(a.query("SELECT fail_financial_event('claim-race','ci-consumer',$1,$2,'stale',5)",[owner.id,owner.lease_token])).rejects.toThrow(/lease_lost/)
    await b.query("SELECT ack_financial_event('claim-race','ci-consumer',$1,$2,60)",[replacement.id,replacement.lease_token])
  } finally { await close() }
})

test('lease expiry uses wall clock even when worker transaction began before expiration',async()=>{
  const {a,b,close}=await clients('wall-clock')
  try {
    await append(a,'wall-clock','one'); const row=(await claim(a,'wall-clock')).rows[0]
    await a.query('BEGIN; SET LOCAL ROLE service_role')
    // The new expiry is after transaction start but before the guarded ack call.
    await b.query("UPDATE financial_event_consumers SET lease_expires_at=clock_timestamp() WHERE business_id='wall-clock'")
    await expect(a.query("SELECT ack_financial_event('wall-clock','ci-consumer',$1,$2,60)",[row.id,row.lease_token])).rejects.toThrow(/lease_lost/)
  } finally { await close() }
})
