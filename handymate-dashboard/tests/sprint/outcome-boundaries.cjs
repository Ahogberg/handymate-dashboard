const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
function load(file,mocks={},cache={}) {
 file=path.resolve(file);if(!fs.existsSync(file)&&file.endsWith('.ts'))file=path.join(file.slice(0,-3),'index.ts');if(cache[file])return cache[file].exports
 const mod={exports:{}};cache[file]=mod
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{module:mod,exports:mod.exports,process,console,Buffer,URL,require(n){
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
for(const mode of ['error','empty'])test(`lead: customer ${mode} prevents phantom lead and downstream sync`,async()=>{
 let leadWrites=0,syncs=0
 const db=database(({table,op})=>{if(table==='customer'&&op==='insert')return {data:null,error:mode==='error'?{message:'storage unavailable'}:null};if(table==='leads')leadWrites++;return {data:{key:'new_lead'},error:null}})
 const {createLeadAndDeal}=load('lib/leads/golden-path.ts',{
  '@/lib/numbering':{getNextLeadNumber:async()=>1,getNextCaseNumber:async()=>1},
  '@/lib/customer-dedupe':{findCustomerDuplicates:async()=>[]},
  '@/lib/pipeline':{},'@/lib/approvals/artifact-write':{},
  '@/lib/fortnox/sync':{syncNewCustomerToFortnox:async()=>{syncs++}},
 })
 await assert.rejects(()=>createLeadAndDeal({businessId:'b',businessPhoneNumber:null,name:'Test',phone:'0701234567',email:null,message:null,source:'website_form',createDealAndNotify:false},db))
 assert.equal(leadWrites,0);assert.equal(syncs,0)
})
for(const state of ['draft','cancelled','credited','sent','overdue','paid','customer_paid'])test(`ledger: ${state} is classified from actual invoice state`,async()=>{
 const db=database(({table,filters})=>{
  assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'))
  if(table==='pending_approvals')return {data:[{id:'a',approval_type:'missad_intakt',status:'approved',created_at:'2026-09-02T00:00:00Z',resolved_at:'2026-09-03T00:00:00Z',payload:{draft_invoice_id:'i',amount_kr:1200}}],error:null}
  assert.equal(table,'invoice');return {data:[{invoice_id:'i',status:state,total:1500,paid_at:['paid','customer_paid'].includes(state)?'2026-09-04T00:00:00Z':null}],error:null}
 })
 const {getManadsLedger}=load('lib/value/ledger.ts');const result=await getManadsLedger(db,'b','2026-09')
 assert.equal(result.fakturerat.antal,['sent','overdue','paid','customer_paid'].includes(state)?1:0)
 assert.equal(result.betalt.antal,['paid','customer_paid'].includes(state)?1:0)
})
for(const mode of ['accounting','einvoice','einvoice-failed'])test(`Fortnox: ${mode} does not invent customer delivery`,async()=>{
 let delivered=0
 const invoice={invoice_id:'i',customer_id:'c',status:'draft',items:[{description:'Arbete',quantity:1,unit_price:100}],total:125,subtotal:100,vat_amount:25}
 const db=database(({table,op,filters})=>{
  if(op==='update')return {data:{invoice_id:'i'},error:null}
  if(table==='invoice')return {data:{...invoice},error:null}
  if(table==='customer')return {data:{customer_id:'c',fortnox_customer_number:'1',org_number:mode==='accounting'?null:'123'},error:null}
  if(table==='business_config')return {data:{business_name:'Test'},error:null}
  throw Error(table)
 })
 const {syncInvoiceToFortnox}=load('lib/invoices/sync-to-fortnox.ts',{
  '@/lib/fortnox':{isFortnoxConnected:async()=>true,updateFortnoxCustomer:async()=>{},fortnoxRequest:async(b,method,url)=>{if(url.endsWith('/einvoice')&&mode==='einvoice-failed')throw Error('rejected');return {Invoice:{DocumentNumber:'123'}}}},
  '@/lib/invoices/evidence-manifest':{prepareInvoiceManifest:async()=>({}),markInvoiceDelivered:async()=>{delivered++;return {}}},
  '@/lib/observability/driftlarm':{rapporteraTystFel:async()=>{}},
 })
 const result=await syncInvoiceToFortnox(db,{businessId:'b',invoiceId:'i'})
 assert.equal(result.success,true);assert.equal(delivered,mode==='einvoice'?1:0)
})

for(const mode of ['claim-error','claim-lost','stale-pending','receipt-error','provider-uncertain'])test(`Fortnox: ${mode} never silently retries an uncertain write`,async()=>{
 let creates=0
 let stored={invoice_id:'i',customer_id:'c',status:'draft',items:[{description:'Arbete',quantity:1,unit_price:100}],total:125,subtotal:100,vat_amount:25,fortnox_sync_status:mode==='stale-pending'?'pending':null,fortnox_sync_attempted_at:'2020-01-01T00:00:00Z'}
 const db=database(({table,op,value})=>{
  if(op==='update'){
   if(value.fortnox_sync_status==='pending'&&mode==='claim-error')return {data:null,error:{message:'offline'}}
   if(value.fortnox_sync_status==='pending'&&mode==='claim-lost')return {data:null,error:null}
   if(value.fortnox_sync_status==='synced'&&mode==='receipt-error')return {data:null,error:{message:'offline'}}
   Object.assign(stored,value);return {data:{invoice_id:'i'},error:null}
  }
  if(table==='invoice')return {data:{...stored},error:null}
  if(table==='customer')return {data:{customer_id:'c',fortnox_customer_number:'1'},error:null}
  if(table==='business_config')return {data:{business_name:'Test'},error:null}
  throw Error(table)
 })
 const {syncInvoiceToFortnox}=load('lib/invoices/sync-to-fortnox.ts',{
  '@/lib/fortnox':{isFortnoxConnected:async()=>true,fortnoxRequest:async(b,method,url)=>{if(method==='POST'&&url==='/invoices'){creates++;if(mode==='provider-uncertain')throw Error('response lost')}return {Invoice:{DocumentNumber:'123'}}}},
  '@/lib/invoices/evidence-manifest':{prepareInvoiceManifest:async()=>({}),markInvoiceDelivered:async()=>({})},
  '@/lib/observability/driftlarm':{rapporteraTystFel:async()=>{}},
 })
 const result=await syncInvoiceToFortnox(db,{businessId:'b',invoiceId:'i'});assert.equal(result.success,false)
 if(['receipt-error','provider-uncertain'].includes(mode)){
  stored.fortnox_sync_attempted_at='2020-01-01T00:00:00Z'
  const retry=await syncInvoiceToFortnox(db,{businessId:'b',invoiceId:'i'});assert.equal(retry.success,false);assert.equal(creates,1)
 }else assert.equal(creates,0)
})
;(async()=>{let failed=0;for(const c of cases){try{await c.fn();console.log('PASS',c.name)}catch(e){failed++;console.error('FAIL',c.name,e.message)}}assert.equal(failed,0,`${failed} outcome regressions`);console.log(`PASS ${cases.length} actual helper / I-O boundary cases; database and providers mocked`)})().catch(()=>process.exitCode=1)
