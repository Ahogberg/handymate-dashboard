const fs = require('node:fs'), assert = require('node:assert/strict')
async function load(file, deps) {
  const source = fs.readFileSync(file, 'utf8')
  let ts
  try { ts = require('typescript') } catch (e) { if(e.code !== 'MODULE_NOT_FOUND') throw e }
  if (ts) {
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', code)(name => { assert(name in deps, name); return deps[name] }, mod, mod.exports)
    return mod.exports
  }
  // Local Node 24 can execute the same source without installing packages.
  // CI uses the project's TypeScript above; local invocation needs --experimental-vm-modules.
  const vm = require('node:vm'), { stripTypeScriptTypes } = require('node:module')
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(source))
  await mod.link(name => {
    assert(name in deps, name)
    return new vm.SyntheticModule(Object.keys(deps[name]), function () { for(const [k,v] of Object.entries(deps[name])) this.setExport(k,v) })
  })
  await mod.evaluate(); return mod.namespace
}
function database(state) {
  return { from(table) {
    let operation = 'read', fields = '', value
    const q = {
      select(s) { fields = s; return q }, eq(k,v) { if(k==='business_id')assert.equal(v,'biz_test'); return q },
      single: async () => result(), maybeSingle: async () => result(),
      update(v) { operation='write'; value=v; return q },
      then(resolve,reject) { return Promise.resolve(result()).then(resolve,reject) },
    }
    function result() {
      if(operation==='write') { state.events.push('write'); state.writes.push(value); if(state.writeError)return {data:null,error:{message:'write failed'}}; Object.assign(state.company,value); return {data:state.company,error:null} }
      if(state.readError || (state.pricingError && fields==='pricing_settings'))return {data:null,error:{message:'read failed'}}
      if(table==='calendar_connection')return {data:null,error:null}
      return {data:state.company,error:null}
    }
    return q
  } }
}
async function route(options={}) {
  const state={company:{branch:'electrician',secondary_branches:['construction'],default_hourly_rate:950,onboarding_data:{saved:'keep'},onboarding_completed_at:null},writes:[],events:[],seedFailed:0,...options}
  const db=database(state)
  const api=await load('app/api/onboarding/route.ts',{
    'next/server':{NextRequest:Request,NextResponse:Response},
    '@/lib/supabase':{getServerSupabase:()=>db},
    '@/lib/auth':{getAuthenticatedBusiness:async()=>state.denied?null:{business_id:'biz_test',business_name:'Test'}},
    '@/lib/job-types':{ensureOnboardingJobTypes:async()=>{},JobTypeSyncError:class extends Error{}},
    '@/lib/onboarding/funnel':{FUNNEL_KEY:'_funnel',markFinalized:()=>({done:true}),markStepReached:()=>({}),normaliseraVariant:v=>v,readFunnel:()=>({}),stripFunnelFromClientData:v=>v},
    '@/lib/onboarding/payment-gate':{isOnboardingPaymentBlocked:async()=>!!state.unpaid,arOnboardingBetald:()=>true},
    '@/lib/seed-defaults':{seedAllDefaults:async(_db,biz,branch,extra,rate)=>{assert.equal(biz,'biz_test');state.events.push('seed');state.seedArgs={branch,extra,rate};return {total:9,succeeded:9-state.seedFailed,failed:state.seedFailed}}},
    '@/lib/onboarding/starter-cards':{skapaStartkort:async()=>{}},
    '@/lib/billing/founders-offer':{isFoundersOfferAvailable:async()=>true},
    '@/lib/email/provision-inbound-route':{provisionInboundRoute:async()=>({ok:true})},
  })
  const request=body=>new Request('https://unit.invalid/api/onboarding',{method:'POST',body:JSON.stringify(body)})
  return {state,post:body=>api.POST(request(body||{})),put:body=>api.PUT(request(body)),get:()=>api.GET(request({}))}
}
const tests=[]; const test=(name,fn)=>tests.push([name,fn])
test('empty finalize uses the saved trade, extra trades and price before completion',async()=>{
  const h=await route();assert.equal((await h.post()).status,200)
  assert.deepEqual(h.state.seedArgs,{branch:'electrician',extra:['construction'],rate:950})
  assert.deepEqual(h.state.events,['seed','write']);assert(h.state.company.onboarding_completed_at)
  assert.equal(h.state.company.onboarding_data.saved,'keep')
})
test('failed setup cannot complete onboarding; retry preserves choices',async()=>{
  const h=await route({seedFailed:1});assert.equal((await h.post()).status,503)
  assert.equal(h.state.writes.length,0);assert.equal(h.state.company.onboarding_completed_at,null)
  h.state.seedFailed=0;assert.equal((await h.post()).status,200);assert.equal(h.state.seedArgs.rate,950)
})
test('saved-company read failure prevents defaults and completion',async()=>{
  const h=await route({readError:true});assert.equal((await h.post()).status,503);assert.equal(h.state.events.length,0)
})
test('failed final save can retry without changing original completion time',async()=>{
  const h=await route({writeError:true});assert.equal((await h.post()).status,500)
  assert.equal(h.state.company.onboarding_completed_at,null);h.state.writeError=false
  assert.equal((await h.post()).status,200);const stamp=h.state.company.onboarding_completed_at
  assert.equal((await h.post()).status,200);assert.equal(h.state.company.onboarding_completed_at,stamp)
})
test('explicit company edits override saved defaults',async()=>{
  const h=await route();assert.equal((await h.post({branch:'construction',secondary_branches:[],default_hourly_rate:700})).status,200)
  assert.deepEqual(h.state.seedArgs,{branch:'construction',extra:[],rate:700})
  assert.deepEqual(h.state.company.secondary_branches,[])
})
test('authentication and payment gates stop before effects',async()=>{
  for(const [options,status] of [[{denied:true},401],[{unpaid:true},402]]){const h=await route(options);assert.equal((await h.post()).status,status);assert.equal(h.state.events.length,0)}
})
test('progress cannot bypass completion with step 9 or 10',async()=>{
  for(const step of [9,10]) { const h=await route(); await h.put({step,data:{saved:'keep'}}); assert.notEqual(h.state.company.onboarding_step,step); assert.equal(h.state.company.onboarding_completed_at,null) }
})
test('progress read failure cannot overwrite previously saved answers',async()=>{
  const h=await route({readError:true});assert.equal((await h.put({step:3,data:{new:'value'}})).status,503);assert.equal(h.state.writes.length,0)
})
test('pricing read failure cannot overwrite other pricing settings',async()=>{
  const h=await route({pricingError:true});assert.equal((await h.put({config:{material_markup_pct:20}})).status,503);assert.equal(h.state.writes.length,0)
})
test('resume read error is unavailable, not a missing business',async()=>{
  const h=await route({readError:true});assert.equal((await h.get()).status,503)
})
module.exports = { load }
if (require.main === module) (async()=>{for(const [name,fn] of tests){await fn();console.log('PASS',name)}console.log(`PASS ${tests.length} actual onboarding route contracts; database/providers isolated`)})().catch(e=>{console.error(e);process.exitCode=1})
