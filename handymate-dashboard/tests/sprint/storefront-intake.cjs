const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const {NextRequest,NextResponse}=require('next/server')
function load(file,deps={}) {
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText
 const m={exports:{}};new Function('require','module','exports',code)(name=>{
  if(!(name in deps))throw Error('Unexpected dependency '+name);return deps[name]
 },m,m.exports);return m.exports
}
const input={business_id:'a',name:'Kund',phone:'',email:'CUSTOMER@example.invalid',message:'Bygg ett garage'}
const durable=load('lib/leads/durable-intake.ts',{'./golden-path':{notifyReceivedLead:async()=>true}})
const portal=load('lib/leads/portal-submission.ts')
const browser=load('lib/leads/storefront-submission.ts',{'./portal-submission':portal})
const tests=[];const test=(name,fn)=>tests.push([name,fn])
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}}
function route(){
 const state={published:true,allowed:true,received:0,completed:0,blocked:false,failReceive:false}
 const db={from(table){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='business_config'?{business_id:'a'}:{id:'site',is_published:state.published},error:null})};return q}}
 const service={...durable,receiveIntake:async(_db,biz,scope,key,data,rpc)=>{
  assert.equal(biz,'a');assert.equal(scope,'storefront:site');assert.equal(key,'request-123');assert.equal(rpc,'receive_storefront_lead_intake');assert.equal(data.phone,'');assert.equal(data.email,'customer@example.invalid');state.received++
  if(state.failReceive)throw new durable.IntakeError('Unavailable',503)
  return {id:'receipt'}
 },completeIntake:async(_db,biz,id)=>{assert.equal(id,'receipt');state.completed++;return {id,state:state.blocked?'blocked':'completed',lead_id:'lead',deal_id:'deal'}}}
 const handlers=load('app/api/storefront/contact/route.ts',{
  crypto:require('crypto'),'next/server':{NextResponse},'@/lib/leads/durable-intake':service,
  '@/lib/supabase':{getServerSupabase:()=>db},'@/lib/rate-limit-db':{checkPublicRateLimitDb:async()=>({allowed:state.allowed,resetAt:Date.now()+1000})},
 })
 return {state,post:(key='request-123',body=input)=>handlers.POST(new NextRequest('https://test/api/storefront/contact',{method:'POST',headers:key?{'Idempotency-Key':key}:{},body:JSON.stringify(body)})),options:handlers.OPTIONS}
}
test('email-only input is valid while old portal contract still requires phone',()=>{
 assert.equal(durable.storefrontIntakeInput(input).email,'customer@example.invalid')
 assert.throws(()=>durable.intakeInput(input,null),/telefonnumret/)
 for(const body of [{...input,email:''},{...input,email:'broken'},{...input,name:22},{...input,phone:22}])assert.throws(()=>durable.storefrontIntakeInput(body))
})
test('route accepts email-only via versioned durable reception then completion',async()=>{
 const h=route();const response=await h.post();assert.equal(response.status,200)
 assert.deepEqual(await response.json(),{success:true,received:true,receipt_id:'receipt',state:'completed',deal_created:true,lead_id:'lead',message:'Förfrågan och affären är sparade.',deal_id:'deal'})
 assert.equal(h.state.received,1);assert.equal(h.state.completed,1)
 assert.equal((await (await h.options()).json()).contract,'storefront-intake-v1')
})
test('missing key, unpublished site and rate limit stop before receipt',async()=>{
 const h=route();assert.equal((await h.post('')).status,428)
 h.state.published=false;assert.equal((await h.post()).status,404)
 h.state.published=true;h.state.allowed=false;assert.equal((await h.post()).status,429)
 assert.equal(h.state.received,0)
})
test('missing database contract cannot fall back to legacy writes',async()=>{
 const h=route();h.state.failReceive=true;assert.equal((await h.post()).status,503);assert.equal(h.state.completed,0)
})
test('blocked receipt is 202, never success or a fabricated deal',async()=>{
 const h=route();h.state.blocked=true;const r=await h.post();assert.equal(r.status,202)
 const body=await r.json();assert.equal(body.received,true);assert.equal(body.success,false);assert.equal(body.deal_id,null)
})
test('lost response and reload preserve immutable body and key, isolated by company',async()=>{
 const s=storage();const original=browser.prepareStorefrontSubmission(s,'a',input,()=> 'request-123')
 await assert.rejects(()=>browser.sendStorefrontSubmission(original,async()=>{throw Error('lost response')}))
 const retry=browser.prepareStorefrontSubmission(s,'a',{...input,message:'changed'},()=> 'different')
 assert.deepEqual(retry,original);assert.equal(browser.readStorefrontSubmission(s,'b'),null)
 const sent=[];const result=await browser.sendStorefrontSubmission(retry,async(_url,options)=>{
  if(options.method==='OPTIONS')return Response.json({contract:'storefront-intake-v1'})
  sent.push(options);return Response.json({success:true,state:'completed',receipt_id:'r',lead_id:'l',deal_id:'d'})
 })
 assert.equal(result.completed,true);assert.equal(sent[0].headers['Idempotency-Key'],'request-123');assert.equal(JSON.parse(sent[0].body).message,input.message)
 browser.clearStorefrontSubmission(s,'a');assert.equal(browser.readStorefrontSubmission(s,'a'),null)
})
test('legacy backend cannot receive a blind retry from a new client',async()=>{
 let posts=0;await assert.rejects(()=>browser.sendStorefrontSubmission({key:'key',body:input},async(_u,o)=>{if(o.method==='POST')posts++;return Response.json({})}))
 assert.equal(posts,0)
})
test('storage failure prevents an untracked request',()=>{
 assert.throws(()=>browser.prepareStorefrontSubmission({getItem:()=>null,setItem:()=>{throw Error('blocked')}},'a',input,()=> 'key'))
})
for(const body of [{success:true},{success:false,state:'blocked'},{success:true,state:'completed',lead_id:'l'}])test('incomplete receipt remains pending '+JSON.stringify(body),async()=>{
 const r=await browser.sendStorefrontSubmission({key:'key',body:input},async(_u,o)=>Response.json(o.method==='OPTIONS'?{contract:'storefront-intake-v1'}:body));assert.equal(r.completed,false)
})
test('real client persists before send, restores fields, locks double submit and makes no unbacked response promise',()=>{
 const source=fs.readFileSync('app/site/[slug]/StorefrontClient.tsx','utf8')
 for(const text of ['formLock.current = true','readStorefrontSubmission(window.sessionStorage','prepareStorefrontSubmission(window.sessionStorage','sendStorefrontSubmission(pending, fetch)','Kontrollera samma förfrågan','readOnly={!!formPending}'])assert(source.includes(text))
 assert(source.indexOf('prepareStorefrontSubmission(window.sessionStorage')<source.indexOf('sendStorefrontSubmission(pending, fetch)'))
 assert(!source.includes('Vi återkommer inom 24 timmar.'))
})
;(async()=>{for(const [name,fn]of tests){await fn();console.log('PASS',name)}console.log(`PASS ${tests.length} storefront contracts; browser/network isolated`)})().catch(e=>{console.error(e);process.exitCode=1})
