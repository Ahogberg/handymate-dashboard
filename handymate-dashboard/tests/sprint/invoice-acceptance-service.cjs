const {load,database}=require('./integrity-loader.cjs'),assert=require('node:assert/strict'),fs=require('node:fs')
const cases=[];const test=(name,fn)=>cases.push([name,fn])
for(const mode of ['false','throw','skipped','sent','receipt-lost','recovery','missing-journal'])test(`acceptance actual helper: ${mode}`,async()=>{
 let sends=0,projects=0;const journal={project_state:'pending',deal_state:'pending',email_state:'pending'}
 const db=database(({table})=>({data:table==='quote_acceptance_completion'?journal:null,error:null}))
 db.rpc=async(name,p)=>{
  if(mode==='missing-journal')return {data:null,error:{message:'missing journal'}}
  const field=p.p_step+'_state'
  if(name==='claim_quote_acceptance_step'){
   if(['done','skipped','running','uncertain'].includes(journal[field]))return {data:null,error:null}
   journal[field]='running';return {data:'token',error:null}
  }
  if(mode==='receipt-lost'&&p.p_step==='email')return {data:null,error:{message:'database unavailable'}}
  journal[field]=p.p_state;return {data:true,error:null}
 }
 const {finalizeAcceptedQuote}=load('lib/quotes/finalize-accepted.ts',{
  '@/lib/quote-confirmation-email':{sendQuoteSignedConfirmation:async()=>{sends++;if(mode==='throw')throw Error('response lost');return {success:mode!=='false',skipped:mode==='skipped'}}},
  '@/lib/projects/create-from-quote':{createProjectFromQuote:async()=>{projects++;return {success:true,project_id:'p'}}},
  '@/lib/demo/demo-quote':{arDemoOffertForetag:()=>false},
 })
 const input={businessId:'b',quoteId:'q',source:'kundportal',recoveryOnly:mode==='recovery'}
 const first=await finalizeAcceptedQuote(db,input);await finalizeAcceptedQuote(db,input)
 assert.equal(first.confirmationSent,mode==='sent');assert.equal(sends,['recovery','missing-journal'].includes(mode)?0:1)
 assert.equal(projects,mode==='missing-journal'?0:1);assert.equal(first.dealMoved,false)
})
for(const role of ['owner','admin','employee','inactive','anonymous'])test(`acceptance recovery HTTP permissions: ${role}`,async()=>{
 let dbCalls=0,resumes=0
 const db=database(({table,filters})=>{dbCalls++;assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'));return {data:table==='quotes'?{quote_id:'q',status:'accepted'}:[],error:null}})
 const route=load('app/api/quotes/acceptance-recovery/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
  '@/lib/auth':{getAuthenticatedBusiness:async()=>role==='anonymous'?null:{business_id:'b'}},
  '@/lib/permissions':{getCurrentUser:async()=>({is_active:role!=='inactive',role}),isOwnerOrAdmin:u=>['owner','admin'].includes(u.role)},
  '@/lib/supabase':{getServerSupabase:()=>db},
  '@/lib/quotes/finalize-accepted':{finalizeAcceptedQuote:async(db,input)=>{resumes++;assert.equal(input.businessId,'b');assert.equal(input.recoveryOnly,true);return {}}},
 })
 const expected=['owner','admin'].includes(role)?200:role==='anonymous'?401:403
 assert.equal((await route.GET({})).status,expected);assert.equal((await route.POST({json:async()=>({quote_id:'q'})})).status,expected)
 if(expected!==200){assert.equal(dbCalls,0);assert.equal(resumes,0)}
})
for(const mode of ['conflict','missing-rpc','empty','saved','replay'])test(`atomic createInvoice boundary: ${mode}`,async()=>{
 let inserts=0,request
 const db={from(){inserts++;throw Error('unprotected insert')},rpc:async(name,p)=>{
  if(name==='next_invoice_number')return {data:{num:1,prefix:'FV'},error:null}
  request=p
  if(['conflict','missing-rpc'].includes(mode))return {error:{message:mode},data:null}
  if(mode==='empty')return {error:null,data:null}
  return {error:null,data:{invoice_id:mode==='replay'?'original':'new',business_id:'b',invoice_number:'FV-1',ocr_number:'1'}}
 }}
 const {createInvoice}=load('lib/invoices/create-invoice.ts')
 const input={businessId:'b',customerId:'c',projectId:'p',items:[{id:'generated',quantity:1,total:100}],subtotal:100,vatAmount:25,total:125,sources:{timeEntryIds:['t']},extraFields:{invoice_id:'candidate'}}
 if(['saved','replay'].includes(mode))assert.equal((await createInvoice(db,input)).invoice.invoice_id,mode==='replay'?'original':'new')
 else await assert.rejects(()=>createInvoice(db,input))
 assert.equal(inserts,0);assert.equal(request.p_times[0],'t');assert.equal(request.p_intent.items[0].id,undefined);assert.equal(request.p_intent.extraFields.invoice_id,undefined)
})
test('actual invoice route cannot return success when atomic source claim fails',async()=>{
 let sourceCall=false
 const route=load('app/api/invoices/from-project/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
  '@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'b'})},
  '@/lib/supabase':{getServerSupabase:()=>database(({table})=>({data:table==='project'?{project_id:'p',customer_id:'c'}:{},error:null}))},
  '@/lib/permissions':{getCurrentUser:async()=>({id:'u'}),hasPermission:()=>true},
  '@/lib/rot-rut-limits':{},'@/lib/rot-rut':{},'@/lib/observability/driftlarm':{},
  '@/lib/invoices/create-invoice':{createInvoice:async(db,input)=>{assert.equal(input.sources.timeEntryIds[0],'t');sourceCall=true;throw Error('invoice_source_conflict')}},
 })
 const result=await route.POST({json:async()=>({project_id:'p',customer_id:'c',items:[{total:100}],source_time_entry_ids:['t']})})
 assert(sourceCall);assert.notEqual(result.status,200);assert.equal(result.body.invoice_id,undefined)
})
test('every source-backed creator passes ownership into the shared transaction',()=>{
 for(const file of ['app/api/invoices/from-project/route.ts','app/api/invoices/from-time-entries/route.ts','app/api/invoices/route.ts','app/api/invoices/auto-generate/route.ts','app/api/projects/[id]/create-final-invoice/route.ts','lib/projects/auto-invoice-on-complete.ts','app/api/revenue-review/[id]/route.ts','app/api/approvals/[id]/route.ts','lib/e2e-deal-flow.ts']){
  const text=fs.readFileSync(file,'utf8');assert.match(text,/await createInvoice\([\s\S]*?sources:/,file)
 }
 assert.match(fs.readFileSync('app/dashboard/pipeline/page.tsx','utf8'),/<AcceptanceRecoveryPanel key=/)
})
test('recovery UI renders blocked steps and never offers an uncertain resend',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
 const rows=[{quote_id:'q',project_state:'failed',deal_state:'done',email_state:'uncertain'}]
 const component=load('components/AcceptanceRecoveryPanel.tsx',{'react':{...React,useState:initial=>[Array.isArray(initial)?rows:initial,()=>{}],useRef:value=>({current:value}),useEffect:()=>{}}}).default
 const html=renderToStaticMarkup(component({onRecovered:()=>{}}))
 assert(html.includes('Slutför projekt och affär'));assert(html.includes('Mejlkvittensen är osäker'));assert(!html.includes('Skicka igen'))
 assert(html.includes('/dashboard/quotes/q'))
})
;(async()=>{for(const [name,fn] of cases){let timer;try{await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timed out: '+name)),10000)})]);console.log('PASS',name)}finally{clearTimeout(timer)}}console.log(`PASS ${cases.length} invoice/acceptance service and route contracts; external services mocked`)})().catch(e=>{console.error(e);process.exitCode=1})
