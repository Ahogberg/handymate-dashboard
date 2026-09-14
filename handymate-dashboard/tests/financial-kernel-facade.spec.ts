import {test,expect} from '@playwright/test'
import {receivablesDatabase,seedInvoice,domain} from './helpers/financial-receivables-database'
import {c5Modules} from './helpers/c5-module'
import {NextRequest} from 'next/server'
let f:Awaited<ReturnType<typeof receivablesDatabase>>
test.describe.configure({mode:'serial'})
test.beforeAll(async()=>{f=await receivablesDatabase();await f.db.exec('GRANT SELECT ON invoice,business_config TO service_role')})
test.afterAll(async()=>{await f?.db.close()})
test.beforeEach(async()=>{await f.db.exec('BEGIN');await seedInvoice(f.db,'i','12500','a','rot','9500')})
test.afterEach(async()=>{await f.db.exec('ROLLBACK;RESET ROLE')})
function harness(){
 const effects:{effect:string;context:unknown}[]=[];let crash=false
 const sb={rpc:f.rpc.rpc,from(table:string){const filters:unknown[]=[];let sql='';const q={select:()=>q,eq:(key:string,value:unknown)=>{filters.push(value);sql+=(sql?' AND ':'')+key+'=$'+filters.length;return q},maybeSingle:async()=>({data:{financial_kernel_enabled:true},error:null}),single:async()=>({data:(await f.db.query('SELECT * FROM '+table+' WHERE '+sql,filters)).rows[0],error:null})};return q}}
 const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/approvals/artifact-write':{},'@/lib/customers/namn':{},'@/lib/sms-reply-number':{},
 '@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'a'})},
 '@/lib/financial-kernel/kernel-db':{kernelDb:()=>f.rpc},'@/lib/observability/driftlarm':{rapporteraTystFel:async()=>{}},
 '../effects/runners':{runPaymentEffect:async(_biz:string,_inv:string,intent:{effect:string;context:unknown})=>{effects.push(intent);return {effect:intent.effect,status:'succeeded'}}}})
 const app=load('lib/invoices/apply-payment.ts')
 return {effects,app,load,run:(key:string,extra:Record<string,unknown>={})=>app.applyInvoicePayment({businessId:'a',invoiceId:'i',source:'status_patch',commandKey:'status_patch:'+key,...extra})}
}
test('real status route delegates thanks to intents and replay never re-enters its legacy SMS block',async()=>{
 const h=harness(),route=h.load('app/api/invoices/[id]/status/route.ts')
 for(let i=0;i<2;i++) {
  const response=await route.PATCH(new NextRequest('https://test.local/status',{method:'PATCH',headers:{'Idempotency-Key':'same'},body:JSON.stringify({status:'paid'})}),{params:{id:'i'}})
  expect(response.status).toBe(200);expect((await response.json()).command_id).toBe('same')
 }
 expect(h.effects.filter(e=>e.effect==='invoice_paid_thanks')).toHaveLength(1)
 expect(h.effects.filter(e=>e.effect==='review_request_schedule')).toHaveLength(1)
})
test('facade replay keeps current paid projection and dispatches each owed effect once',async()=>{
 const h=harness();expect((await h.run('a')).status).toBe('customer_paid');expect(h.effects).toHaveLength(8)
 expect((await h.run('b')).status).toBe('paid');const retry=await h.run('a',{amount:1,paidAt:'2099-01-01'})
 expect(retry.status).toBe('paid');expect(retry.paid_amount).toBe(12500);expect(retry.kernel.replayed).toBe(true);expect(h.effects).toHaveLength(8)
})
test('recovery through another caller uses persisted approval choices and original approval id',async()=>{
 await domain(f.db,'execute_payment_command',['a','customer_confirmed:original','i','customer_confirmed','customer',null,null,'manual','customer_confirmed','manual',null,100,['portal_message'],'manual',null,'system',null,
  {approvalFollowUps:{approvalId:'original',prepareCustomerMessages:true,updateWorkflows:false,runAutomationRules:false}}])
 const h=harness();await h.run('recovery',{amount:1})
 expect(h.effects).toHaveLength(1);expect(h.effects[0].context).toMatchObject({source:'customer_confirmed',approvalFollowUps:{approvalId:'original'},paidAmountMinor:'950000'})
})
for(const shortfall of [1,100,101]) test(`explicit rounding boundary ${shortfall} minor units`,async()=>{
 await seedInvoice(f.db,'plain','100');const h=harness();const result=await h.app.applyInvoicePayment({businessId:'a',invoiceId:'plain',source:'manual',commandKey:'manual:round',amount:(10000-shortfall)/100})
 expect(result.status).toBe(shortfall<=100?'paid':'sent');expect(h.effects.length).toBe(shortfall<=100?6:0)
 expect((await f.db.query('SELECT delta_minor::text FROM financial_receivable_adjustments')).rows).toEqual(shortfall<=100?[{delta_minor:String(-shortfall)}]:[])
})
test('ROT total minus fifty ore allocates both components and rounds only tax',async()=>{
 const h=harness();const result=await h.run('round',{amount:12499.50});expect(result.status).toBe('paid');expect(result.paid_amount).toBe(12499.5);expect(result.remaining_rot_kr).toBe(0)
})
test('overpayment remains unallocated and visible',async()=>{
 const h=harness();const result=await h.run('over',{amount:12600});expect(result.status).toBe('paid');expect(result.kernel.unallocatedMinor).toBe('10000')
})
test('GP5: two non-ROT partial payments leave open then settle once',async()=>{
 await seedInvoice(f.db,'plain','100');const h=harness()
 const call=(key:string,amount:number)=>h.app.applyInvoicePayment({businessId:'a',invoiceId:'plain',source:'manual',commandKey:'manual:'+key,amount})
 expect((await call('first',40)).status).toBe('sent');expect(h.effects).toEqual([])
 const second=await call('second',60);expect(second.status).toBe('paid');expect(second.paid_amount).toBe(100);expect(h.effects).toHaveLength(6)
})
test('real Fortnox sync passes distinct snapshots and stable keys while preserving legacy amount',async()=>{
 const calls:Record<string,any>[]=[];let balance=0
 const invoice={invoice_id:'i',business_id:'a',status:'customer_paid',fortnox_document_number:'doc',fortnox_invoice_number:'42',total:12500,customer_pays:9500,rot_rut_type:'rot'}
 const sb={from(table:string){const q={select:()=>q,eq:()=>q,not:()=>q,update:()=>q,then:(done:(r:unknown)=>unknown)=>Promise.resolve({data:table==='invoice'?[invoice]:null,error:null}).then(done)};return q}}
 const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>sb},'@/lib/fortnox':{isFortnoxConnected:async()=>true,fortnoxRequest:async()=>({Invoice:{Total:12500,Balance:balance}})},
 '@/lib/invoices/apply-payment':{applyInvoicePayment:async(opts:Record<string,any>)=>{calls.push(opts);return {ok:true,transition:'settled'}}}})
 const sync=load('lib/fortnox/sync-payments.ts').syncFortnoxPaymentsForBusiness
 expect((await sync('a')).marked_settled).toBe(1);await sync('a');balance=-100;await sync('a')
 expect(calls[0].amount).toBeUndefined();expect(calls[0].commandKey).toBe(calls[1].commandKey);expect(calls[2].commandKey).not.toBe(calls[0].commandKey)
 expect(calls[0].providerObservation).toMatchObject({documentNumber:'doc',paidMinor:'1250000',balance:0})
 expect(calls[2].providerObservation.paidMinor).toBe('1260000')
})
