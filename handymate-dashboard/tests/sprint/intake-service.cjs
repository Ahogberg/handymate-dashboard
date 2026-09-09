const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
function load(file,mocks={},cache={}) {
 file=path.resolve(file);if(!fs.existsSync(file)&&file.endsWith('.ts'))file=path.join(file.slice(0,-3),'index.ts');if(cache[file])return cache[file].exports
 const mod={exports:{}};cache[file]=mod
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{module:mod,exports:mod.exports,process,console,Buffer,URL,Response,require(n){
  if(n in mocks)return mocks[n]
  if(n.startsWith('@/'))return load(n.slice(2)+'.ts',mocks,cache)
  if(n.startsWith('.'))return load(path.resolve(path.dirname(file),n)+'.ts',mocks,cache)
  return require(n)
 }})
 return mod.exports
}
function database(respond) {return {from(table){let op='read',value,filters=[];const q={};for(const k of ['select','single','maybeSingle','limit','order','gte','lt','not','ilike'])q[k]=()=>q
 for(const k of ['eq','in','is','or','neq'])q[k]=(...args)=>{filters.push([k,...args]);return q}
 for(const k of ['insert','update'])q[k]=v=>{op=k;value=v;return q}
 q.then=(resolve,reject)=>Promise.resolve().then(()=>respond({table,op,value,filters})).then(resolve,reject);return q}}}
