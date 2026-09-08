// Actual sendInvoice orchestration. ALL providers, PDF renderer, manifest and
// automation adapters are isolated; this is not a Fortnox end-to-end proof.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
let s
function reset(){s={invoice:{invoice_id:'i',business_id:'b',customer_id:'c',invoice_number:'DRAFT-1',total:1250,subtotal:1000,vat_rate:25,vat_amount:250,due_date:'2026-10-01',status:'draft',customer:{business_id:'b',name:'Test Kund',email:'customer@example.test',phone_number:'+46700000000'}},business:{business_id:'b',business_name:'Testbolag'},customer:{business_id:'b',customer_id:'c',portal_token:'portal',portal_enabled:true},writes:[],effects:[],email:'accepted',sms:true,fortnox:{success:true}}}
const db={from(table){let op='read',values,filters=[],single=false;const c=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
   if(op!=='insert')assert(filters.some(([k,v])=>k==='business_id'&&v==='b'),table+' must be tenant-scoped')
   if(op!=='read')s.writes.push({table,op,values,filters})
   const row=table==='invoice'?s.invoice:table==='business_config'?s.business:table==='customer'?s.customer:null
   const match=row&&filters.every(([k,v])=>row[k]===v)
   if(table==='customer'&&s.portalError)return resolve({data:null,error:{message:'portal failed'}})
   if(op==='update'&&match)Object.assign(row,values)
   return resolve({data:single?(match?structuredClone(row):null):match?[row]:[],error:null})
 }
 return(...args)=>{if(key==='eq'||key==='is')filters.push(args);if(key==='single')single=true;if(['insert','update'].includes(key)){op=key;values=args[0]}return c}
}});return c}}
const cache={}
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};cache[file]=mod.exports
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
 module:mod,exports:mod.exports,Buffer,Date,console:{...console,error(){}},process:{env:{NEXT_PUBLIC_APP_URL:'https://app.example.test'}},fetch:()=>{throw Error('Network forbidden')},require(name){
  if(name==='crypto')return require('node:crypto')
  if(name==='resend')return {Resend:class{emails={send:async args=>{s.effects.push({type:'email',args});if(s.email==='throw')throw Error('lost response');return s.email==='accepted'?{data:{id:'message-1'},error:null}:s.email==='rejected'?{data:null,error:{message:'rejected'}}:{data:{},error:null}}}}}
  if(name==='@/lib/invoices/sync-to-fortnox')return {syncInvoiceToFortnox:async()=>{s.effects.push({type:'fortnox'});return s.fortnox}}
  if(name==='@/lib/invoices/build-invoice-pdf')return {buildInvoicePdfBuffer:async invoice=>{s.effects.push({type:'pdf',invoice:structuredClone(invoice)});return Buffer.from('isolated-pdf')}}
  if(name==='@/lib/invoices/evidence-manifest')return {prepareInvoiceManifest:async()=>({ok:true}),markInvoiceDelivered:async()=>({ok:true,row:{status:'delivered'}})}
  if(name==='@/lib/observability/driftlarm')return {rapporteraTystFel:async()=>{}}
  if(name==='@/lib/pipeline')return {getAutomationSettings:async()=>({})}
  if(name==='@/lib/project-stages/event-bridge')return {bumpProjectStage:async()=>({skipped:true})}
  if(name==='@/lib/sms-send')return {sendSmsViaElks:async args=>{s.effects.push({type:'sms',args});return {success:s.sms,error:s.sms?undefined:'rejected'}}}
  if(['@/lib/pdf-generator','@/lib/swish-qr','@/lib/branding/pdf'].includes(name))return new Proxy({}, {get:()=>()=>{throw Error('Unexpected fallback PDF')}})
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts')
  if(name.startsWith('./')||name.startsWith('../'))return load(path.resolve(path.dirname(file),name+'.ts'))
  throw Error('Unexpected dependency '+name)
 }});cache[file]=mod.exports;return mod.exports}
const {sendInvoice}=load('lib/invoices/send-invoice.ts')
const send=(params={})=>sendInvoice(db,{businessId:'b',invoiceId:'i',sendEmail:true,sendSms:false,...params})
let checks=0
async function check(name,run){reset();await run();checks++;console.log('PASS '+name)}
;(async()=>{
 await check('foreign invoice denied before Fortnox or sends',async()=>{s.invoice.business_id='other';assert.equal((await send()).found,false);assert.equal(s.effects.length+s.writes.length,0)})
 await check('foreign embedded customer denied before Fortnox or sends',async()=>{s.invoice.customer.business_id='other';assert.match((await send()).errors[0],/verifieras/);assert.equal(s.effects.length+s.writes.length,0)})
 await check('Fortnox rejection prevents PDF/email/SMS',async()=>{s.fortnox={success:false,error:'bookkeeping rejected'};assert.match((await send({sendSms:true})).errors[0],/Fortnox/);assert.deepEqual(s.effects.map(e=>e.type),['fortnox'])})
 await check('confirmed e-invoice causes no duplicate email, SMS or portal activation',async()=>{s.fortnox={success:true,eInvoiceSent:true};s.customer.portal_enabled=false;const r=await send({sendSms:true});assert.equal(r.einvoice,true);assert.deepEqual(s.effects.map(e=>e.type),['fortnox']);assert(!s.writes.some(w=>w.table==='customer'));assert.equal(s.invoice.sent_method,'einvoice')})
 await check('new Fortnox number reaches actual PDF and email adapter',async()=>{s.fortnox={success:true,newInvoiceNumber:'FORT-9',newOcrNumber:'900'};const r=await send();assert.equal(r.email,true);assert.equal(s.effects.find(e=>e.type==='pdf').invoice.invoice_number,'FORT-9');const email=s.effects.find(e=>e.type==='email');assert(email.args.subject.includes('FORT-9'));assert.equal(email.args.attachments[0].filename,'faktura-FORT-9.pdf');assert(email.args.attachments[0].content.equals(Buffer.from('isolated-pdf')))})
 for(const email of ['missing-id','rejected','throw'])await check('email '+email+' never marks invoice sent',async()=>{s.email=email;const r=await send();assert.notEqual(r.email,true);assert(r.errors.length);assert.equal(s.invoice.status,'draft')})
 await check('one accepted channel keeps delivery truth and channel error',async()=>{s.email='rejected';const r=await send({sendSms:true});assert.equal(r.sms,true);assert(r.errors.length);assert.equal(s.invoice.sent_method,'sms')})
 await check('portal read failure cannot send a fabricated link',async()=>{s.portalError=true;const r=await send();assert.match(r.errors.join(' '),/Fortnox-synken är klar/);assert.deepEqual(s.effects.map(e=>e.type),['fortnox'])})
 await check('skipped Fortnox is not presented as completed accounting',async()=>{s.fortnox={success:true,skipped:true};s.portalError=true;const r=await send();assert.match(r.errors.join(' '),/Ingen Fortnox-synk gjordes/)})
 await check('new portal write is scoped and its saved token reaches email',async()=>{s.customer.portal_token=null;s.customer.portal_enabled=false;const r=await send();assert.equal(r.email,true);const write=s.writes.find(w=>w.table==='customer');assert(write);assert(s.effects.find(e=>e.type==='email').args.html.includes(write.values.portal_token))})
 console.log(`PASS ${checks} isolated actual invoice-orchestration scenarios. Fortnox/provider effects and PDF rendering are mocked; signed financial review remains open.`)
})().catch(e=>{console.error(e);process.exitCode=1})
