// Runs the real campaign sender with an in-memory DB and no SMS provider.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),cache={}
let campaigns=new Map(),recipients=[],sendCalls=[],outcomes=[]
const db={from(table){let op='read',values,filters=[];const chain=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{const match=row=>filters.every(([k,v])=>row?.[k]===v);let data=null,error=null
  if(table==='sms_campaign'){const rows=[...campaigns.values()].filter(match);if(op==='update'){for(const row of rows)Object.assign(row,structuredClone(values));data=rows.map(row=>({campaign_id:row.campaign_id}))}else data=rows[0]||null}
  else if(table==='sms_campaign_recipient'){const rows=recipients.filter(match);if(op==='update'){for(const row of rows)Object.assign(row,structuredClone(values));data=rows.map(row=>({id:row.id}))}else data=structuredClone(rows)}
  else if(table==='business_config')data={business_name:'Testfirman',subscription_plan:'pro'}
  resolve({data,error})}
 return(...args)=>{if(key==='eq')filters.push(args);if(key==='update'){op='update';values=args[0]}return chain}
}});return chain}}
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};cache[file]=mod.exports
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const req=name=>{
  if(name==='next/server')return {NextResponse:{json:(data,init)=>Response.json(data,init)}}
  if(name==='@/lib/supabase')return {getServerSupabase:()=>db}
  if(name==='@/lib/auth')return {getAuthenticatedBusiness:async()=>({business_id:'b1'})}
  if(name==='@/lib/rate-limit-db')return {checkSmsRateLimitDb:async()=>({allowed:true})}
  if(name==='@/lib/sms-usage')return {checkSmsAllowance:async()=>({allowed:true})}
  if(name==='@/lib/sms-send')return {sendSmsViaElks:async args=>{sendCalls.push(structuredClone({...args,supabase:undefined}));const next=outcomes.shift();if(next instanceof Error)throw next;return next}}
  throw Error(`Unexpected import ${name}`)
 }
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,JSON,Buffer,Response,setTimeout},{filename:file});cache[file]=mod.exports;return mod.exports
}
const {POST}=load(path.join(root,'app/api/campaigns/send/route.ts'))
const request=id=>({json:async()=>({campaignId:id}),headers:new Headers()})
;(async()=>{
 campaigns.set('camp1',{campaign_id:'camp1',business_id:'b1',status:'scheduled',message:'Granskat meddelande'})
 recipients=[{id:'r1',campaign_id:'camp1',customer_id:'c1',phone_number:'+46701111111',status:'pending'},{id:'r2',campaign_id:'camp1',customer_id:'c2',phone_number:'+46702222222',status:'pending'}]
 outcomes=[{success:true,smsId:'s1',elksId:'e1',status:200},{success:false,error:'avvisat',status:503}]
 let response=await POST(request('camp1'));let body=await response.json()
 assert.equal(response.status,200);assert.equal(body.status,'partial');assert.equal(body.delivered,1);assert.equal(body.failed,1)
 assert.equal(recipients[0].status,'sent');assert.equal(recipients[1].status,'failed');assert.equal(campaigns.get('camp1').status,'partial')
 assert.equal(sendCalls[0].approvalId,'campaign:camp1:r1');assert.equal(sendCalls[1].approvalId,'campaign:camp1:r2')
 response=await POST(request('camp1'));body=await response.json();assert.equal(body.idempotent,true);assert.equal(sendCalls.length,2,'terminal recipient rows must not be sent again')

 campaigns.set('camp2',{campaign_id:'camp2',business_id:'b1',status:'scheduled',message:'Osäkert meddelande'})
 recipients=[{id:'r3',campaign_id:'camp2',customer_id:'c3',phone_number:'+46703333333',status:'pending'}];outcomes=[new Error('provider response lost')]
 response=await POST(request('camp2'));body=await response.json()
 assert.equal(body.status,'needs_reconciliation');assert.equal(body.uncertain,1);assert(body.warning.includes('Skicka inte igen'));assert.equal(recipients[0].status,'unknown')
 response=await POST(request('camp2'));body=await response.json();assert.equal(body.idempotent,true);assert.equal(sendCalls.length,3,'unknown delivery must not be retried')
 console.log('PASS campaign sender: per-recipient claims, stable SMS identities, truthful partial status and unknown-response resend blocking.')
})().catch(err=>{console.error(err);process.exitCode=1})
