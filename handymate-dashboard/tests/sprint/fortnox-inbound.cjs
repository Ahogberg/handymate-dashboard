const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict')
const { test } = require('node:test')
function load(file, mocks = {}, cache = {}) {
  file = path.resolve(file); if(cache[file]) return cache[file].exports
  const mod = { exports: {} }; cache[file] = mod
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { module: mod, exports: mod.exports, process, console, Buffer, URL, URLSearchParams, Response, AbortSignal, setTimeout, clearTimeout, fetch: mocks.fetch, require(n) {
    if(n in mocks) return mocks[n]
    if(n.startsWith('@/')) return load(n.slice(2)+'.ts',mocks,cache)
    if(n.startsWith('.')) return load(path.resolve(path.dirname(file),n)+'.ts',mocks,cache)
    return require(n)
  } })
  return mod.exports
}
function database(respond) { return { from(table) { let op='read', value, filters=[], range; const q={}
  for(const k of ['select','single','maybeSingle','order']) q[k]=()=>q
  q.range=(...r)=>{range=r;return q}
  for(const k of ['eq','gt','not','is']) q[k]=(...a)=>{filters.push([k,...a]);return q}
  for(const k of ['insert','update','upsert','delete']) q[k]=v=>{op=k;value=v;return q}
  q.then=(yes,no)=>Promise.resolve(respond({table,op,value,filters,range})).then(yes,no); return q
} } }
const lock = { withFortnoxLock: async (_b,_o,work)=>work(async()=>{}) }
const sample = { DocumentNumber:'123', CustomerNumber:'7', Total:125, Net:100, TotalVAT:25, InvoiceDate:'2026-09-14', DueDate:'2026-10-14', Currency:'SEK', Booked:true, InvoiceRows:[{Description:'Arbete',DeliveredQuantity:1,Price:100,VAT:25}] }
for(const scenario of ['new','draft','cancelled','changed','old-linked','pending','read-error','save-error','wrong-id','partial','currency']) test(`inbound: ${scenario}`, async()=>{
  let rows = scenario === 'new' || scenario === 'draft' || scenario === 'cancelled' || scenario === 'partial' ? [] : [{ invoice_id:'local', status:'sent',invoice_type:'final',customer_id:'c',fortnox_document_number:'123',fortnox_sync_status:scenario==='pending'?'pending':'synced',project_id:'job-7',internal_notes:'Bevara',reminder_count:3 }]
  let detail={...sample,Total:250,Net:200,InvoiceRows:[{Description:'Ändrat arbete',DeliveredQuantity:2,Price:100,VAT:25}],...(scenario==='draft'?{Booked:false,Balance:0}:{}),...(scenario==='cancelled'?{Cancelled:true}:{}),...(scenario==='currency'?{Currency:'EUR'}:{})}
  let mutations=0
  const db=database(({table,op,value,filters})=>{
    assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b') || op==='insert')
    if(op==='read') return {data:table==='customer'?{customer_id:'c'}:rows.map(r=>({...r})),error:scenario==='read-error'?{message:'db down'}:null}
    mutations++
    if(scenario==='save-error') return {error:{message:'failed'}}
    if(op==='insert') {assert.equal(value.business_id,'b');rows.push({...value});return {error:null}}
    const row=rows.find(r=>r.invoice_id===filters.find(f=>f[1]==='invoice_id')[2]);Object.assign(row,value);return {data:{invoice_id:row.invoice_id},error:null}
  })
  const lib=load('lib/fortnox/import-invoices.ts',{'@/lib/supabase':{getServerSupabase:()=>db},'./operation-lock':lock,'./api-log':{logFortnoxOperation:async()=>{}},'@/lib/fortnox':{isFortnoxConnected:async()=>true,getFortnoxInvoices:async()=>scenario==='old-linked'?[]:scenario==='partial'?[{DocumentNumber:'123'},{DocumentNumber:'999'}]:[{DocumentNumber:'123'}],getFortnoxInvoice:async(b,n)=>{assert.equal(b,'b');if(n==='999')throw Error('timeout');return {...detail,DocumentNumber:scenario==='wrong-id'?'wrong':n}}}})
  if(scenario==='read-error') {await assert.rejects(lib.importInvoicesForBusiness('b'));assert.equal(mutations,0);return}
  const result=await lib.importInvoicesForBusiness('b')
  const bad=['pending','save-error','wrong-id','partial','currency'].includes(scenario)
  assert.equal(result.success,!bad)
  if(['pending','wrong-id','currency'].includes(scenario)) assert.equal(mutations,0)
  if(scenario==='partial') {assert.equal(result.imported,1);assert.equal(result.errors.length,1)}
  if(['changed','old-linked'].includes(scenario)) {assert.equal(result.updated,1);assert.equal(rows[0].total,250);assert.equal(rows[0].items[0].description,'Ändrat arbete');assert.equal(rows[0].project_id,'job-7');assert.equal(rows[0].internal_notes,'Bevara');assert.equal(rows[0].invoice_type,'final');assert.equal(rows[0].reminder_count,3)}
  if(scenario==='draft') assert.equal(rows[0].status,'draft')
  if(scenario==='cancelled') assert.equal(rows[0].status,'cancelled')
  if(scenario==='new') {assert.equal(result.imported,1);assert.equal(rows[0].fortnox_invoice_number,'123');detail={...detail,DueDate:'2026-11-01'};const again=await lib.importInvoicesForBusiness('b');assert.equal(again.imported,0);assert.equal(again.updated,1);assert.equal(rows.length,1);assert.equal(rows[0].due_date,'2026-11-01');assert.equal(rows[0].reminder_count,0);assert.equal(rows[0].next_reminder_at,undefined)}
})
for(const scenario of ['fresh','expired','parallel','company']) test(`oauth: ${scenario}`,async()=>{
  let creds={fortnox_access_token:'synthetic-access',fortnox_refresh_token:'synthetic-refresh',fortnox_token_expires_at:new Date(Date.now()+(scenario==='fresh'||scenario==='company'?3600000:-1000)).toISOString()},refreshes=0,tail=Promise.resolve()
  const serial={withFortnoxLock:async(b,o,fn)=>{const result=tail.then(()=>fn(async()=>{}));tail=result.catch(()=>{});return result}}
  const db=database(({table,op,value})=>{if(op==='read')return {data:table==='business_integration_credentials'?{...creds}:{fortnox_connected_at:'2026-09-14',fortnox_company_name:'Test'},error:null};if(table==='business_integration_credentials'){assert.equal(op,'upsert');creds={...creds,...value}}return {error:null}})
  const lib=load('lib/fortnox.ts',{'@supabase/supabase-js':{createClient:()=>db},'./fortnox/operation-lock':serial,'@/lib/fortnox/api-log':{logFortnoxApi:async()=>{}},fetch:async(url)=>{if(url.endsWith('/companyinformation'))return new Response(JSON.stringify({CompanyInformation:{CompanyName:'Testföretaget'}}),{status:200});refreshes++;return new Response(JSON.stringify({access_token:'new-synthetic-access',refresh_token:'new-synthetic-refresh',expires_in:3600}),{status:200})}})
  if(scenario==='company') {assert.equal((await lib.getFortnoxCompanyInfo('b')).CompanyName,'Testföretaget');assert.equal(refreshes,0);return}
  const values=await Promise.all(Array.from({length:scenario==='parallel'?5:1},()=>lib.refreshTokenIfNeeded('b')))
  assert.equal(refreshes,scenario==='fresh'?0:1);assert(values.every(v=>v===(scenario==='fresh'?'synthetic-access':'new-synthetic-access')))
})
test('callback never persists original credentials twice',()=>{
  const source=fs.readFileSync('app/api/integrations/fortnox/callback/route.ts','utf8')
  assert.equal((source.match(/await saveFortnoxTokens\(/g)||[]).length,1)
  assert(source.includes('await saveFortnoxCompanyName(businessId, companyInfo.CompanyName)'))
})
for(const scenario of ['success','partial','stamp-error']) test(`whole round: ${scenario}`,async()=>{
  let stamps=0
  const lib=load('lib/fortnox/sync-invoices.ts',{
    './import-invoices':{importInvoicesForBusiness:async()=>({imported:1,updated:2,errors:scenario==='partial'?[{documentNumber:'9',error:'Misslyckades'}]:[]})},
    './sync-payments':{syncFortnoxPaymentsForBusiness:async(b,options)=>{assert.equal(b,'b');assert.equal(options.stamp,false);assert.equal(options.excludeDocumentNumbers.length,scenario==='partial'?1:0);return {checked:3,errors:[]}}},
    '@/lib/supabase':{getServerSupabase:()=>database(({filters})=>{assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b'));stamps++;return {error:scenario==='stamp-error'?{}:null}})}
  })
  const result=await lib.syncInvoicesFromFortnox('b');assert.equal(result.success,scenario==='success');assert.equal(stamps,scenario==='partial'?0:1);assert.equal(result.imported,1);assert.equal(result.updated,2)
})