const cases=[];const test=(name,fn)=>cases.push({name,fn})
const input={name:'Test',phone:'0701234567',email:null,message:null,source_ref:null,lead_source_id:null}
const base={id:'r',business_id:'b',input,state:'completed',error_code:null,customer_id:'c',lead_id:'l',deal_id:'d',notice_state:'not_started'}
for(const mode of ['ok','notice-failed','notice-throws','claim-error','claim-empty','receipt-error','receipt-empty','business-error','attempted','uncertain','blocked'])test(`service: ${mode} preserves receipt and never resends an uncertain notice`,async()=>{
 let notices=0,syncs=0
 const row={...base,notice_state:['attempted','uncertain'].includes(mode)?mode:'not_started',state:mode==='blocked'?'blocked':'completed'}
 const db=database(({table,op,value,filters})=>{
  assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'))
  if(table==='business_config')return {data:{phone_number:null},error:mode==='business-error'?{}:null}
  assert.equal(table,'lead_intake_request');assert.equal(op,'update');assert(filters.some(f=>f[1]==='id'&&f[2]==='r'))
  const claim=value.notice_state==='attempted';assert(filters.some(f=>f[1]==='notice_state'&&f[2]===(claim?'not_started':'attempted')))
  return {data:mode===(claim?'claim-empty':'receipt-empty')?null:{id:'r'},error:mode===(claim?'claim-error':'receipt-error')?{}:null}
 })
 db.rpc=async(n,p)=>{assert.equal(n,'complete_lead_intake');assert.equal(p.p_business,'b');return {data:{receipt:row},error:null}}
 const svc=load('lib/leads/durable-intake.ts',{'./golden-path':{notifyReceivedLead:async()=>{notices++;if(mode==='notice-throws')throw Error('timeout');return mode!=='notice-failed'}},'@/lib/fortnox/sync':{syncNewCustomerToFortnox:async()=>{syncs++}}})
 const receipt=await svc.completeIntake(db,'b','r');assert.equal(receipt.lead_id,'l');assert.equal(receipt.state,row.state)
 const sends=['ok','notice-failed','notice-throws','receipt-error','receipt-empty'].includes(mode)?1:0
 assert.equal(notices,sends);assert.equal(syncs,sends)
 if(mode==='ok')assert.equal(receipt.notice_state,'confirmed')
 if(mode.startsWith('notice-'))assert.equal(receipt.notice_state,'uncertain')
 if(mode.startsWith('receipt-'))assert.equal(receipt.notice_state,'attempted')
})
for(const mode of ['missing','error','empty'])test(`complete RPC ${mode} never invokes legacy writes or notifications`,async()=>{
 const svc=load('lib/leads/durable-intake.ts',{'./golden-path':{notifyReceivedLead:()=>assert.fail('notice')}})
 const db={rpc:async()=>({data:null,error:mode==='empty'?null:{message:mode==='missing'?'intake_missing':'offline'}})}
 await assert.rejects(()=>svc.completeIntake(db,'b','r'),e=>e.status===(mode==='missing'?404:503))
})
for(const mode of ['ok','changed','error','empty','invalid-key'])test(`receive RPC ${mode}`,async()=>{
 let calls=0;const svc=load('lib/leads/durable-intake.ts',{'./golden-path':{}})
 const db={rpc:async(n,p)=>{calls++;assert.equal(n,'receive_lead_intake');assert.equal(p.p_scope,'website');return {data:mode==='ok'?base:null,error:mode==='changed'?{message:'intake_request_changed'}:mode==='error'?{message:'offline'}:null}}}
 if(mode==='ok')assert.equal((await svc.receiveIntake(db,'b','website','request-0001',input)).id,'r')
 else await assert.rejects(()=>svc.receiveIntake(db,'b','website',mode==='invalid-key'?'x':'request-0001',input),e=>e.status===(mode==='changed'?409:mode==='invalid-key'?400:503))
 assert.equal(calls,mode==='invalid-key'?0:1)
})
function request(body={},headers={},url='https://example.invalid/api/leads/intake'){return {url,headers:new Headers(headers),json:async()=>body}}
for(const mode of ['completed','blocked','completion-error','receive-error','changed','legacy','unauthenticated','rate-limited','invalid-input'])test(`public route: ${mode}`,async()=>{
 let legacy=0,receives=0,completes=0
 const actual=load('lib/leads/durable-intake.ts',{'./golden-path':{}})
 const db=database(({table})=>({data:mode==='unauthenticated'?null:table==='business_config'?{business_id:'b',phone_number:null}:{id:'source',business_id:'b',name:'Custom display name'},error:null}))
 const route=load('app/api/leads/intake/route.ts',{
  'next/server':{},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/rate-limit-db':{checkPublicRateLimitDb:async()=>({allowed:mode!=='rate-limited',resetAt:Date.now()+1000})},
  '@/lib/leads/golden-path':{createLeadAndDeal:async i=>{legacy++;assert.equal(i.source,'website_form');return {dealId:'d'}}},
  '@/lib/leads/durable-intake':{...actual,receiveIntake:async()=>{receives++;if(['receive-error','changed'].includes(mode))throw new actual.IntakeError('save failed',mode==='changed'?409:503);return base},completeIntake:async()=>{completes++;if(mode==='completion-error')throw new actual.IntakeError('uncertain',503);return {...base,state:mode==='blocked'?'blocked':'completed'}}}
 })
 const headers={'x-api-key':'fake',...(mode==='legacy'?{}:{'Idempotency-Key':'request-0001'})}
 const response=await route.POST(request(mode==='invalid-input'?{...input,phone:123}:input,headers));const body=await response.json()
 const status={blocked:202,'completion-error':503,'receive-error':503,changed:409,unauthenticated:401,'rate-limited':429,'invalid-input':400}[mode]||200
 assert.equal(response.status,status);assert.equal(legacy,mode==='legacy'?1:0)
 if(mode==='blocked'){assert.equal(body.received,true);assert.equal(body.success,false);assert.equal(body.deal_created,false)}
 if(['unauthenticated','rate-limited','invalid-input','legacy'].includes(mode))assert.equal(receives,0)
 if(['receive-error','changed'].includes(mode))assert.equal(completes,0)
 assert((await route.OPTIONS()).headers.get('Access-Control-Allow-Headers').includes('Idempotency-Key'))
})
for(const mode of ['owner','employee','inactive','unauthenticated','foreign','blocked','db-error'])test(`recovery authorization: ${mode}`,async()=>{
 let reads=0,completes=0
 const actual=load('lib/leads/durable-intake.ts',{'./golden-path':{}})
 const db=database(({table,filters})=>{reads++;assert.equal(table,'lead_intake_request');assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'));return {data:[],error:mode==='db-error'?{}:null}})
 const route=load('app/api/leads/intake-recovery/route.ts',{'next/server':{NextResponse:Response},'@/lib/auth':{getAuthenticatedBusiness:async()=>mode==='unauthenticated'?null:{business_id:'b'}},'@/lib/permissions':{getCurrentUser:async()=>({is_active:mode!=='inactive'}),isOwnerOrAdmin:()=>mode!=='employee'},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/leads/durable-intake':{...actual,completeIntake:async(d,b,id)=>{completes++;assert.equal(b,'b');if(mode==='foreign')throw new actual.IntakeError('missing',404);return {...base,state:mode==='blocked'?'blocked':'completed'}}}})
 const get=await route.GET(request());const post=await route.POST(request({receipt_id:'r'}))
 const denied=mode==='unauthenticated'?401:['employee','inactive'].includes(mode)?403:0
 assert.equal(get.status,denied||(mode==='db-error'?503:200));assert.equal(post.status,denied||(mode==='foreign'?404:mode==='blocked'?202:200));assert.equal(get.headers.get('Cache-Control'),'no-store')
 if(denied){assert.equal(reads,0);assert.equal(completes,0)}
})
;(async()=>{let failed=0;for(const {name,fn}of cases){try{await fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e)}}assert.equal(failed,0);console.log(`PASS ${cases.length} intake service and HTTP contracts; external effects mocked`)})().catch(e=>{console.error(e);process.exitCode=1})
