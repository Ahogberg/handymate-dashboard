// Actual payload -> POST route -> canonical writer -> GET -> edit mapper.
// Only database, identity and external services are isolated. No provider sends.
const assert = require('node:assert/strict')
const { load } = require('./onboarding-completion.cjs')
async function modules() {
  const snapshot = await load('lib/products/build-item-snapshot.ts', {})
  const rot = await load('lib/rot-rut.ts', {})
  const calc = await load('lib/quote-calculations.ts', {
    '@/lib/types/quote': { QuoteItem:null, PaymentPlanEntry:null, QuoteTotals:null, RotRutType:null },
    '@/lib/products/build-item-snapshot': snapshot, '@/lib/rot-rut': rot,
  })
  const generated = await load('lib/quotes/generated-to-quote-items.ts', { '@/lib/quote-calculations':calc })
  const mapper = await load('app/dashboard/quotes/_shared/loadEditQuote.ts', {
    '@/lib/quote-calculations':calc, '@/lib/quotes/generated-to-quote-items':generated,
  })
  const storage = { extractStoragePath:()=>null, signAttachmentList:async(_db,_bucket,rows)=>rows }
  const payload = await load('app/dashboard/quotes/_shared/buildQuotePayload.ts', { '@/lib/quote-calculations':calc, '@/lib/storage-signing':storage })
  const writer = await load('lib/quotes/create-quote.ts', {})
  const cap = await load('lib/quotes/apply-annual-cap.ts', { '@/lib/rot-rut-limits':{calculateCappedDeduction:()=>{throw Error('Unexpected annual-cap query')}} })
  const reference = await load('lib/quotes/resolve-reference-person.ts', {})
  const validity = await load('lib/quotes/validity.ts', {})
  return {calc,mapper,storage,payload,writer,cap,reference,validity}
}
function database(state) {
  return {from(table) {
    let op='read',value,fields,filters=[],one=false
    const q={select(s){fields=s;return q},eq(k,v){filters.push([k,v]);return q},gte(){return q},not(){return q},order(){return q},limit(){return q},or(){return q},is(){return q},in(){return q},
      insert(v){op='insert';value=v;return q},delete(){op='delete';return q},
      single(){one=true;return Promise.resolve(result())},maybeSingle(){one=true;return Promise.resolve(result())},
      then(a,b){return Promise.resolve(result()).then(a,b)}}
    function result() {
      if(state.fail===`${table}:${op}`)return {data:null,error:{message:'injected database interruption'}}
      const matches=r=>filters.every(([k,v])=>r[k]===v)
      state.tables[table] ||= []
      if(op==='insert') {const rows=structuredClone(Array.isArray(value)?value:[value]);state.tables[table].push(...rows);return {data:one?rows[0]:rows,error:null}}
      if(op==='delete') {state.tables[table]=state.tables[table].filter(r=>!matches(r));return {data:null,error:null}}
      const rows=state.tables[table].filter(matches).map(r=>structuredClone(r))
      return {data:one?(rows[0]||null):rows,error:null}
    }
    return q
  }}
}
async function harness(m) {
  const state={tables:{},tenant:'biz_first',denied:false,fail:null}
  const db=database(state)
  const api=await load('app/api/quotes/route.ts',{
    'next/server':{NextRequest:Request,NextResponse:Response},'@/lib/supabase':{getServerSupabase:()=>db},
    '@/lib/auth':{getAuthenticatedBusiness:async()=>state.denied?null:{business_id:state.tenant}},
    '@/lib/permissions':{getCurrentUser:async()=>({id:'owner',name:'Test Owner'}),hasPermission:()=>!state.noPermission},
    '@/lib/quote-calculations':m.calc,'@/lib/quotes/apply-annual-cap':m.cap,'@/lib/quotes/resolve-reference-person':m.reference,
    '@/lib/quotes/lifecycle':{lockedChanges:()=>{throw Error('Unexpected edit')},lockedChangeMessage:()=>''},
    '@/lib/quotes/create-quote':m.writer,'@/lib/quotes/validity':m.validity,'@/lib/storage-signing':m.storage,
  })
  const post=body=>api.POST(new Request('https://unit.invalid/api/quotes',{method:'POST',body:JSON.stringify(body)}))
  const get=id=>{const nextUrl=new URL(`https://unit.invalid/api/quotes?quoteId=${id}`);return api.GET({nextUrl})}
  return {state,post,get}
}
function context() {
  return {mode:'create',selectedCustomer:'',title:'Första serviceofferten',description:'Service',vatRate:25,discountPercent:0,
    items:[{id:'row_work',item_type:'item',description:'Arbetstid',quantity:4,unit:'tim',unit_price:950,linked_product_id:'work'},
      {id:'row_trip',item_type:'item',description:'Framkörning',quantity:1,unit:'st',unit_price:495,linked_product_id:'trip'},
      {id:'row_material',item_type:'item',description:'Material',quantity:1,unit:'st',unit_price:325,linked_product_id:'material'}],
    reservationsSnapshot:[{reservation_id:'access',title:'Tillträde',content:'Fri tillgång till arbetsplatsen.'}],
    paymentPlan:[],calculatedPaymentPlan:[],paymentPlanValid:true,templateId:'tpl_service',quoteJobType:'service',
    templateStyle:'modern',attachments:[],hasRotItems:false,hasRutItems:false,validDays:30}
}
const tests=[];const test=(name,fn)=>tests.push([name,fn])
test('priced first draft survives actual POST, writer, GET and edit mapping',async m=>{
  const h=await harness(m), payload=m.payload.buildQuotePayload(context())
  const res=await h.post(payload);assert.equal(res.status,200);const {quote}=await res.json()
  assert.equal(quote.status,'draft');assert.equal(quote.sent_at,null);assert.equal(quote.total,5775)
  assert.equal(quote.template_id,'tpl_service');assert.equal(quote.job_type,'service');assert(quote.sign_token);assert(quote.quote_number)
  const before=global.fetch
  try {global.fetch=()=>h.get(quote.quote_id);const reopened=await m.mapper.fetchQuoteForEdit(quote.quote_id)
    assert.deepEqual(reopened.items.map(i=>i.unit_price),[950,495,325]);assert.deepEqual(reopened.items.map(i=>i.linked_product_id),['work','trip','material'])
    assert.deepEqual(reopened.loadedReservations,payload.reservations_snapshot)
  } finally {global.fetch=before}
})
test('failed row save returns failure, removes incomplete draft, and can retry',async m=>{
  const h=await harness(m), payload=m.payload.buildQuotePayload(context());h.state.fail='quote_items:insert'
  assert.equal((await h.post(payload)).status,500);assert.equal(h.state.tables.quotes.length,0)
  h.state.fail=null;assert.equal((await h.post(payload)).status,200);assert.equal(h.state.tables.quotes.length,1);assert.equal(h.state.tables.quote_items.length,3)
})
test('row read interruption cannot become an empty editable quote; retry recovers saved rows',async m=>{
  const h=await harness(m);const {quote}=await(await h.post(m.payload.buildQuotePayload(context()))).json()
  const before=global.fetch
  try {global.fetch=()=>h.get(quote.quote_id);h.state.fail='quote_items:read';assert.equal((await h.get(quote.quote_id)).status,503)
    await assert.rejects(()=>m.mapper.fetchQuoteForEdit(quote.quote_id),/503/)
    h.state.fail=null;assert.equal((await m.mapper.fetchQuoteForEdit(quote.quote_id)).items.length,3)
  } finally {global.fetch=before}
})
test('failed quote read is unavailable, foreign-tenant quote is not found',async m=>{
  const h=await harness(m);const {quote}=await(await h.post(m.payload.buildQuotePayload(context()))).json()
  h.state.fail='quotes:read';assert.equal((await h.get(quote.quote_id)).status,503)
  h.state.fail=null;h.state.tenant='biz_other';assert.equal((await h.get(quote.quote_id)).status,404)
})
test('missing login or create permission cannot save the first quote',async m=>{
  for(const [field,status] of [['denied',401],['noPermission',403]]) {const h=await harness(m);h.state[field]=true
    assert.equal((await h.post(m.payload.buildQuotePayload(context()))).status,status);assert.deepEqual(h.state.tables,{})}
})
test('creation cannot claim sent or accepted without actual delivery/decision',async m=>{
  for(const status of ['sent','accepted']) {const h=await harness(m)
    assert.equal((await h.post({...m.payload.buildQuotePayload(context()),status})).status,400);assert.deepEqual(h.state.tables,{})}
})
;(async()=>{const m=await modules();for(const [name,fn] of tests){await fn(m);console.log('PASS',name)}console.log(`PASS ${tests.length} first-quote persistence contracts; database isolated, no live/browser proof`)})().catch(e=>{console.error(e);process.exitCode=1})
