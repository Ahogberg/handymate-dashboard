import { test, expect } from '@playwright/test'
import { approvalReceipt } from '../lib/approvals/receipt'
import { bookingProposalMessage } from '../lib/approvals/booking-message'
import { prepareApprovalReview } from '../lib/approvals/prepare-review'
import { requireApprovalReview } from '../lib/approvals/review-guard'

test('receipts distinguish provider acceptance, queued work, partial delivery, navigation and saved documents', () => {
  expect(approvalReceipt('send_sms','approve',{sms_sent:true}).state).toBe('sent')
  expect(approvalReceipt('seasonal_campaign','approve',{queued:true}).state).toBe('queued')
  expect(approvalReceipt('send_invoice','approve',{metadata:{email:true,errors:['SMS failed']}}).state).toBe('partial')
  expect(approvalReceipt('publish_microsite','approve',{ok:true,navigate_to:'/dashboard/website'}).state).toBe('saved')
  expect(approvalReceipt('send_invoice','approve',{metadata:{email:true},navigate_to:'/dashboard/invoices/i'}).state).toBe('sent')
  expect(approvalReceipt('new_booking_request','approve',{ok:true,booking_id:'b',sms_sent:false}).text).toContain('Bokningen är sparad')
  expect(approvalReceipt('customer_message','approve',{reply_saved:true,sms_sent:false}).text).not.toContain('SMS-notisen är skickad')
  expect(approvalReceipt('unknown','approve',{}).state).toBe('needs_action')
  expect(approvalReceipt('lead_review','reject',{error:'Lead unchanged'}).state).toBe('partial')
})
test('every acknowledgement says what is noted without claiming delivery', () => {
  expect(approvalReceipt('karin_deadline','approve',{acknowledged:true}).text).toContain('inte någon inlämning')
  expect(approvalReceipt('egenkontroll_avvikelse','approve',{acknowledged:true}).state).toBe('acknowledged')
})
test('project close receipt lists each actual consequence and exposes partial failure', () => {
  const receipt = approvalReceipt('four_eyes_project_close', 'approve', { closeout: { completed: true, effects: [
    { effect: 'workflow_stage', status: 'succeeded' },
    { effect: 'auto_invoice', status: 'partial', message: 'Granskningskortet kunde inte sparas' },
    { effect: 'review_request', status: 'skipped', message: 'Valdes bort' },
  ] } })
  expect(receipt.state).toBe('partial')
  expect(receipt.text).toContain('Arbetsflöde: klart')
  expect(receipt.text).toContain('Fakturautkast: delvis klart')
  expect(receipt.text).toContain('Kunduppföljning: inte utfört')
})
test('legacy SMS time-message formatter rejects incomplete slots', () => {
  const payload={available_slots:[{label:'Tisdag 10:00'},{label:'Onsdag 14:00'}]}
  expect(bookingProposalMessage(payload)).toContain('Tisdag 10:00')
  expect(bookingProposalMessage({available_slots:[{}]})).toBeNull()
})
test('live target changes invalidate confirmation and all reads carry business scope', async () => {
  let rate=1000
  const reads:any[]=[]
  const db={from(table:string){const filters:any[]=[];return {select(){return this},eq(k:string,v:string){filters.push([k,v]);return this},async maybeSingle(){reads.push({table,filters});return {data:{id:'p',hourly_rate_normal:rate,name:'Service'},error:null}}}}}
  const approval={id:'a',approval_type:'price_adjustment',payload:{price_list_id:'p',suggested_rate:1200}}
  const prepared=await prepareApprovalReview(db as any,'b',approval,{action:'approve'})
  const input={approval,businessId:'b',actorId:'u',prepared,body:{action:'approve'}}
  const token=requireApprovalReview(input,'test',1000)!.data.review_token
  expect(requireApprovalReview({...input,body:{action:'approve',review_token:token}},'test',1000)).toBeNull()
  rate=1100
  const changed=await prepareApprovalReview(db as any,'b',approval,{action:'approve'})
  expect(requireApprovalReview({...input,prepared:changed,body:{action:'approve',review_token:token}},'test',1000)?.status).toBe(428)
  for(const read of reads) expect(read.filters).toContainEqual(['business_id','b'])
})
test('rejection has its own bound consequence, and job reports cannot pass as read acknowledgements', async () => {
  const db={from(){throw Error('unexpected lookup')}} as any
  const approval={id:'a',approval_type:'lead_review',payload:{}}
  const prepared=await prepareApprovalReview(db,'b',approval,{action:'reject'})
  expect(prepared?.review.effect).toContain('förlorad')
  const input={approval,businessId:'b',actorId:'u',prepared,body:{action:'reject'}}
  const token=requireApprovalReview(input,'test',1000)!.data.review_token
  expect(requireApprovalReview({...input,body:{action:'reject',review_token:token}},'test',1000)).toBeNull()
  expect(requireApprovalReview({...input,body:{action:'approve',review_token:token}},'test',1000)?.status).toBe(428)
  const report=await prepareApprovalReview(db,'b',{id:'r',approval_type:'job_report',payload:{}},{action:'approve'})
  expect(report?.review.confirmLabel).toBeNull()
})
test('reminder review binds invoice state, all channels and fees; rejects a foreign delivery payload', async () => {
 const db={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{invoice_id:'i',status:'sent',customer_id:'c',reminder_count:1,invoice_number:'123',total:1000},error:null}}}}}
 const delivery={businessId:'b',invoiceId:'i',customerId:'c',currentCount:1,customerPhone:'+46701234567',customerEmail:'kund@example.test',emailToo:true,messages:{sms:'Påminnelse 123',emailSubject:'Faktura 123',emailBody:'<p>Betala 1060 kr</p>'},reminderFee:60,interestAmount:0}
 const approval={id:'a',approval_type:'invoice_reminder',payload:{delivery}}
 const reviewed=await prepareApprovalReview(db as any,'b',approval,{action:'approve'})
 expect(reviewed?.review.messages).toHaveLength(2);expect(reviewed?.review.messages[1].html).toBe(delivery.messages.emailBody)
 expect(reviewed?.review.details).toContainEqual({label:'Påminnelseavgift (kr)',text:'60'})
 delivery.businessId='foreign'
 expect((await prepareApprovalReview(db as any,'b',approval,{action:'approve'}))?.review.confirmLabel).toBeNull()
})
test('automation SMS previews literal replacement values including dollar signs', async () => {
 const db={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{business_name:'Firma'},error:null}}}}}
 const a={id:'a',approval_type:'automation',payload:{phone:'+46701234567',customer_name:'$&',rule_action_type:'send_sms',rule_action_config:{template:'Hej {{customer_name}} från {{business_name}}'}}}
 const r=await prepareApprovalReview(db as any,'b',a,{action:'approve'})
 expect(r?.review.messages[0].text).toBe('Hej $& från Firma')
 a.payload.rule_action_config.template='Hej {{missing}}'
 expect((await prepareApprovalReview(db as any,'b',a,{action:'approve'}))?.review.confirmLabel).toBeNull()
})
test('package review binds all selected parts, not just the outer payload',async()=>{
 const db={from(){throw Error('Unexpected lookup')}} as any
 const approval={id:'a',approval_type:'autopilot_package',payload:{},package_data:{actions:[{id:'sms',type:'customer_sms',data:{to:'+46701234567',message:'Reviewed'}},{id:'book',type:'booking_suggestion',title:'Bokning',data:{}}]}}
 const body={action:'approve',action_overrides:{book:'rejected'}}
 const prepared=await prepareApprovalReview(db,'b',approval,body)
 expect(prepared?.review.confirmLabel).toBeTruthy();expect(prepared?.review.messages[0].text).toBe('Reviewed')
 const input={approval,businessId:'b',actorId:'u',body,prepared}
 const token=requireApprovalReview(input,'test',1000)!.data.review_token
 expect(requireApprovalReview({...input,body:{...body,review_token:token}},'test',1000)).toBeNull()
 approval.package_data.actions[0].data.message='Changed'
 expect(requireApprovalReview({...input,body:{...body,review_token:token}},'test',1000)?.status).toBe(428)
 expect((await prepareApprovalReview(db,'b',approval,{action:'approve'}))?.review.confirmLabel).toBeNull()
})
test('package receipts count actual writes, not informational or rejected parts',()=>{
 const r=approvalReceipt('autopilot_package','approve',{action:'autopilot_package',ok:false,error:'failed',results:[{type:'project_info',ok:true,info:true},{type:'sms',ok:true},{type:'materials',ok:false,partial:true,count:1,error:'one row failed'},{type:'booking',skipped:'rejected'}]})
 expect(r.state).toBe('partial');expect(r.text).toContain('1 av 2');expect(r.text).toContain('SMS: accepterat');expect(r.text).toContain('Material: delvis utfört');expect(r.text).toContain('Bokning: valdes bort')
})
