// Executes the real route with an in-memory database and NO network or credentials.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
let row, mutations, canAct = true, availableSlots = [], customerRow, leadRow, quoteRow, invoiceRow, projectRow, dealRow, memberRow, bookingRows = [], smsShouldFail = false, smsUnknown = false
const campaigns = new Map(), deliveries = [], smsDeliveries = [], bookingPosts = [], completionCalls = [], paymentCalls = [], leadActivationCalls = [], automationCalls = [], artifactCalls = []
const db = { from(table) {
  let values, operation = 'read', filters = []
  const chain = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => {
      const matches = r => filters.every(([k,v]) => ['payload','package_data'].includes(k) ? JSON.stringify(r[k]) === v : r[k] === v)
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
      if (table === 'customer') {
        const wanted = filters.find(([key]) => key === 'customer_id')?.[1]
        return resolve({ data: !wanted || customerRow?.customer_id === wanted ? structuredClone(customerRow) : null, error:null })
      }
      if (table === 'leads') {
        const wanted = filters.find(([key]) => key === 'lead_id')?.[1]
        const wantedBusiness = filters.find(([key]) => key === 'business_id')?.[1]
        return resolve({ data: (!wanted || leadRow?.lead_id === wanted) && (!wantedBusiness || leadRow?.business_id === wantedBusiness) ? structuredClone(leadRow) : null, error:null })
      }
      if (table === 'quotes') return resolve({ data: structuredClone(quoteRow), error:null })
      if (table === 'invoice') return resolve({ data: structuredClone(invoiceRow), error:null })
      if (table === 'project') return resolve({ data: structuredClone(projectRow), error:null })
      if (table === 'deal') return resolve({ data: structuredClone(dealRow), error:null })
      if (table === 'business_users') return resolve({ data: structuredClone(memberRow), error:null })
      if (table === 'booking') {
        const notePattern = filters.find(([key]) => key === 'notes')?.[1]
        if (notePattern) { const needle=String(notePattern).replaceAll('%',''); return resolve({ data: structuredClone(bookingRows.filter(item=>String(item.notes||'').includes(needle))), error:null }) }
        const wanted = filters.find(([key]) => key === 'booking_id')?.[1]
        return resolve({ data: wanted ? structuredClone(bookingRows.find(item => item.booking_id === wanted) || null) : structuredClone(bookingRows), error:null })
      }
      if (table === 'business_config') return resolve({ data: { business_name:'Testfirman', assigned_phone_number:'+468100000', personal_phone:'+46708888888', google_review_url:'https://example.test/review', subscription_plan:'pro', working_hours:{monday:{active:true,start:'08:00',end:'17:00'},tuesday:{active:true,start:'08:00',end:'17:00'},wednesday:{active:true,start:'08:00',end:'17:00'},thursday:{active:true,start:'08:00',end:'17:00'},friday:{active:true,start:'08:00',end:'17:00'}} }, error:null })
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
    if (name === '@/lib/sms-send') return { sendSmsViaElks: async ({supabase,...args}) => { smsDeliveries.push(structuredClone(args)); return smsUnknown ? { success:false, error:'provider response lost', status:null } : smsShouldFail ? { success:false, error:'provider rejected', status:503 } : { success:true, smsId:'sms-site', elksId:'elks-site', status:200 } } }
    if (name === '@/lib/sms-usage') return { checkSmsAllowance: async () => ({ allowed:true }) }
    if (name === '@/lib/matte/calendar-slots') return { getAvailableSlots: async () => structuredClone(availableSlots) }
    if (name === '@/lib/invoices/project-invoice-draft') return { byggProjektFakturaUnderlag: async () => ({ ok:true, project:{ project_id:'p1',customer_id:'c-site',quote_id:'q1' }, items:[{description:'Arbete',quantity:10,unit:'tim',unit_price:800,total:8000}], subtotal:8000,vatRate:25,vatAmount:2000,total:10000,rotRutType:'rot',rotRutDeduction:3000,customerPays:7000,hasAta:false,ataChangeIds:[] }) }
    if (name === '@/lib/invoices/apply-payment') return { applyInvoicePayment: async args => { paymentCalls.push(structuredClone(args)); return {ok:true,transition:'to_customer_paid',remaining_rot_kr:3000,effects:[{effect:'workflows',status:args.approvalFollowUps.updateWorkflows?'succeeded':'skipped'},{effect:'customer_messages',status:args.approvalFollowUps.prepareCustomerMessages?'succeeded':'skipped',message:args.approvalFollowUps.prepareCustomerMessages?'Separata granskningskort skapade':'Valdes bort'},{effect:'payment_received_rules',status:args.approvalFollowUps.runAutomationRules?'succeeded':'skipped'}]} } }
    if (name === '@/lib/leads/golden-path') return { activatePendingLead: async (leadId,_db,options) => { leadActivationCalls.push({leadId,options:structuredClone(options)}); return {dealId:options.createDeal?'deal1':null,dealError:null,effects:[{effect:'lead_status',status:'succeeded',message:'Status ändrad till ny'},{effect:'deal',status:options.createDeal?'succeeded':'skipped'},{effect:'internal_sms',status:options.prepareInternalSms?'succeeded':'skipped',approval_id:options.prepareInternalSms?'child-sms':undefined},{effect:'lead_received_rules',status:options.runAutomationRules?'succeeded':'skipped'}]} } }
    if (name === '@/lib/automation-engine') return { runApprovedAutomationAction: async (...args) => { automationCalls.push({businessId:args[1],actionType:args[2],config:structuredClone(args[3]),context:structuredClone(args[4])}); return {success:true,data:{lead_id:args[4].lead_id,status:'lost'}} } }
    if (name === '@/lib/approvals/artifact-write') return { insertApprovalArtifact: async (...args) => { artifactCalls.push({table:args[1],purpose:args[5],values:structuredClone(args[6])}); return {data:{id:`child-${artifactCalls.length}`},error:null} } }
    if (name === '@/lib/invoices/payment-decision') return load(path.join(root, name.slice(2)+'.ts'))
    if (name === '@/lib/projects/complete-project') return { completeProject: async args => { completionCalls.push(structuredClone({businessId:args.businessId,projectId:args.projectId,authorization:args.authorization,options:args.options})); const chosen=args.options; return { ok:true,completed:true,transitioned:true,already_completed:false,requires_approval:false,project:{project_id:'p1'},invoice_created:chosen.createInvoiceDraft?{invoice_id:'inv1',invoice_number:'1001',total:10000,status:'draft'}:null,effects:[{effect:'workflow_stage',status:'succeeded'},{effect:'auto_invoice',status:chosen.createInvoiceDraft?'succeeded':'skipped',message:chosen.createInvoiceDraft?undefined:'Fakturautkast valdes bort i granskningen'},{effect:'review_request',status:chosen.createReviewRequest?'succeeded':'skipped',message:chosen.createReviewRequest?undefined:'Kunduppföljning valdes bort i granskningen'},{effect:'job_completed_event',status:chosen.runAutomations?'attempted':'skipped'}],warnings:[] } } }
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
    console, Buffer, Date, fetch: async (url,init) => { if (!String(url).endsWith('/api/bookings')) throw Error('Network is forbidden in this harness'); const body=JSON.parse(init.body); bookingPosts.push(body); bookingRows.push({...body,booking_id:'book-new'}); return Response.json({ success:true, booking:{booking_id:'book-new'} }) } }, { filename: file })
  cache[file] = mod.exports; return mod.exports
}
const { POST } = load(path.join(root,'app/api/approvals/[id]/route.ts'))
const reset = () => { row = { id: 'a1', business_id: 'b1', approval_type: 'seasonal_campaign', title: 'Höst', status: 'pending', payload: { sms_text: 'Hej kund', customers: [{ customer_id: 'c1', phone_number: '+46701234567' }] } }; mutations = 0; canAct = true; campaigns.clear(); deliveries.length=0; smsDeliveries.length=0; bookingPosts.length=0; completionCalls.length=0; paymentCalls.length=0; leadActivationCalls.length=0; automationCalls.length=0; artifactCalls.length=0; smsShouldFail=false; smsUnknown=false; availableSlots=[]; customerRow={ customer_id:'c-site', name:'Anna Andersson', phone_number:'+46709999999',email:'anna@example.test',portal_token:'portal-1',portal_enabled:true,review_request_sent_at:null }; leadRow={lead_id:'l-site',business_id:'b1',customer_id:'c-site',name:'Leo Lead',phone:'+46707777777',email:'leo@example.test',notes:'Renovera hall',source:'email_forward',status:'pending_review',updated_at:'2026-09-08T01:00:00Z'}; quoteRow={quote_id:'q1',title:'Badrum',status:'accepted',customer_id:'c-site'}; invoiceRow={invoice_id:'inv1',invoice_number:'1001',fortnox_invoice_number:null,status:'sent',customer_id:'c-site',project_id:'p1',total:10000,rot_rut_type:'rot',rot_rut_deduction:3000,customer_pays:7000,paid_amount:null,paid_at:null}; projectRow={project_id:'p1',name:'Badrum hemma',status:'active',customer_id:'c-site',quote_id:'q1',lead_id:'l1'}; dealRow={id:'deal1',title:'Hallrenovering',stage_id:'stage1',assigned_to:'member1'}; memberRow={id:'member1',name:'Erik'}; bookingRows=[] }
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
  reset(); row.approval_type='confirm_payment'; row.payload={invoice_id:'inv1',invoice_number:'1001',customer_id:'c-site',total:10000}
  let paymentPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert.equal(paymentPreview.review.choices.length,3); assert(paymentPreview.review.details.some(d=>d.label==='Registreras som betalt'&&d.text==='7 000 kr'))
  assert(paymentPreview.review.details.some(d=>d.label==='Återstår från Skatteverket'&&d.text==='3 000 kr')); assert(paymentPreview.review.effect.includes('Inget kundmeddelande skickas'))
  invoiceRow.total=11000
  assert.equal((await post({action:'approve',review_token:paymentPreview.review_token})).status,422); assert.equal(paymentCalls.length,0)
  invoiceRow.total=10000; paymentPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  const paymentResponse=await post({action:'approve',review_token:paymentPreview.review_token,action_overrides:{update_workflows:'approved',prepare_customer_messages:'approved',run_automation_rules:'rejected'}})
  const paymentResult=await paymentResponse.json(); assert.equal(paymentResponse.status,200,JSON.stringify(paymentResult)); assert.equal(paymentCalls.length,1)
  assert.deepEqual(paymentCalls[0].approvalFollowUps,{approvalId:'a1',updateWorkflows:true,prepareCustomerMessages:true,runAutomationRules:false})
  assert.equal(paymentResult.receipt.state,'saved'); assert(paymentResult.receipt.text.includes('Kundbesked: klart')); assert(paymentResult.receipt.text.includes('Betalningsregler: inte utfört'))
  reset(); row.approval_type='lead_review'; row.payload={lead_id:'l-site'}
  let activationPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert.equal(activationPreview.review.choices.length,3); assert.equal(leadActivationCalls.length,0)
  assert(activationPreview.review.details.some(d=>d.label==='Kund'&&d.text==='Anna Andersson'))
  assert(activationPreview.review.details.some(d=>d.label==='Internt SMS'&&d.text.includes('Ny lead')))
  assert(activationPreview.review.effect.includes('SMS:et skickas inte'),activationPreview.review.effect)
  leadRow.notes='Ändrat underlag'
  assert.equal((await post({action:'approve',review_token:activationPreview.review_token})).status,428); assert.equal(leadActivationCalls.length,0)
  leadRow.notes='Renovera hall'; activationPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  const activationResponse=await post({action:'approve',review_token:activationPreview.review_token,action_overrides:{create_deal:'approved',prepare_internal_sms:'approved',run_automation_rules:'rejected'}})
  const activationResult=await activationResponse.json(); assert.equal(activationResponse.status,200,JSON.stringify(activationResult)); assert.equal(leadActivationCalls.length,1)
  assert.deepEqual(leadActivationCalls[0].options,{businessId:'b1',approvalId:'a1',createDeal:true,prepareInternalSms:true,runAutomationRules:false,reviewedInternalPhone:'+46708888888',reviewedInternalMessage:activationPreview.review.details.find(d=>d.label==='Internt SMS').text})
  assert.equal(activationResult.receipt.state,'saved'); assert(activationResult.receipt.text.includes('Internnotis: klart')); assert(activationResult.receipt.text.includes('Leadregler: inte utfört'))
  reset(); row.approval_type='lead_review'; row.payload={lead_id:'l-site'}; leadRow.business_id='foreign'
  assert.equal((await post({action:'preview',decision_action:'approve'})).status,422); assert.equal(leadActivationCalls.length,0)
  reset(); row.approval_type='automation'; row.payload={lead_id:'l-site',entity_id:'l-site',customer_name:'Leo Lead',rule_action_type:'reject_lead',rule_action_config:{sms_template:'Hej {{customer_name}}, vi går inte vidare just nu.'}}
  let rejectLeadPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert.equal(rejectLeadPreview.review.choices.length,1); assert.equal(rejectLeadPreview.review.messages.length,0); assert(rejectLeadPreview.review.details.some(d=>d.label==='Kund-SMS'&&d.text.includes('Hej Leo Lead'))); assert(rejectLeadPreview.review.effect.includes('skickas inte'))
  leadRow.status='contacted'; assert.equal((await post({action:'approve',review_token:rejectLeadPreview.review_token})).status,428); assert.equal(automationCalls.length,0)
  leadRow.status='pending_review'; rejectLeadPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  const rejectLeadResponse=await post({action:'approve',review_token:rejectLeadPreview.review_token,action_overrides:{prepare_rejection_sms:'approved'}}); const rejectLeadResult=await rejectLeadResponse.json()
  assert.equal(rejectLeadResponse.status,200,JSON.stringify(rejectLeadResult)); assert.equal(automationCalls.length,1); assert.equal(automationCalls[0].actionType,'reject_lead'); assert.equal(artifactCalls.length,1); assert.equal(artifactCalls[0].values.approval_type,'send_sms'); assert.equal(artifactCalls[0].values.payload.to,leadRow.phone)
  assert.equal(rejectLeadResult.receipt.state,'saved'); assert(rejectLeadResult.receipt.text.includes('Kundbesked: klart'))
  reset(); row.approval_type='autopilot_package'; row.payload={}; row.package_data={actions:[
    {id:'sms-part',type:'customer_sms',title:'Kundbesked',data:{customer_id:'c-site',to:'+46700000000',message:'Exakt paketmeddelande'}},
    {id:'booking-part',type:'booking_suggestion',title:'Boka besök',data:{customer_id:'c-site',scheduled_start:'2026-09-20T08:00:00Z',scheduled_end:'2026-09-20T09:00:00Z',notes:'Paketbokning'}},
  ]}
  let packagePreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert.equal(packagePreview.review.messages[0].recipients[0],customerRow.phone_number); assert(packagePreview.review.details.some(d=>d.label==='Boka besök'&&d.text.includes('2026-09-20')))
  smsShouldFail=true; let packageResponse=await post({action:'approve',review_token:packagePreview.review_token}); let packageResult=await packageResponse.json()
  assert.equal(packageResponse.status,200,JSON.stringify(packageResult)); assert.equal(packageResult.receipt.state,'partial'); assert.equal(bookingPosts.length,1); assert.equal(smsDeliveries.length,1)
  assert.equal(row.payload.execution_result.results.find(r=>r.id==='booking-part').ok,true); assert.equal(row.payload.execution_result.results.find(r=>r.id==='sms-part').delivery_state,'rejected')
  smsShouldFail=false; packagePreview=await (await post({action:'preview',decision_action:'retry'})).json()
  assert.equal(packagePreview.review.messages.length,1); assert(packagePreview.review.effect.includes('endast om')); assert(packagePreview.review.details.some(d=>d.label==='Boka besök'&&d.text.includes('körs inte igen')))
  packageResponse=await post({action:'retry',review_token:packagePreview.review_token}); packageResult=await packageResponse.json()
  assert.equal(packageResponse.status,200,JSON.stringify(packageResult)); assert.equal(packageResult.receipt.state,'saved'); assert.equal(bookingPosts.length,1,'successful booking part must not run again'); assert.equal(smsDeliveries.length,2)
  reset(); row.approval_type='autopilot_package'; row.payload={}; row.package_data={actions:[{id:'sms-only',type:'customer_sms',title:'SMS',data:{customer_id:'c-site',message:'Osäkert SMS'}}]}
  packagePreview=await (await post({action:'preview',decision_action:'approve'})).json(); smsUnknown=true
  packageResult=await (await post({action:'approve',review_token:packagePreview.review_token})).json(); assert.equal(packageResult.receipt.state,'partial'); assert(packageResult.receipt.text.includes('skicka inte igen'))
  assert.equal((await post({action:'preview',decision_action:'retry'})).status,422); assert.equal(smsDeliveries.length,1)
  reset(); row.approval_type='four_eyes_project_close'; row.payload={project_id:'p1',responsible_name:'Erik'}
  const closePreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert.equal(mutations,0); assert.equal(closePreview.review.choices.length,3); assert(closePreview.review.details.some(d=>d.label==='Kunden betalar'&&d.text==='7 000 kr'))
  assert(closePreview.review.details.some(d=>d.label==='Ansvarig'&&d.text==='Erik'))
  assert(closePreview.review.effect.includes('skickas aldrig direkt'))
  const closeResponse=await post({action:'approve',review_token:closePreview.review_token,action_overrides:{create_invoice_draft:'rejected',create_review_request:'approved',run_automations:'rejected'}})
  const closeResult=await closeResponse.json(); assert.equal(closeResponse.status,200,JSON.stringify(closeResult))
  assert.equal(completionCalls.length,1,JSON.stringify(closeResult)); assert.deepEqual(completionCalls[0].options,{createInvoiceDraft:false,createReviewRequest:true,runAutomations:false})
  assert.equal(closeResult.receipt.state,'saved'); assert(closeResult.receipt.text.includes('Fakturautkast: inte utfört')); assert(closeResult.receipt.text.includes('Kunduppföljning: klart'))
  reset(); row.approval_type='four_eyes_project_close'; row.payload={project_id:'p1'}
  const stalePreview=await (await post({action:'preview',decision_action:'approve'})).json(); projectRow.name='Ändrat projekt'
  assert.equal((await post({action:'approve',review_token:stalePreview.review_token})).status,428); assert.equal(completionCalls.length,0)
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
  reset(); row.approval_type='reschedule_request'; row.payload={entity:{customerId:'c-site',phone:'+46709999999'},booking_id:'book-current',available_slots:[{label:'gammal tid'}]}
  bookingRows=[{booking_id:'book-current',customer_id:'c-site',project_id:'p1',scheduled_start:'2026-09-09T08:00:00Z',scheduled_end:'2026-09-09T09:00:00Z',status:'confirmed',assigned_to:'Erik',assigned_user_id:'member1'}]
  availableSlots=[{start:'2026-09-11T08:00:00Z',end:'2026-09-11T09:00:00Z',label:'fredag 11 sep kl 10:00–11:00'}]
  let reschedulePreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert(reschedulePreview.review.messages[0].text.includes('fredag 11 sep')); assert(!reschedulePreview.review.messages[0].text.includes('gammal tid'))
  assert(reschedulePreview.review.details.some(d=>d.label==='Befintlig bokning'&&d.text.includes('2026-09-09')))
  assert(reschedulePreview.review.details.some(d=>d.label==='Ansvarig'&&d.text==='Erik'))
  assert(reschedulePreview.review.details.some(d=>d.label==='Projektföljd'&&d.text.includes('Badrum hemma')))
  assert(reschedulePreview.review.effect.includes('Ingen bokning skapas eller flyttas')); assert.equal(smsDeliveries.length,0)
  availableSlots=[{start:'2026-09-12T08:00:00Z',end:'2026-09-12T09:00:00Z',label:'lördag 12 sep kl 10:00–11:00'}]
  assert.equal((await post({action:'approve',review_token:reschedulePreview.review_token})).status,428); assert.equal(smsDeliveries.length,0)
  reschedulePreview=await (await post({action:'preview',decision_action:'approve'})).json()
  smsShouldFail=true
  let rescheduleResponse=await post({action:'approve',review_token:reschedulePreview.review_token})
  let rescheduleResult=await rescheduleResponse.json(); assert.equal(rescheduleResponse.status,200,JSON.stringify(rescheduleResult)); assert.equal(rescheduleResult.receipt.state,'failed')
  const failedText=reschedulePreview.review.messages[0].text; const failedSlots=structuredClone(row.payload.execution_result.review_evidence.slots)
  availableSlots=[{start:'2026-09-14T08:00:00Z',end:'2026-09-14T09:00:00Z',label:'måndag 14 sep kl 10:00–11:00'}]; smsShouldFail=false
  const retryPreview=await (await post({action:'preview',decision_action:'retry'})).json()
  assert.equal(retryPreview.review.messages[0].text,failedText); assert.deepEqual(row.payload.execution_result.review_evidence.slots,failedSlots)
  rescheduleResponse=await post({action:'retry',review_token:retryPreview.review_token}); rescheduleResult=await rescheduleResponse.json()
  assert.equal(rescheduleResponse.status,200,JSON.stringify(rescheduleResult)); assert.equal(rescheduleResult.receipt.state,'sent'); assert.equal(smsDeliveries.at(-1).message,failedText)
  reset(); row.approval_type='propose_booking_times'; row.payload={entity:{customerId:'c-site',phone:'+46709999999'}}
  availableSlots=[{start:'2026-09-15T08:00:00Z',end:'2026-09-15T09:00:00Z',label:'tisdag 15 sep kl 10:00–11:00'}]
  const unknownPreview=await (await post({action:'preview',decision_action:'approve'})).json(); smsUnknown=true
  const unknownResponse=await (await post({action:'approve',review_token:unknownPreview.review_token})).json()
  assert.equal(unknownResponse.receipt.state,'partial'); assert(unknownResponse.receipt.text.includes('Skicka inte igen'))
  assert.equal((await post({action:'preview',decision_action:'retry'})).status,422); assert.equal(smsDeliveries.length,1)
  reset(); row.approval_type='propose_booking_times'; row.payload={entity:{leadId:'l-site',phone:'+46707777777'},duration_hours:2}
  availableSlots=[{start:'2026-09-15T08:00:00Z',end:'2026-09-15T10:00:00Z',label:'tisdag 15 sep kl 10:00–12:00'}]
  const leadPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert.equal(leadPreview.review.messages[0].recipients[0],leadRow.phone); assert(leadPreview.review.details.some(d=>d.label==='Kundförfrågan'&&d.text==='Leo Lead'))
  reset(); row.approval_type='new_booking_request'; row.payload={entity:{phone:'+46709999999'}}; availableSlots=[{start:'2026-09-15T08:00:00Z',end:'2026-09-15T09:00:00Z',label:'tisdag'}]
  assert.equal((await post({action:'preview',decision_action:'approve'})).status,422); assert.equal(smsDeliveries.length,0)
  reset(); row.approval_type='propose_booking_times'; row.payload={entity:{customerId:'foreign',phone:'+46709999999'}}; availableSlots=[{start:'2026-09-15T08:00:00Z',end:'2026-09-15T09:00:00Z',label:'tisdag'}]
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
  reset(); row.approval_type='send_sms'; row.payload={recipient:'internal',to:'+46708888888',message:'Faktura 1001 skapades som utkast.',related_id:'inv1'}
  const internalPreview=await (await post({action:'preview',decision_action:'approve'})).json()
  assert.equal(internalPreview.review.messages[0].recipients[0],'+46708888888'); assert.equal(internalPreview.review.messages[0].text,row.payload.message); assert.equal(smsDeliveries.length,0)
  const internalResult=await (await post({action:'approve',review_token:internalPreview.review_token})).json()
  assert.equal(smsDeliveries.length,1); assert.equal(smsDeliveries[0].recipient,'internal'); assert.equal(smsDeliveries[0].message,internalPreview.review.messages[0].text); assert.equal(internalResult.receipt.state,'sent')
  console.log('PASS route integration: campaign, payment, lead, package retry, project close and booking variants are review-bound with durable per-action evidence.')
})().catch(e => { console.error(e); process.exitCode=1 })
