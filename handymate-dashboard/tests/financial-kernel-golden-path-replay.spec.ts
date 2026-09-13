import { test,expect } from '@playwright/test'
import { GOLDEN_PATHS } from './financial-kernel/golden-paths'
import { receivablesDatabase,seedInvoice } from './helpers/financial-receivables-database'
import { issueInvoiceReceivables,adjustReceivable,type AdjustmentReason } from '../lib/financial-kernel/receivables/service'
import { recordPaymentSettlement,allocatePayment } from '../lib/financial-kernel/allocations/service'
import { fromDecimalString,money } from '../lib/financial-kernel/money'

let f:Awaited<ReturnType<typeof receivablesDatabase>>
test.beforeAll(async()=>{f=await receivablesDatabase()})
test.afterAll(async()=>{await f?.db.close()})
test.beforeEach(async()=>{await f.db.exec('BEGIN')})
test.afterEach(async()=>{await f.db.exec('ROLLBACK;RESET ROLE')})
const actor={type:'system' as const}
const produced=new Set(['invoice_issued','receivable_created','payment_initiated','payment_settled','payment_allocated','receivable_settled','receivable_adjusted','payment_allocation_reversed'])
for(const gp of GOLDEN_PATHS.filter(g=>[1,4,5,7,10,12,19,30,34,36,37].includes(g.id))) {
  test(`GP${gp.id}: ${gp.title}`,async()=>{
    const issued=gp.events.find(e=>e.t==='invoice_issued')!
    const invoiceId=String(issued.p!.invoice_id)
    const customer=gp.events.find(e=>e.t==='receivable_created'&&e.p?.component==='customer')!
    await seedInvoice(f.db,invoiceId,issued.amt!,'a',gp.regime.taxReduction??null,customer.amt!)
    await f.db.exec('RESET ROLE')
    await f.db.query('UPDATE business_config SET accounting_method=$1 WHERE business_id=$2',[gp.regime.accountingMethod,'a'])
    await f.db.query('UPDATE invoice SET vat_regime=$1 WHERE invoice_id=$2',[gp.regime.vatRegime,invoiceId])
    await f.db.exec('SET LOCAL ROLE service_role')
    const recs=(await issueInvoiceReceivables(f.rpc,'a',invoiceId,actor)).receivables
    const recIds=new Map(gp.events.filter(e=>e.t==='receivable_created').map(e=>[String(e.p!.receivable_id),recs.find(r=>r.component===e.p!.component)!.id]))
    const payments=new Map<string,string>()
    const excluded=new Set<string>()
    // GP19 declares an already-paid customer component in GIVEN, outside its event list.
    // Build that state through real RPCs; exclude only those setup events from WHEN assertions.
    if(gp.id===19){
      const before=new Set((await f.db.query<{id:string}>('SELECT id FROM financial_events')).rows.map(r=>r.id))
      const p=await recordPaymentSettlement(f.rpc,'a',{provider:'manual',direction:'inbound',amount:fromDecimalString(customer.amt!,'SEK'),evidence:'manual',settledAt:'2026-09-20T00:00:00Z',correlationId:'fin_invoice_'+invoiceId,idempotencyKey:'given-paid',actor})
      await allocatePayment(f.rpc,'a',{paymentId:p.paymentId,receivableId:recs.find(r=>r.component==='customer')!.id,amount:fromDecimalString(customer.amt!,'SEK'),idempotencyKey:'given-allocated',actor})
      for(const r of (await f.db.query<{id:string}>('SELECT id FROM financial_events')).rows)if(!before.has(r.id))excluded.add(r.id)
    }
    for(const [index,event] of Array.from(gp.events.entries())){
      if(event.t==='payment_initiated'){
        const settlement=gp.events.find(e=>e.t==='payment_settled'&&e.p?.payment_id===event.p!.payment_id)!
        const input={provider:String(event.p!.provider),direction:'inbound' as const,amount:fromDecimalString(event.amt!,'SEK'),
          evidence:String(settlement.p?.evidence??'manual') as 'manual'|'fortnox'|'bank',settledAt:String(settlement.p?.settled_at??'2026-09-20')+'T00:00:00Z',
          correlationId:'fin_invoice_'+invoiceId,idempotencyKey:String(settlement.p?.idempotency_key??event.p!.payment_id),actor}
        const payment=await recordPaymentSettlement(f.rpc,'a',input);payments.set(String(event.p!.payment_id),payment.paymentId)
        if([12,30].includes(gp.id))expect((await recordPaymentSettlement(f.rpc,'a',input)).inserted).toBe(false)
      }else if(event.t==='payment_allocated'){
        const input={paymentId:payments.get(String(event.p!.payment_id))!,receivableId:recIds.get(String(event.p!.receivable_id))!,amount:fromDecimalString(event.amt!,'SEK'),idempotencyKey:String(event.p!.allocation_id),actor}
        await allocatePayment(f.rpc,'a',input)
        if([12,30].includes(gp.id))expect((await allocatePayment(f.rpc,'a',input)).inserted).toBe(false)
      }else if(event.t==='receivable_adjusted'){
        await adjustReceivable(f.rpc,'a',{receivableId:recIds.get(String(event.p!.receivable_id))!,reason:String(event.p!.reason) as AdjustmentReason,delta:fromDecimalString(event.amt!,'SEK'),idempotencyKey:'adjust:'+index,actor})
      }
    }
    const rows=(await f.db.query<{id:string;event_type:string;payload:{component?:string;receivable_id?:string};amount_minor:string|null}>("SELECT id,event_type,payload,amount_minor::text FROM financial_events WHERE correlation_id=$1 ORDER BY seq",['fin_invoice_'+invoiceId])).rows.filter(r=>!excluded.has(r.id))
    expect(rows.map(r=>r.event_type)).toEqual(gp.events.filter(e=>produced.has(e.t)).map(e=>e.t))
    expect(rows.filter(r=>r.event_type==='receivable_settled'&&r.payload.component==='customer')).toHaveLength(gp.automation.paymentReceived)
    const final=(await issueInvoiceReceivables(f.rpc,'a',invoiceId,actor)).receivables
    expect(final.reduce((sum,r)=>sum+r.outstanding.amountMinor,BigInt(0))).toBe(fromDecimalString(gp.invoice.outstanding,'SEK').amountMinor)
    expect(final.reduce((sum,r)=>sum+r.allocated.amountMinor,BigInt(0))).toBe(fromDecimalString(gp.invoice.paidAmount,'SEK').amountMinor)
    for(const r of rows.filter(r=>r.event_type==='receivable_created'))expect(final.some(v=>v.id===r.payload.receivable_id)).toBe(true)
    if(gp.id===7){
      const balances=(await f.db.query<{unallocated:string}>('SELECT (amount_minor-allocated_minor)::text unallocated FROM financial_payments')).rows
      expect(money(BigInt(balances[0].unallocated),'SEK').amountMinor).toBe(BigInt(10000))
    }
  })
}
