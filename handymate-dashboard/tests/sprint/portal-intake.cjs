const {load,database}=require('./integrity-loader.cjs'),assert=require('node:assert/strict'),fs=require('node:fs')
const cases=[];const test=(n,f)=>cases.push([n,f])
const actual=load('lib/leads/durable-intake.ts',{'./golden-path':{}})
const input={name:'Byggkund',phone:'0701234567',category:'badrum',estimated_value:0,address:'Byggvägen 1',description:'Badrum',business_id:'forged',lead_source_id:'forged'}
for(const mode of ['completed','blocked','lost-completion','changed','receive-error','missing-key','inactive','limited','bad-value','bad-phone','bad-json','number-error'])test(`portal route ${mode}`,async()=>{
 let receives=0,completes=0
 const db=database(({table,filters})=>{
  if(table==='lead_sources'){
   assert(filters.some(f=>f[1]==='portal_code'&&f[2]==='code'));assert(filters.some(f=>f[1]==='is_active'&&f[2]===true))
   return {data:mode==='inactive'?null:{id:'source-id',business_id:'b',default_category:'other'},error:null}
  }
  assert.equal(table,'leads');assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'));assert(filters.some(f=>f[1]==='lead_id'&&f[2]==='l'))
  return {data:mode==='number-error'?null:{lead_number:'L-1'},error:mode==='number-error'?{}:null}
 })
 const route=load('app/api/lead-portal/[code]/route.ts',{
  './durable-intake':actual,
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200,headers:options?.headers})}},
  '@/lib/supabase':{getServerSupabase:()=>db},'@/lib/branding/attribution':{},
  '@/lib/rate-limit-db':{checkPublicRateLimitDb:async()=>({allowed:mode!=='limited'})},
  '@/lib/leads/durable-intake':{...actual,receiveIntake:async(d,b,scope,key,value,rpc)=>{
   receives++;assert.equal(b,'b');assert.equal(scope,'portal:source-id');assert.equal(key,'portal-key-0001');assert.equal(rpc,'receive_portal_lead_intake')
   assert.equal(value.lead_source_id,'source-id');assert.equal(value.category,'badrum');assert.equal(value.estimated_value,0);assert.equal(value.address_line,'Byggvägen 1')
   assert.equal(value.business_id,undefined)
   if(['changed','receive-error'].includes(mode))throw new actual.IntakeError('failed',mode==='changed'?409:503)
   return {id:'r'}
  },completeIntake:async(d,b,id)=>{
   completes++;assert.equal(b,'b');assert.equal(id,'r');if(mode==='lost-completion')throw Error('lost reply')
   return {id:'r',state:mode==='blocked'?'blocked':'completed',lead_id:'l',deal_id:'d'}
  }},
 })
 const body={...input,...(mode==='bad-value'?{estimated_value:1.25}:{}),...(mode==='bad-phone'?{phone:123}:{})}
 const response=await route.POST({headers:new Headers(mode==='missing-key'?{}:{'Idempotency-Key':'portal-key-0001'}),json:async()=>{if(mode==='bad-json')throw Error('invalid json');return body}},{params:{code:'code'}})
 const statuses={blocked:202,'lost-completion':202,changed:409,'receive-error':503,'missing-key':428,inactive:404,limited:429,'bad-value':400,'bad-phone':400,'bad-json':400}
 assert.equal(response.status,statuses[mode]||200)
 if(['completed','number-error'].includes(mode)){assert.equal(response.body.success,true);assert.equal(response.body.lead_id,'l')}
 if(['blocked','lost-completion'].includes(mode)){assert.equal(response.body.success,false);assert.equal(response.body.received,true);assert.equal(response.body.receipt_id,'r')}
 if(['missing-key','inactive','limited','bad-value','bad-phone','bad-json'].includes(mode))assert.equal(receives,0)
 if(['changed','receive-error'].includes(mode))assert.equal(completes,0)
 assert(response.headers['Access-Control-Allow-Headers'].includes('Idempotency-Key'))
})
const browser=load('lib/leads/portal-submission.ts')
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
test('lost response, reload and edited form reuse exact original request until confirmed',async()=>{
 const saved=storage();let keys=0;const make=()=>`request-${++keys}`
 const first=browser.preparePortalSubmission(saved,'a',input,make)
 await assert.rejects(()=>browser.sendPortalSubmission('a',first,async()=>{throw Error('lost response')}),/lost response/)
 const restored=browser.readPortalSubmission(saved,'a');assert.equal(restored.key,first.key)
 const retry=browser.preparePortalSubmission(saved,'a',{...input,name:'Changed'},make)
 assert.equal(retry.body.name,input.name);assert.equal(keys,1)
 const result=await browser.sendPortalSubmission('a',retry,async(url,options)=>{
  assert.equal(options.headers['Idempotency-Key'],first.key);assert.equal(JSON.parse(options.body).name,input.name)
  return Response.json({success:true,state:'completed',lead_id:'l'})
 })
 assert(result.completed);browser.clearPortalSubmission(saved,'a');assert.equal(browser.readPortalSubmission(saved,'a'),null)
 assert.notEqual(browser.preparePortalSubmission(saved,'a',input,make).key,first.key)
})
for(const reply of [{success:false,received:true,state:'blocked'},{success:true},{success:true,state:'completed',lead_id:null}])test('unconfirmed reply cannot clear pending as success: '+JSON.stringify(reply),async()=>{
 const result=await browser.sendPortalSubmission('a',{key:'same',body:input},async()=>Response.json(reply,{status:202}));assert.equal(result.completed,false)
})
test('storage error prevents preparation and different portal cannot reuse private pending body',()=>{
 const saved=storage();browser.preparePortalSubmission(saved,'a',input,()=> 'a-key');assert.equal(browser.readPortalSubmission(saved,'b'),null)
 assert.throws(()=>browser.preparePortalSubmission({getItem:()=>null,setItem:()=>{throw Error('storage blocked')}},'a',input,()=> 'new'),/storage blocked/)
})
test('actual portal page renders saved pending request with recovery CTA and no success receipt',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');let i=0
 const data={source:{id:'source',name:'Byggpartner'},business:{business_name:'Test Bygg'},leads:[],stats:{total:0}}
 const states={0:data,1:false,6:{key:'saved',body:input},7:'Mottagen men behöver slutföras',8:true}
 const Page=load('app/lead-portal/[code]/page.tsx',{
  react:{...React,useState:initial=>[i in states?states[i++]: (i++,initial),()=>{}],useEffect:()=>{},useCallback:fn=>fn,useRef:value=>({current:value})},
  'next/navigation':{useParams:()=>({code:'a'}),useSearchParams:()=>({get:()=>null})},
  '@/components/AddressAutocomplete':{default:()=>null},'@/components/branding/AttributionStamp':{default:()=>null},
 }).default
 const html=renderToStaticMarkup(React.createElement(Page));assert(html.includes('Kontrollera och slutför samma förfrågan'));assert(html.includes(input.name));assert(!html.includes('Lead skickat!'))
 const source=fs.readFileSync('app/lead-portal/[code]/page.tsx','utf8');assert(source.includes('sending.current = true'));assert(source.includes('sendPortalSubmission(code, submission, fetch)'))
})
;(async()=>{for(const [name,fn]of cases){let timer;try{await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout: '+name)),10000)})]);console.log('PASS',name)}finally{clearTimeout(timer)}}console.log(`PASS ${cases.length} portal route/submission/render contracts; network mocked`)})().catch(e=>{console.error(e);process.exitCode=1})
