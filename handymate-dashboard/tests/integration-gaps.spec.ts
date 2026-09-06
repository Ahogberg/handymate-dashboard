import { test, expect } from '@playwright/test'
import { validateAnswers, type Preparation } from '../lib/customer-preparation/contract'
import { preparationQuoteInput } from '../lib/customer-preparation/quote-handoff'
import { applyPackage } from '../lib/quotes/package-comparison'
import { buildQuotePayload, type BuildQuotePayloadInput } from '../app/dashboard/quotes/_shared/buildQuotePayload'
import { deriveRevenueRecoveryCase } from '../lib/value/revenue-recovery-case'
import { selectQueue } from '../lib/value/revenue-work-queue'

test('validated customer answers and package choices survive the canonical quote payload', () => {
  const answers = validateAnswers('charging', {location:'Garaget',route:'Sträckan behöver mätas',wishes:''})
  const preparation: Preparation = {id:'preparation-1',template:'charging',context:'Laddbox',status:'reviewed',answers,images:['private/image'],created_at:'2026-09-05',submitted_at:'2026-09-05',expires_at:'2026-10-05',due_date:null}
  const sourceTranscript = preparationQuoteInput(preparation)
  const items = applyPackage([
    {id:'base',item_type:'item',description:'Montering',quantity:2,unit:'tim',unit_price:500,total:1000,sort_order:0,is_rot_eligible:false,is_rut_eligible:false,linked_product_id:'article-1',component_snapshot:{hours:2}},
    {id:'extra',item_type:'option',description:'Tillval',quantity:1,unit:'st',unit_price:300,total:300,sort_order:1,is_rot_eligible:false,is_rut_eligible:false,option_selected:false},
  ], 'extended', [])
  const context = {mode:'create',selectedCustomer:'customer-1',title:'Laddbox',description:'Installation',vatRate:25,discountPercent:0,notIncluded:'',ataTerms:'',paymentTermsText:'',termsText:'',reservationsSnapshot:[{id:'reservation-1',text:'Sträckan behöver kontrolleras'}],paymentPlan:[],calculatedPaymentPlan:[],paymentPlanValid:true,referencePerson:'',customerReference:'',projectAddress:'',detailLevel:'detailed',showUnitPrices:true,showQuantities:true,hasRotItems:false,hasRutItems:false,personnummer:'',fastighetsbeteckning:'',validDays:30,templateStyle:'modern',attachments:[],sourceTranscript,items} as unknown as BuildQuotePayloadInput
  const payload = buildQuotePayload(context)
  expect(payload.customer_id).toBe('customer-1')
  expect(payload).toHaveProperty('source_transcript', sourceTranscript)
  expect(payload.quote_items[0]).toMatchObject({linked_product_id:'article-1',component_snapshot:{hours:2}})
  expect(payload.quote_items[1]).toMatchObject({option_selected:true,option_default:true})
  expect(payload.reservations_snapshot).toEqual(context.reservationsSnapshot)
  expect(sourceTranscript).toContain('Sträckan behöver mätas')
  expect(sourceTranscript).not.toContain('private/image')
  expect(sourceTranscript).not.toContain(preparation.id)
  expect(() => preparationQuoteInput({...preparation,status:'submitted'})).toThrow('Granska')
  expect(() => preparationQuoteInput({...preparation,status:'cancelled'})).toThrow('Granska')
})

test('a pending project ATA proposal reaches the queue and points to the actual approval surface', () => {
  const row = deriveRevenueRecoveryCase({approval:{id:'approval-1',approval_type:'create_ata_draft',status:'pending',title:'Extra uttag',payload:{project_id:'project-1',description:'Extra uttag enligt kunden'},created_at:'2026-09-05T10:00:00Z',resolved_at:null},project:{project_id:'project-1',name:'Garaget',status:'active',completed_at:null},changes:[],invoice:null})
  const queue = selectQueue([row], 'action')
  expect(queue).toHaveLength(1)
  expect(queue[0]).toMatchObject({phase:'needs_review',project_id:'project-1',next_action:{href:'/dashboard/approvals'}})
  expect(queue[0].evidence.payment_confirmed).toBe(false)
  expect(queue[0].evidence.ata_created).toBe(false)
})
