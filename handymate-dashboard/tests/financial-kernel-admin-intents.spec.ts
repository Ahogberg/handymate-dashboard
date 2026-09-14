import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'
import { receivablesDatabase, seedInvoice, domain } from './helpers/financial-receivables-database'
import { c5bRpc } from './helpers/c5b-rpc'
import { c5Modules } from './helpers/c5-module'
let f: Awaited<ReturnType<typeof receivablesDatabase>>
test.beforeAll(async()=>{f=await receivablesDatabase()})
test.afterAll(async()=>{await f?.db.close()})
test.beforeEach(async()=>{await f.db.exec('BEGIN');await seedInvoice(f.db,'i')})
test.afterEach(async()=>{await f.db.exec('ROLLBACK; RESET ROLE')})
async function unknown(){
  await domain(f.db,'execute_payment_command',['a','manual:payment','i','manual',null,null,null,'manual','manual','manual',null,100,['portal_message'],'manual',null,'system',null])
  await domain(f.db,'claim_effect_intents',['a','i',3,10])
  await f.db.exec("RESET ROLE;UPDATE financial_effect_intents SET claimed_at=clock_timestamp()-interval '11 minutes';SET LOCAL ROLE service_role")
  await domain(f.db,'claim_effect_intents',['a','i',3,10])
  return (await f.db.query<any>('SELECT * FROM financial_effect_intents')).rows[0]
}
function harness(admin=true){
  const rpc=c5bRpc(f),calls:string[]=[]
  const auth={getUser:async()=>({data:{user:{id:'verified-admin',app_metadata:{is_superadmin:admin}}},error:null})}
  const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>({auth})},'next/headers':{cookies:()=>({})},
    '@supabase/auth-helpers-nextjs':{createRouteHandlerClient:()=>({auth})},'./admin-email':{isAdminEmail:()=>false},
    '@/lib/financial-kernel/kernel-db':{kernelDb:()=>({rpc:async(name:string,args:any)=>{calls.push(name);return rpc.rpc(name,args)}})}})
  return {load,calls}
}
const request=(body:unknown)=>new NextRequest('https://test/admin',{method:'POST',body:JSON.stringify(body)})
test('all four endpoints deny non-superadmins before touching kernel',async()=>{
  const h=harness(false)
  for(const part of ['intents','consumers'])expect((await h.load(`app/api/admin/financial-kernel/${part}/route.ts`).GET(new NextRequest('https://test/?business_id=a'))).status).toBe(403)
  expect((await h.load('app/api/admin/financial-kernel/intents/[id]/resolve/route.ts').POST(request({}),{params:{id:'x'}})).status).toBe(403)
  expect((await h.load('app/api/admin/financial-kernel/consumers/resume/route.ts').POST(request({}))).status).toBe(403)
  expect(h.calls).toEqual([])
})
for(const resolution of ['delivered','abandon','retry'])test(`human ${resolution} uses verified actor, logs reason and isolates business`,async()=>{
  const intent=await unknown(),h=harness(),route=h.load('app/api/admin/financial-kernel/intents/[id]/resolve/route.ts')
  const post=(body:any)=>route.POST(request(body),{params:{id:intent.id}})
  expect((await post({business_id:'a',resolution,reason:' '})).status).toBe(400)
  expect((await post({business_id:'b',resolution,reason:'checked'})).status).toBe(404)
  expect((await post({business_id:'a',resolution,reason:'Provider checked',actor_id:'attacker'})).status).toBe(200)
  const row=(await f.db.query<any>('SELECT * FROM financial_effect_intents')).rows[0]
  expect(row.status).toBe(resolution==='delivered'?'sent':resolution==='abandon'?'skipped':'pending')
  expect(row.resolution[0]).toMatchObject({by:'verified-admin',reason:'Provider checked',from:'unknown'})
  if(resolution==='retry'){expect(row.attempt_token).toBeNull();expect(row.attempts).toBe(0)}
  expect((await post({business_id:'a',resolution,reason:'repeat'})).status).toBe(409)
})
test('resolution validates null operation and attempt bounds at the database boundary',async()=>{
  const intent=await unknown(),rpc=c5bRpc(f)
  for(const [resolution,max] of [[null,3],['retry',0],['retry',11]]){
    const result=await rpc.rpc('resolve_effect_intent',{p_business_id:'a',p_intent_id:intent.id,p_resolution:resolution,p_actor_id:'admin',p_reason:'checked',p_max_attempts:max})
    expect(result.error).not.toBeNull()
  }
  expect((await f.db.query<any>('SELECT status FROM financial_effect_intents')).rows[0].status).toBe('unknown')
})
test('new producer/list/resolve functions are inaccessible to tenant clients',async()=>{
  const rows=(await f.db.query<any>(`SELECT proname,has_function_privilege('anon',oid,'execute') a,has_function_privilege('authenticated',oid,'execute') u,has_function_privilege('service_role',oid,'execute') s FROM pg_proc WHERE proname IN ('ensure_effect_intents','list_owed_effect_intents','list_unresolved_effect_intents','resolve_effect_intent')`)).rows
  expect(rows).toHaveLength(4);for(const row of rows){expect(row.a).toBe(false);expect(row.u).toBe(false);expect(row.s).toBe(true)}
})
