// Runs the real payment core with an in-memory DB and no external providers.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'), cache={}
let invoice, customer, config, pending=new Map(), fireCalls=[], directCalls=[]
const db={from(table){let op='read',values,filters=[];const chain=new Proxy({}, {get(_,key){
  if(key==='then') return resolve=>{const match=row=>filters.every(([k,v])=>row?.[k]===v);let data=null,error=null
    if(table==='invoice'){if(op==='update'){if(match(invoice)) Object.assign(invoice,structuredClone(values));data=null}else data=match(invoice)?structuredClone(invoice):null}
    else if(table==='customer') data=match(customer)?structuredClone(customer):null
    else if(table==='business_config') data=match(config)?structuredClone(config):null
    else if(table==='pending_approvals'){if(op==='insert'){const value=structuredClone(values);if(pending.has(value.id)) error={code:'23505',message:'duplicate'};else pending.set(value.id,value);data=value}else data=[...pending.values()].find(match)||null}
    resolve({data,error})}
  return (...args)=>{if(['eq'].includes(String(key)))filters.push(args);if(key==='update'||key==='insert'){op=String(key);values=args[0]}return chain}
}});return chain}}
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};cache[file]=mod.exports
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const req=name=>{
  if(name.startsWith('node:'))return require(name)
  if(name==='@/lib/supabase')return {getServerSupabase:()=>db}
  if(name==='@/lib/pipeline')return {getAutomationSettings:async()=>({auto_move_on_payment:false}),findDealByInvoice:async()=>null,moveDeal:async()=>{throw Error('unexpected move')}}
  if(name==='@/lib/project-ai-engine')return {handleProjectEvent:async()=>{directCalls.push('project')}}
  if(name==='@/lib/project-stages/event-bridge')return {bumpProjectStage:async()=>({moved:false,skipped:true})}
  if(name==='@/lib/automation-engine')return {fireEvent:async(...args)=>{fireCalls.push(structuredClone(args.slice(1)));return {matched:2,pending_approval:2,executed:0,skipped:0,failed:0}}}
  if(name==='@/lib/smart-communication')return {triggerEventCommunication:async()=>{directCalls.push('smart')}}
  if(name==='@/lib/portal/notification-emails')return {sendPortalNotification:async()=>{directCalls.push('portal');return {success:true}}}
  if(name==='@/lib/customers/namn')return {halsning:n=>`Hej ${String(n).split(' ')[0]}!`}
  if(name==='@/lib/sms-reply-number')return {buildSmsSuffix:n=>`// ${n}`}
  if(name.startsWith('@/lib/'))return load(path.join(root,name.slice(2)+'.ts'))
  if(name.startsWith('./'))return load(path.resolve(path.dirname(file),name+'.ts'))
  throw Error(`Unexpected import ${name}`)
 }
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:req,console,process:{env:{NEXT_PUBLIC_APP_URL:'https://app.test'}},Date,Math,JSON,Buffer,structuredClone},{filename:file});cache[file]=mod.exports;return mod.exports
}
const {applyInvoicePayment}=load(path.join(root,'lib/invoices/apply-payment.ts'))
const reset=()=>{invoice={invoice_id:'inv1',business_id:'b1',status:'sent',customer_id:'c1',invoice_number:'1001',fortnox_invoice_number:null,total:10000,rot_rut_type:'rot',rot_rut_deduction:3000,customer_pays:7000,paid_amount:null,paid_at:null};customer={customer_id:'c1',business_id:'b1',name:'Anna Andersson',phone_number:'+46701111111',email:'anna@example.test',portal_token:'tok1',portal_enabled:true,review_request_sent_at:null};config={business_id:'b1',business_name:'Testfirman',assigned_phone_number:'+468100000',google_review_url:'https://reviews.test/x',review_request_enabled:true};pending=new Map();fireCalls=[];directCalls=[]}
;(async()=>{
 reset()
 const result=await applyInvoicePayment({businessId:'b1',invoiceId:'inv1',source:'customer_confirmed',approvalFollowUps:{approvalId:'appr1',updateWorkflows:false,prepareCustomerMessages:true,runAutomationRules:true}})
 assert.equal(result.ok,true);assert.equal(invoice.status,'customer_paid');assert.equal(invoice.paid_amount,7000)
 assert.equal(directCalls.length,0,'reviewed payment must not send or invoke direct customer communication')
 assert.equal(fireCalls.length,1);assert.equal(fireCalls[0][2].require_explicit_approval,true);assert.equal(fireCalls[0][2].entity_id,'inv1')
 assert.equal(pending.size,2);const rows=[...pending.values()];const email=rows.find(r=>r.approval_type==='send_email'),sms=rows.find(r=>r.approval_type==='review_request')
 assert.equal(email.payload.to,customer.email);assert(email.payload.body.includes('7 000 kr'));assert(email.payload.body.includes('https://app.test/portal/tok1'))
 assert.equal(sms.payload.to,customer.phone_number);assert(sms.payload.message.includes(config.google_review_url));assert(rows.every(r=>r.payload.parent_approval_id==='appr1'))
 invoice.status='sent';invoice.paid_amount=null
 const replay=await applyInvoicePayment({businessId:'b1',invoiceId:'inv1',source:'customer_confirmed',approvalFollowUps:{approvalId:'appr1',updateWorkflows:false,prepareCustomerMessages:true,runAutomationRules:false}})
 assert.equal(replay.ok,true);assert.equal(pending.size,2,'same parent approval must reuse the same follow-up rows')
 console.log('PASS payment follow-ups: actual payment core updates ROT state, defers exact portal/review messages, forces rule approvals, and reuses child approvals without external sends.')
})().catch(err=>{console.error(err);process.exitCode=1})
