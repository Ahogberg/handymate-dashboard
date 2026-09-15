import { test, expect } from '@playwright/test'
import { shadowDatabase } from './helpers/financial-shadow-database'
import { seedInvoice, domain } from './helpers/financial-receivables-database'
import { c5Modules } from './helpers/c5-module'
let f: Awaited<ReturnType<typeof shadowDatabase>>
test.beforeAll(async()=>{f=await shadowDatabase()})
test.afterAll(async()=>{await f?.db.close()})
test.beforeEach(async()=>{await f.db.exec('BEGIN');await seedInvoice(f.db,'i')})
test.afterEach(async()=>{await f.db.exec('ROLLBACK; RESET ROLE')})
const phase=(p='S1')=>domain(f.db,'set_financial_kernel_phase',['a',p,'admin','Named test pilot'])
const pay=(effects:string[]=[])=>domain(f.db,'execute_payment_command',['a','manual:payment','i','manual',null,null,null,'manual','manual','manual',null,100,effects,'manual',null,'system',null])
function load(){return c5Modules({'@/lib/supabase':{getServerSupabase:()=>({})},'@/lib/financial-kernel/kernel-db':{kernelDb:()=>f.rpc},'@/lib/fortnox':{getFortnoxInvoice:()=>{throw Error('live forbidden')}},'@/lib/observability/driftlarm':{}})}
test('full stubbed Fortnox run persists exact evidence, confirms next-day drift once and supersedes by match',async()=>{
 await phase();await pay();await f.db.exec("RESET ROLE;UPDATE invoice SET fortnox_document_number='42',sent_at=clock_timestamp() WHERE invoice_id='i';SET LOCAL ROLE service_role")
 const run=load()('lib/financial-kernel/shadow/run.ts').runShadowForBusiness
 let reports=0,total=12500.01
 const opts={db:f.rpc,reader:async()=>({Total:total,TotalToPay:total,Balance:0,FullyPaid:true}),report:async()=>{reports++}}
 const first=await run('a',opts);expect(first.phase).toBe('S1');expect(first.counts).toMatchObject({compared:1,divergent:1,unsupported:3,reported:0})
 await f.db.exec("RESET ROLE;UPDATE financial_shadow_divergences SET last_seen_at=clock_timestamp()-interval '1 day';SET LOCAL ROLE service_role")
 const second=await run('a',opts);expect(second.counts.reported).toBe(1);expect(reports).toBe(1)
 await run('a',opts);expect(reports).toBe(1)
 total=12500;const fourth=await run('a',opts);expect(fourth.counts).toMatchObject({match:1,closed:1})
 const rs=(await f.db.query<any>('SELECT * FROM financial_shadow_resolutions')).rows;expect(rs).toHaveLength(1);expect(rs[0].resolution_type).toBe('superseded_by_match')
 expect((await f.db.query('SELECT * FROM financial_shadow_snapshots')).rows).toHaveLength(4)
 expect((await f.db.query("SELECT * FROM financial_shadow_comparisons WHERE result='unsupported'")).rows).toHaveLength(12)
 await f.db.exec('RESET ROLE')
 expect((await f.db.query<any>("SELECT status,paid_amount::text FROM invoice WHERE invoice_id='i'")).rows[0]).toMatchObject({status:'paid',paid_amount:'12500.00'})
})
test('kill switch keeps existing obligations dispatchable without consuming new events',async()=>{
 await phase();await pay(['portal_message']);expect(await phase('off')).toMatchObject({phase:'off',owed_intents:1})
 const sends:string[]=[],calls:string[]=[]
 const rpc={rpc:async(name:string,args:any)=>{calls.push(name);return f.rpc.rpc(name,args)}}
 const modules=c5Modules({'@/lib/supabase':{getServerSupabase:()=>({})},'@/lib/financial-kernel/kernel-db':{kernelDb:()=>rpc},'@/lib/cron/verify-secret':{verifyCronSecret:()=>true},'@/lib/observability/driftlarm':{rapporteraTystFel:async()=>{}},'../effects/runners':{runPaymentEffect:async(_b:string,_i:string,claim:any)=>{sends.push(claim.id);return {effect:claim.effect,status:'succeeded'}}}})
 const result=await (await modules('app/api/cron/financial-kernel/route.ts').GET(new Request('https://test/'))).json()
 expect(result).toMatchObject({consumed:0,swept:1});expect(sends).toHaveLength(1);expect(calls).not.toContain('claim_financial_events')
 expect((await f.db.query<any>('SELECT * FROM list_financial_kernel_work()')).rows).toEqual([])
})
test('one lost finish acknowledgement does not strand the other claimed obligations',async()=>{
 await phase();await pay(['portal_message','pipeline'])
 let finishes=0;const sends:string[]=[],reports:string[]=[]
 const rpc={rpc:async(name:string,args:any)=>{if(name==='finish_effect_intent'&&finishes++===0)throw Error('ack lost');return f.rpc.rpc(name,args)}}
 const modules=c5Modules({'@/lib/supabase':{getServerSupabase:()=>({})},'@/lib/observability/driftlarm':{rapporteraTystFel:async(_s:unknown,_b:string,key:string)=>{reports.push(key)}},'../effects/runners':{runPaymentEffect:async(_b:string,_i:string,claim:any)=>{sends.push(claim.id);return {effect:claim.effect,status:'succeeded'}}}})
 const sweep=modules('lib/financial-kernel/effects/sweep.ts').sweepInvoiceIntents
 await sweep('a','i',{db:rpc,sb:{}});expect(sends).toHaveLength(2);expect(reports).toContain('financial-kernel:effect-finish-failed')
 const rows=(await f.db.query<any>('SELECT status FROM financial_effect_intents ORDER BY status')).rows;expect(rows).toEqual([{status:'attempting'},{status:'sent'}])
 await sweep('a','i',{db:rpc,sb:{}});expect(sends).toHaveLength(2)
})
