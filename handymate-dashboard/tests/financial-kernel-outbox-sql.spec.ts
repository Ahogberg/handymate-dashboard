import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { appendFinancialEvent, correlationId, idempotencyKey, type KernelDb } from '../lib/financial-kernel/events/publish'
import { consumeOnce } from '../lib/financial-kernel/events/consume'
import { money } from '../lib/financial-kernel/money'

let db: PGlite
let rpc: KernelDb
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE deployer NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE business_config(business_id text PRIMARY KEY);
    INSERT INTO business_config VALUES ('a'),('b');
    CREATE FUNCTION is_business_member(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT USAGE,CREATE ON SCHEMA public TO deployer; GRANT REFERENCES ON business_config TO deployer;
    ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
    SET ROLE deployer;`)
  await db.exec(readFileSync('sql/v235_financial_events.sql','utf8'))
  await db.exec(readFileSync('sql/v236_financial_event_consumers.sql','utf8'))
  await db.exec('RESET ROLE')
  rpc = { async rpc(name,args) {
    if (!/^[a-z_]+$/.test(name) || Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k))) throw Error('Unsafe test RPC')
    const entries = Object.entries(args)
    try {
      const rows = await db.query<{wire: unknown}>(`SELECT to_jsonb(r) wire FROM ${name}(${entries.map(([k],i)=>`${k} => $${i+1}`).join(',')}) r`,entries.map(([,v])=>typeof v==='object' && v!==null ? JSON.stringify(v):v))
      return {data: rows.rows.map(r=>r.wire),error:null}
    } catch(error) { return {data:null,error:{message:(error as Error).message}} }
  } }
})
test.afterAll(async()=>{await db?.close()})
test.beforeEach(async()=>{await db.exec('BEGIN; SET LOCAL ROLE service_role')})
test.afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE')})
async function call<T=Record<string,unknown>>(name:string,args:unknown[]) {
  return (await db.query<T>(`SELECT * FROM ${name}(${args.map((_,i)=>`$${i+1}`).join(',')})`,args)).rows
}
async function append(id='one',businessId='a') {
  return appendFinancialEvent(rpc,{businessId,eventType:'payment_allocation_reversed',occurredAt:'2026-09-14T00:00:00Z',
    source:{type:'payment',id},correlationId:correlationId('payment',id),idempotencyKey:idempotencyKey('payment','test',id),
    amount:money(BigInt('9007199254740993'),'SEK'),actor:{type:'system'},payload:{allocation_id:id,reason:'test'}})
}
const claim=(consumer='test-consumer',business='a')=>call<{id:string;seq:string;lease_token:string}>('claim_financial_events',[business,consumer,3,60])
const ack=(id:string,token:string,consumer='test-consumer')=>call('ack_financial_event',['a',consumer,id,token,60])
const start=(id:string,token:string,consumer='test-consumer')=>call('begin_financial_event_attempt',['a',consumer,id,token])
async function rejects(run:()=>Promise<unknown>,pattern:RegExp) {
  await db.exec('SAVEPOINT rejected_call')
  try {await expect(run()).rejects.toThrow(pattern)} finally {await db.exec('ROLLBACK TO SAVEPOINT rejected_call; RELEASE SAVEPOINT rejected_call')}
}
async function expire(consumer='test-consumer') {
  await db.exec('RESET ROLE')
  await db.query("UPDATE financial_event_consumers SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE consumer=$1",[consumer])
  await db.exec('SET LOCAL ROLE service_role')
}
test('lease survives calls; takeover fences both old ack and failure',async()=>{
  await append(); const a=await claim(); expect(await claim()).toEqual([])
  await start(a[0].id,a[0].lease_token); await expire(); const b=await claim()
  expect(b[0].id).toBe(a[0].id); expect(b[0].lease_token).not.toBe(a[0].lease_token)
  await rejects(()=>ack(a[0].id,a[0].lease_token),/lease_lost/)
  await rejects(()=>call('fail_financial_event',['a','test-consumer',a[0].id,a[0].lease_token,'error',5]),/lease_lost/)
})
test('ordered acknowledgement cannot skip an event; duplicates do not inflate attempts',async()=>{
  await append(); await append('two'); const rows=await claim(); const token=rows[0].lease_token
  await rejects(()=>ack(rows[1].id,token),/ack_out_of_order/)
  await start(rows[0].id,token); await ack(rows[0].id,token); await ack(rows[0].id,token)
  const ledger=await db.query<{attempts:number}>('SELECT attempts FROM financial_event_deliveries')
  expect(ledger.rows[0].attempts).toBe(1)
  await start(rows[1].id,token); await ack(rows[1].id,token)
})
test('crash after handle before ack preserves evidence and redelivers after expiry',async()=>{
  await append(); const first=await claim(); await start(first[0].id,first[0].lease_token)
  let handled=1; await expire()
  const result=await consumeOnce(rpc,'a',{consumer:'test-consumer',async handle(){handled++}})
  expect(handled).toBe(2); expect(result.delivered).toBe(1)
  const ledger=await db.query<{attempts:number;delivered_at:unknown}>('SELECT attempts,delivered_at FROM financial_event_deliveries')
  expect(ledger.rows[0].attempts).toBe(2); expect(ledger.rows[0].delivered_at).not.toBeNull()
})
test('failure stops batch, halts only this tenant/consumer and resumes the first event',async()=>{
  const first=await append(); await append('two'); await append('other','b'); const seen:string[]=[]
  const handler={consumer:'test-consumer',async handle(e:{eventId:string}){seen.push(e.eventId);throw Error('expected failure')}}
  expect((await consumeOnce(rpc,'a',handler,{maxAttempts:2})).halted).toBe(false)
  expect((await consumeOnce(rpc,'a',handler,{maxAttempts:2})).halted).toBe(true)
  expect((await consumeOnce(rpc,'a',handler)).halted).toBe(true)
  expect(seen).toEqual([first.event.eventId,first.event.eventId]); expect((await claim('another-consumer')).length).toBe(2)
  expect((await claim('test-consumer','b')).length).toBe(1)
  await rejects(()=>call('resume_financial_consumer',['a','test-consumer','','retry']),/requires_actor/)
  await rejects(()=>call('resume_financial_consumer',['a','test-consumer','owner','  ']),/requires_actor/)
  await call('resume_financial_consumer',['a','test-consumer','owner','fixed'])
  expect((await claim())[0].id).toBe(first.event.eventId)
})
test('publish is lossless and idempotent, and key helpers reject ambiguous/empty segments',async()=>{
  const first=await append(); const second=await append()
  expect(first.event.amount?.amountMinor).toBe(BigInt('9007199254740993'))
  expect(second.inserted).toBe(false); expect(second.event.eventId).toBe(first.event.eventId)
  expect(correlationId('invoice','123')).toBe('fin_invoice_123')
  expect(idempotencyKey('allocation','pay','rec','12500')).toBe('allocation:pay:rec:12500')
  for(const bad of ['', '  ', 'a:b']) expect(()=>idempotencyKey('allocation',bad,'id')).toThrow()
  expect(()=>correlationId('payment',' ')).toThrow()
})
test('backlog and active lease reflect ack and expiry; release cannot clear a new token',async()=>{
  await append(); const [row]=await claim(); await expire(); const [next]=await claim()
  await call('release_financial_consumer_lease',['a','test-consumer',row.lease_token])
  const status=await call<{backlog:string;lease_active:boolean}>('get_financial_consumer_status',['a','test-consumer'])
  expect(status[0]).toMatchObject({backlog:'1',lease_active:true})
  await expire(); expect((await call<{lease_active:boolean}>('get_financial_consumer_status',['a','test-consumer']))[0].lease_active).toBe(false)
  expect(next.lease_token).not.toBe(row.lease_token)
})
test('timeout stops later handlers; invalid options are rejected before claiming',async()=>{
  await append(); await append('two'); let count=0
  const handler={consumer:'test-consumer',async handle(){count++;await new Promise(r=>setTimeout(r,25))}}
  expect((await consumeOnce(rpc,'a',handler,{handlerTimeoutMs:5})).failed).toBe(1)
  expect(count).toBe(1)
  await expect(consumeOnce(rpc,'a',handler,{leaseSeconds:5,handlerTimeoutMs:5000})).rejects.toThrow()
})
test('lost lease stops the loop without failure or release mutations',async()=>{
  await append(); await append('two'); const calls:string[]=[]
  const tracked:KernelDb={rpc(name,args){calls.push(name);return rpc.rpc(name,args)}}
  const result=await consumeOnce(tracked,'a',{consumer:'test-consumer',async handle(){await expire();await claim()}})
  expect(result).toMatchObject({leaseLost:true,delivered:0,failed:0})
  expect(calls).not.toContain('fail_financial_event'); expect(calls).not.toContain('release_financial_consumer_lease')
})
test('ambiguous ack transport failure is not recorded as a handler failure',async()=>{
  await append(); const calls:string[]=[]
  const uncertain:KernelDb={async rpc(name,args){
    calls.push(name); const reply=await rpc.rpc(name,args)
    return name==='ack_financial_event' ? {data:null,error:{message:'response lost after commit'}} : reply
  }}
  await expect(consumeOnce(uncertain,'a',{consumer:'test-consumer',async handle(){}})).rejects.toThrow(/response lost/)
  expect(calls).not.toContain('fail_financial_event')
  expect((await claim()).length).toBe(0)
})
test('SQL rejects invalid renewal/failure options, foreign events and future failure attempts',async()=>{
  await append(); const foreign=await append('foreign','b'); await append('two'); const rows=await claim();const token=rows[0].lease_token
  await rejects(()=>ack(foreign.event.eventId,token),/unknown_event/)
  await rejects(()=>call('fail_financial_event',['a','test-consumer',rows[1].id,token,'x',5]),/out_of_order/)
  await rejects(()=>call('ack_financial_event',['a','test-consumer',rows[0].id,token,0]),/bad_lease/)
  await rejects(()=>call('fail_financial_event',['a','test-consumer',rows[0].id,token,'x',null]),/bad_attempt_limit/)
})
test('publish and consumer source never coerce amount_minor or seq to Number',()=>{
  for(const file of ['publish','consume']) {
    const source=readFileSync(`lib/financial-kernel/events/${file}.ts`,'utf8')
    expect(source).not.toMatch(/Number\s*\([^)]*(?:amount_minor|\.seq\b)/)
  }
})
test('client privileges and broad default grants cannot expose kernel state or bypass RPCs',async()=>{
  await append(); const [row]=await claim()
  await rejects(()=>call('assert_financial_consumer_lease',['a','test-consumer',row.lease_token]),/permission denied/)
  for(const table of ['financial_event_consumers','financial_event_deliveries']) {
    await rejects(()=>db.exec(`INSERT INTO ${table} DEFAULT VALUES`),/permission denied/)
    await rejects(()=>db.exec(`UPDATE ${table} SET business_id=business_id`),/permission denied/)
  }
  for(const role of ['anon','authenticated']) {
    await db.exec(`SET LOCAL ROLE ${role}`)
    for(const table of ['financial_event_consumers','financial_event_deliveries','financial_consumer_status']) await rejects(()=>db.exec(`SELECT * FROM ${table}`),/permission denied/)
    for(const [name,args] of [
      ['claim_financial_events',['a','test-consumer',3,60]],['ack_financial_event',['a','test-consumer',row.id,row.lease_token,60]],
      ['fail_financial_event',['a','test-consumer',row.id,row.lease_token,'x',5]],['begin_financial_event_attempt',['a','test-consumer',row.id,row.lease_token]],
      ['release_financial_consumer_lease',['a','test-consumer',row.lease_token]],['resume_financial_consumer',['a','test-consumer','owner','retry']],
      ['get_financial_consumer_status',['a','test-consumer']],['assert_financial_consumer_lease',['a','test-consumer',row.lease_token]],
    ] as [string,unknown[]][]) await rejects(()=>call(name,args),/permission denied/)
  }
})
