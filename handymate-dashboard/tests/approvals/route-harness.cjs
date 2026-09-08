// Executes the real route with an in-memory database and NO network or credentials.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
let row, mutations, canAct = true, availableSlots = [], customerRow, quoteRow, projectRow, bookingRows = []
const campaigns = new Map(), deliveries = [], smsDeliveries = [], bookingPosts = []
const db = { from(table) {
  let values, operation = 'read', filters = []
  const chain = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => {
      const matches = r => filters.every(([k,v]) => k === 'payload' ? JSON.stringify(r[k]) === v : r[k] === v)
      if (operation !== 'read') mutations++
      if (table === 'pending_approvals') {
        if (!matches(row)) return resolve({ data: [], error: null })
        if (operation === 'update') Object.assign(row, structuredClone(values))
        return resolve({ data: operation === 'read' ? structuredClone(row) : [{ id: row.id }], error: null })
      }
      if (table === 'sms_campaign') {
        if (operation === 'read') return resolve({ data: campaigns.get(filters.find(([k]) => k === 'campaign_id')?.[1]) || null, error: null })
        if (operation === 'insert') campaigns.set(values.campaign_id, structuredClone(values))
        if (operation === 'update') Object.assign(campaigns.get(filters.find(([k]) => k === 'campaign_id')[1]), values)
        return resolve({ data: [{ campaign_id: 'x' }], error: null })
      }
      if (table === 'sms_campaign_recipient' && operation === 'insert') deliveries.push(...structuredClone(values))
      if (table === 'customer') return resolve({ data: structuredClone(customerRow), error:null })
      if (table === 'quotes') return resolve({ data: structuredClone(quoteRow), error:null })
      if (table === 'project') return resolve({ data: structuredClone(projectRow), error:null })
      if (table === 'booking') return resolve({ data: filters.some(([key]) => key === 'notes') ? [] : structuredClone(bookingRows), error:null })
      if (table === 'business_config') return resolve({ data: { business_name:'Testfirman', assigned_phone_number:'+468100000', subscription_plan:'pro', working_hours:{monday:{active:true,start:'08:00',end:'17:00'},tuesday:{active:true,start:'08:00',end:'17:00'},wednesday:{active:true,start:'08:00',end:'17:00'},thursday:{active:true,start:'08:00',end:'17:00'},friday:{active:true,start:'08:00',end:'17:00'}} }, error:null })
      return resolve({ data: null, error: null })
    }
    return (...args) => { if (['eq','ilike'].includes(String(key))) filters.push(args); if (key === 'insert' || key === 'update') { operation = key; values = args[0] }; return chain }
  } }); return chain
} }
const cache = {}
function load(file) {
  file = path.resolve(file)
  if (cache[file]) return cache[file]
  const mod = { exports: {} }; cache[file] = mod.exports
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const req = name => {
    if (name.startsWith('node:')) return require(name)
    if (name === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } }
    if (name === '@/lib/supabase') return { getServerSupabase: () => db }
    if (name === '@/lib/auth') return { getAuthenticatedBusiness: async () => ({ business_id: 'b1' }), getBusinessPlanFromConfig: () => 'pro' }
    if (name === '@/lib/permissions') return { getCurrentUser: async () => ({ id: 'u1' }) }
    if (name === '@/lib/sms-send') return { sendSmsViaElks: async ({supabase,...args}) => { smsDeliveries.push(structuredClone(args)); return { success:true, smsId:'sms-site', elksId:'elks-site', status:200 } } }
    if (name === '@/lib/sms-usage') return { checkSmsAllowance: async () => ({ allowed:true }) }
    if (name === '@/lib/matte/calendar-slots') return { getAvailableSlots: async () => structuredClone(availableSlots) }
    if (name === '@/lib/customers/namn') return { halsning: name => `Hej ${String(name || '').split(' ')[0]}!` }
    if (name === '@/lib/sms-reply-number') return { buildSmsSuffix: name => `//${name}` }
    if (name.startsWith('@/lib/bookings/')) return load(path.join(root, name.slice(2)+'.ts'))
    if (name === '@/lib/approvals/routing') return { canActOnApproval: async () => canAct }
    if (name === '@/lib/agent/learning-engine') return { recordLearningEvent: async () => ({ success: true }) }
    if (name === '@/lib/autonomy/earned-autonomy') return { autonomyKeyFromApproval: () => null }
    if (name.startsWith('@/lib/approvals/')) return load(path.join(root, name.slice(2)+'.ts'))
    if (name.startsWith('./')) return load(path.resolve(path.dirname(file),name+'.ts'))
    return new Proxy({}, { get: (_, key) => () => { throw Error(`Unexpected effect: ${name}.${String(key)}`) } })
  }
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: req, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-only' } },
    console, Buffer, Date, fetch: async (url,init) => { if (!String(url).endsWith('/api/bookings')) throw Error('Network is forbidden in this harness'); const body=JSON.parse(init.body); bookingPosts.push(body); return Response.json({ success:true, booking:{booking_id:'book-new'} }) } }, { filename: file })
  cache[file] = mod.exports; return mod.exports
}
const { POST } = load(path.join(root,'app/api/approvals/[id]/route.ts'))
const reset = () => { row = { id: 'a1', business_id: 'b1', approval_type: 'seasonal_campaign', title: 'Höst', status: 'pending', payload: { sms_text: 'Hej kund', customers: [{ customer_id: 'c1', phone_number: '+46701234567' }] } }; mutations = 0; canAct = true; campaigns.clear(); deliveries.length=0; smsDeliveries.length=0; bookingPosts.length=0; availableSlots=[]; customerRow={ customer_id:'c-site', name:'Anna Andersson', phone_number:'+46709999999' }; quoteRow={quote_id:'q1',title:'Badrum',status:'accepted',customer_id:'c-site'}; projectRow={project_id:'p1',name:'Badrum hemma'}; bookingRows=[] }
const post = body => POST({ json: async () => body, headers: new Headers() }, { params: { id:'a1' } })
;(async () => {
  reset()
  for (const action of ['approve','edit','retry']) { assert.equal((await post({action})).status,428); assert.equal(mutations,0) }
  canAct=false; assert.equal((await post({ action:'preview',decision_action:'approve' })).status,403); assert.equal(mutations,0); canAct=true
  const preview = await (await post({action:'preview', decision_action:'edit',edited_payload:{sms_text:'Min granskade text'}})).json()
  assert.equal(mutations,0); assert.equal(preview.review.messages[0].text,'Min granskade text')
  const body = { action:'edit',edited_payload:{sms_text:'Min granskade text'},review_token:preview.review_token }
  const response = await post(body); assert.equal(response.status,200)
  const result = await response.json(); assert.equal(result.execution.queued,true); assert.equal(row.status,'approved')
  assert.equal([...campaigns.values()][0].message, 'Min granskade text'); assert.equal(deliveries.length,1)
  assert.equal(deliveries[0].phone_number,preview.review.messages[0].recipients[0])
  await post(body); assert.equal(deliveries.length,1); assert.equal(campaigns.size,1)
  reset(); row.approval_type='four_eyes_project_close'; assert.equal((await post({action:'approve'})).status,422); assert.equal(mutations,0); assert.equal(row.status,'pending')
  reset(); row.approval_type='propose_site_visit'; row.payload={entity:{customerId:'c-site',customerName:'Fel namn',phone:'+46709999999'},duration_hours:1,responsible_name:'Erik'}
  availableSlots=[{start:'2026-09-09T08:00:00Z',end:'2026-09-09T09:00:00Z',label:'onsdag 9 sep kl 10:00–11:00'}]
  let sitePreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert(sitePreview.review?.messages?.[0],JSON.stringify(sitePreview)); assert.equal(smsDeliveries.length,0); assert.equal(sitePreview.review.messages[0].recipients[0],'+46709999999'); assert(sitePreview.review.messages[0].text.includes('onsdag 9 sep'))
  assert(sitePreview.review.details.some(d=>d.label==='Ansvarig'&&d.text==='Erik')); assert(sitePreview.review.effect.includes('Ingen kalender'))
  availableSlots=[{start:'2026-09-10T12:00:00Z',end:'2026-09-10T13:00:00Z',label:'torsdag 10 sep kl 14:00–15:00'}]
  assert.equal((await post({action:'approve',review_token:sitePreview.review_token})).status,428); assert.equal(smsDeliveries.length,0)
  sitePreview=await (await post({action:'preview',decision_action:'approve'})).json()
  const siteResult=await (await post({action:'approve',review_token:sitePreview.review_token})).json()
  assert.equal(smsDeliveries.length,1,JSON.stringify(siteResult)); assert.equal(smsDeliveries[0].message,sitePreview.review.messages[0].text); assert.equal(smsDeliveries[0].to,sitePreview.review.messages[0].recipients[0])
  assert.deepEqual(row.payload.execution_result.review_evidence.slots,availableSlots); assert.equal(siteResult.receipt.state,'sent')
  reset(); row.approval_type='propose_site_visit'; row.payload={entity:{customerId:'c-site',phone:'+46701111111'},customer_reply_pending:'Färdig text'}
  assert.equal((await post({action:'preview',decision_action:'approve'})).status,422); assert.equal(smsDeliveries.length,0)
  reset(); row.approval_type='propose_site_visit'; row.payload={entity:{customerId:'c-site',phone:'+46709999999'}}; customerRow=null
  assert.equal((await post({action:'preview',decision_action:'approve'})).status,422); assert.equal(smsDeliveries.length,0)
  reset(); row.approval_type='propose_site_visit'; row.payload={entity:{customerId:'c-site',phone:'+46709999999'}}
  assert.equal((await post({action:'preview',decision_action:'approve'})).status,422); assert.equal(smsDeliveries.length,0)
  reset(); row.approval_type='new_booking_request'; row.payload={source:'quote_signing',quote_id:'q1',customer_id:'c-site',customer_phone:'+46709999999',requested_date:'2030-09-10'}
  bookingRows=[{scheduled_start:'2030-09-10T06:00:00.000Z',scheduled_end:'2030-09-10T07:00:00.000Z',status:null}]
  let bookingPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert(bookingPreview.review?.messages?.[0],JSON.stringify(bookingPreview)); assert.equal(bookingPosts.length,0); assert(bookingPreview.review.effect.includes('Ingen faktura'))
  assert(bookingPreview.review.details.some(d=>d.label==='Bokad start'&&d.text==='2030-09-10T07:00:00.000Z'))
  const evidence=bookingPreview.review.details; assert(evidence.some(d=>d.label==='Projektföljd'&&d.text.includes('Badrum hemma'))); assert(evidence.some(d=>d.label==='Kundbekräftelse'))
  const bookingResult=await (await post({action:'approve',review_token:bookingPreview.review_token})).json()
  assert.equal(bookingPosts.length,1,JSON.stringify(bookingResult)); assert.equal(bookingPosts[0].scheduled_start,row.payload.execution_result.review_evidence.scheduledStart); assert.equal(bookingPosts[0].scheduled_end,row.payload.execution_result.review_evidence.scheduledEnd)
  assert.equal(smsDeliveries.at(-1).message,bookingPreview.review.messages[0].text); assert.equal(bookingResult.receipt.state,'saved')
  reset(); row.approval_type='new_booking_request'; row.payload={source:'quote_signing',quote_id:'q1',customer_id:'c-site',customer_phone:'+46709999999',requested_date:'2030-09-10'}; quoteRow.status='draft'
  assert.equal((await post({action:'preview',decision_action:'approve'})).status,422); assert.equal(bookingPosts.length,0)
  console.log('PASS route integration: exact campaign queue, hidden invoice block, site-visit times, and signed-quote booking/SMS are review-bound with durable evidence.')
})().catch(e => { console.error(e); process.exitCode=1 })
