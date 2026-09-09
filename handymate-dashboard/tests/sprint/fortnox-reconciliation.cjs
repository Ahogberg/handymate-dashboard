const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
function load(file,mocks={},cache={}) {
 file=path.resolve(file);if(!fs.existsSync(file)&&file.endsWith('.ts'))file=path.join(file.slice(0,-3),'index.ts');if(cache[file])return cache[file].exports
 const mod={exports:{}};cache[file]=mod
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
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
for(const mode of ['matched','legacy-failed','none','substring','duplicate','second-page','changed-pages','missing-meta','too-many-pages','list-error','detail-error','wrong-detail-id','wrong-customer','wrong-total','missing-total','wrong-currency','cancelled','wrong-type','conflicting-number','save-error','save-empty','missing-customer','customer-error','invoice-error','missing-invoice','recent','synced'])test(`reconcile: ${mode}`,async()=>{
 let writes=0,calls=0;const seen=[]
 const invoice={invoice_id:'invoice_1',business_id:'b',customer_id:'c',total:125,fortnox_sync_status:mode==='legacy-failed'?'failed':mode==='synced'?'synced':'pending',fortnox_sync_attempted_at:mode==='recent'?new Date().toISOString():'2020-01-01T00:00:00Z',fortnox_document_number:mode==='conflicting-number'?'999':null}
 const db=database(({table,op,value,filters})=>{
  assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'))
  if(op==='update'){
   writes++;assert.equal(value.fortnox_sync_status,'pending');assert.equal(value.fortnox_document_number,mode==='second-page'?'124':'123');assert.equal(value.status,undefined);assert.equal(value.sent_at,undefined);assert.equal(value.rot_application_status,undefined);assert.equal(value.invoice_number,undefined)
   for(const key of ['invoice_id','customer_id','total','fortnox_sync_status','fortnox_sync_attempted_at','fortnox_document_number','fortnox_invoice_number'])assert(filters.some(f=>f[1]===key),key)
   return {data:mode==='save-empty'?null:{invoice_id:'invoice_1'},error:mode==='save-error'?{}:null}
  }
  if(table==='invoice')return {data:mode==='missing-invoice'?null:{...invoice},error:mode==='invoice-error'?{}:null}
  if(table==='customer')return {data:mode==='missing-customer'?null:{fortnox_customer_number:'7'},error:mode==='customer-error'?{}:null}
  assert.fail(table)
 })
 const lib=load('lib/invoices/reconcile-fortnox.ts',{'@/lib/fortnox':{isFortnoxConnected:async()=>true,fortnoxRequest:async(b,method,url)=>{
  calls++;assert.equal(b,'b');assert.equal(method,'GET');seen.push(url)
  if(url.startsWith('/invoices?')){
   assert(url.includes('externalinvoicereference1=invoice_1'));if(mode==='list-error')throw Error('timeout')
   const second=url.includes('page=2');return {Invoices:mode==='none'?[]:mode==='duplicate'?[{DocumentNumber:'123'},{DocumentNumber:'124'}]:[{DocumentNumber:second?'124':'123'}],MetaInformation:mode==='missing-meta'?undefined:{'@CurrentPage':second?2:1,'@TotalPages':mode==='too-many-pages'?4:mode==='second-page'?2:mode==='changed-pages'?(second?1:2):1}}
  }
  if(mode==='detail-error')throw Error('lost detail')
  return {Invoice:{DocumentNumber:mode==='wrong-detail-id'?'wrong':url.split('/').pop(),ExternalInvoiceReference1:mode==='substring'||(mode==='second-page'&&url.endsWith('123'))?'invoice_1_extra':'invoice_1',CustomerNumber:mode==='wrong-customer'?'8':'7',Total:mode==='wrong-total'?150:mode==='missing-total'?null:'125.00',Currency:mode==='wrong-currency'?'EUR':'SEK',Cancelled:mode==='cancelled',InvoiceType:mode==='wrong-type'?'CASHINVOICE':'INVOICE'}}
 }}})
  const r=await lib.reconcileFortnoxInvoice(db,'b','invoice_1')
  const expected=['matched','legacy-failed','second-page'].includes(mode)?'matched':['none','substring'].includes(mode)?'not_found':mode==='duplicate'?'ambiguous':['save-error','save-empty','recent'].includes(mode)?'conflict':['synced','missing-invoice'].includes(mode)?'not_eligible':['wrong-customer','wrong-total','missing-total','wrong-currency','cancelled','wrong-type','conflicting-number'].includes(mode)?'mismatch':'unavailable'
  assert.equal(r.outcome,expected)
  assert.equal(writes,['matched','legacy-failed','second-page','save-error','save-empty'].includes(mode)?1:0)
 if(['recent','synced','missing-invoice','invoice-error','customer-error','missing-customer'].includes(mode))assert.equal(calls,0)
 if(mode==='second-page')assert(seen.some(url=>url.includes('page=2')))
})
for(const mode of ['failed','linked-pending','receipt-empty','accounting-only'])test(`sync boundary: ${mode}`,async()=>{
 let creates=0,deliveries=0;const calls=[]
 const invoice={invoice_id:'i',customer_id:'c',status:'draft',items:[{description:'Arbete',quantity:1,unit_price:100}],total:125,subtotal:100,vat_amount:25,fortnox_sync_status:mode==='failed'?'failed':mode==='linked-pending'?'pending':null,fortnox_document_number:mode==='linked-pending'?'123':null}
 const db=database(({table,op,value,filters})=>{
  if(op==='update'){
   assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'))
   if(value.fortnox_sync_status==='synced'&&mode==='receipt-empty')return {data:null,error:null}
   if(value.fortnox_sync_status==='pending')assert(filters.some(f=>f[0]==='is'&&f[1]==='fortnox_sync_status'&&f[2]===null))
   return {data:{invoice_id:'i'},error:null}
  }
  if(table==='invoice')return {data:{...invoice},error:null}
  if(table==='customer')return {data:{fortnox_customer_number:'7',org_number:'123'},error:null}
  if(table==='business_config')return {data:{business_name:'Test'},error:null}
  assert.fail(table)
 })
 const lib=load('lib/invoices/sync-to-fortnox.ts',{'@/lib/fortnox':{isFortnoxConnected:async()=>true,updateFortnoxCustomer:async()=>{},fortnoxRequest:async(b,m,url)=>{calls.push(url);if(m==='POST'&&url==='/invoices')creates++;return {Invoice:{DocumentNumber:'123'}}}},'@/lib/invoices/evidence-manifest':{prepareInvoiceManifest:async()=>{},markInvoiceDelivered:async()=>{deliveries++}},'@/lib/observability/driftlarm':{rapporteraTystFel:async()=>{}}})
 const r=await lib.syncInvoiceToFortnox(db,{businessId:'b',invoiceId:'i',allowEInvoice:false})
 assert.equal(r.success,mode==='accounting-only');assert.equal(creates,['failed','linked-pending'].includes(mode)?0:1);assert.equal(deliveries,0);assert(!calls.some(x=>x.endsWith('/einvoice')))
})
for(const routeName of ['reconcile-fortnox','send-via-fortnox'])for(const role of ['owner','employee','inactive','anonymous'])test(`route ${routeName}: ${role}`,async()=>{
 let actions=0
 const route=load(`app/api/invoices/[id]/${routeName}/route.ts`,{'next/server':{NextResponse:Response},'@/lib/auth':{getAuthenticatedBusiness:async()=>role==='anonymous'?null:{business_id:'b'}},'@/lib/permissions':{getCurrentUser:async()=>({is_active:role!=='inactive'}),isOwnerOrAdmin:()=>role==='owner',hasPermission:()=>role==='owner'},'@/lib/supabase':{getServerSupabase:()=>({from:()=>assert.fail('route must not invent delivery')})},'@/lib/invoices/reconcile-fortnox':{reconcileFortnoxInvoice:async(db,b,id)=>{actions++;assert.equal(b,'b');assert.equal(id,'i');return {outcome:'matched'}}},'@/lib/invoices/sync-to-fortnox':{syncInvoiceToFortnox:async(db,p)=>{actions++;assert.equal(p.businessId,'b');assert.equal(p.allowEInvoice,false);return {success:true,fortnoxInvoiceNumber:'123'}}}})
 const r=await route.POST({}, {params:{id:'i'}});assert.equal(r.status,role==='owner'?200:role==='anonymous'?401:403);assert.equal(actions,role==='owner'?1:0)
})
for(const role of ['owner','admin','employee','inactive','foreign'])test(`reconciliation UI renders only for authorized identity: ${role}`,()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
 const ui=load('app/dashboard/invoices/[id]/components/FortnoxReconciliation.tsx',{'@/lib/CurrentUserContext':{useCurrentUser:()=>({user:{id:'u',business_id:role==='foreign'?'other':'b',role:role==='admin'?'admin':role==='employee'?'employee':'owner',is_active:role!=='inactive'}})}})
 const html=renderToStaticMarkup(React.createElement(ui.FortnoxReconciliation,{invoice:{invoice_id:'i',business_id:'b',fortnox_sync_status:'pending',fortnox_document_number:'123'},onChecked:()=>{}}))
 assert.equal(html.includes('Kontrollera i Fortnox'),['owner','admin'].includes(role))
 if(['owner','admin'].includes(role)){assert(html.includes('123'));assert(html.includes('skickar inget till kunden'))}
})
test('invoice screen actually mounts reconciliation component',()=>{
 const tree=ts.createSourceFile('page.tsx',fs.readFileSync('app/dashboard/invoices/[id]/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let mounted=false;function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(tree)==='FortnoxReconciliation')mounted=true;ts.forEachChild(n,visit)}visit(tree);assert(mounted)
})
;(async()=>{let failed=0;for(const {name,fn}of cases){try{await fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e)}}assert.equal(failed,0);console.log(`PASS ${cases.length} Fortnox reconciliation contracts; provider and database mocked`)})().catch(e=>{console.error(e);process.exitCode=1})
