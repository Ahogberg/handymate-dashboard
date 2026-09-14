import { test, expect } from '@playwright/test'
import { receivablesDatabase, seedInvoice, domain } from './helpers/financial-receivables-database'
import { c5bRpc } from './helpers/c5b-rpc'
import { c5Modules } from './helpers/c5-module'
let f: Awaited<ReturnType<typeof receivablesDatabase>>
test.beforeAll(async()=>{f=await receivablesDatabase()})
test.afterAll(async()=>{await f?.db.close()})
test.beforeEach(async()=>{await f.db.exec('BEGIN');await seedInvoice(f.db,'i')})
test.afterEach(async()=>{await f.db.exec('ROLLBACK; RESET ROLE')})
const prepare=()=>domain(f.db,'execute_payment_command',['a','manual:payment','i','manual',null,null,null,'manual','manual','manual',null,100,['portal_message'],'manual',null,'system',null])
function harness(fail=false) {
  const sends:string[]=[],reports:string[]=[],calls:string[]=[]
  const db=c5bRpc(f), rpc={async rpc(name:string,args:Record<string,unknown>){calls.push(name);return db.rpc(name,args)}}
  const sb={from(table:string){
    const q={select:()=>q,eq:()=>q,order:async()=>({data:[{business_id:'a'}],error:null})};return q
  }}
  const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/financial-kernel/kernel-db':{kernelDb:()=>rpc},
    '@/lib/observability/driftlarm':{rapporteraTystFel:async(_s:unknown,_b:string,key:string)=>{reports.push(key)}},
    '../effects/runners':{runPaymentEffect:async(_b:string,_i:string,claim:any)=>{sends.push(claim.id);return {effect:claim.effect,status:fail?'failed':'succeeded',message:fail?'provider failed':undefined}}}})
  return {sends,reports,calls,load,sweep:()=>load('lib/financial-kernel/effects/sweep.ts').sweepInvoiceIntents('a','i',{db:rpc,sb})}
}
test('shared sweep dispatches each claimed intent once and uses stored context',async()=>{
  await prepare();const h=harness();expect((await h.sweep()).effects).toHaveLength(1);expect((await h.sweep()).effects).toEqual([]);expect(h.sends).toHaveLength(1)
})
test('unknown and exhausted reports occur only on their transition and never auto-resend',async()=>{
  await prepare();await domain(f.db,'claim_effect_intents',['a','i',3,10])
  await f.db.exec("RESET ROLE;UPDATE financial_effect_intents SET claimed_at=clock_timestamp()-interval '11 minutes';SET LOCAL ROLE service_role")
  const h=harness(true);await h.sweep();await h.sweep()
  expect(h.sends).toEqual([]);expect(h.reports).toEqual(['financial-kernel:effect-unknown'])
  const intent=(await f.db.query<any>('SELECT id FROM financial_effect_intents')).rows[0]
  await domain(f.db,'resolve_effect_intent',['a',intent.id,'retry','admin','Confirmed no delivery',3])
  for(let n=0;n<4;n++) await h.sweep()
  expect(h.sends).toHaveLength(3);expect(h.reports).toEqual(['financial-kernel:effect-unknown','financial-kernel:effect-exhausted'])
})
test('cron rejects bad secrets before any query or RPC and valid secret runs consumer plus sweep',async()=>{
  await prepare();const h=harness(),route=h.load('app/api/cron/financial-kernel/route.ts')
  const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='test-secret'
  try {
    for(const secret of ['', 'wrong'])expect((await route.GET(new Request('https://test/cron',{headers:{authorization:'Bearer '+secret}}))).status).toBe(401)
    expect(h.calls).toEqual([])
    const response=await route.GET(new Request('https://test/cron',{headers:{authorization:'Bearer test-secret'}}))
    expect(response.status).toBe(200);const result=await response.json()
    expect(result.ok).toBe(true);expect(result.swept).toBe(1);expect(result.businesses).toBe(1);expect(h.sends).toHaveLength(1)
  } finally {if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous}
})
test('cron never touches flag-off businesses and stops before starting work past budget',async()=>{
  const calls:any[]=[],rpc={rpc:async(...args:any[])=>{calls.push(args);throw Error('unexpected RPC')}}
  let time=0
  const sb={from(){const q={select:()=>q,eq:(key:string,value:unknown)=>{expect(key).toBe('financial_kernel_enabled');expect(value).toBe(true);return q},order:async()=>{time=240001;return {data:[{business_id:'enabled'}],error:null}}};return q}}
  const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/financial-kernel/kernel-db':{kernelDb:()=>rpc},
    '@/lib/cron/verify-secret':{verifyCronSecret:()=>true},'@/lib/observability/driftlarm':{},'../effects/runners':{}})
  const old=Date.now;Date.now=()=>time
  try {const result=await (await load('app/api/cron/financial-kernel/route.ts').GET(new Request('https://test/cron'))).json();expect(result.skipped).toBe(1);expect(result.budgetExhausted).toBe(true);expect(calls).toEqual([])}finally{Date.now=old}
})
