import { test, expect } from '@playwright/test'
import { compareInvoiceLevel1, decimalKrToMinor, COMPARISON_VERSION, SEVERITY, type HandymateShadowInvoice } from '../lib/financial-kernel/shadow/compare'
import { normalizeFortnoxShadowSnapshot, type FortnoxShadowObservation } from '../lib/fortnox/shadow-adapter'
type ReferenceSnapshot = FortnoxShadowObservation & { snapshot?: any }
const compare = (h: HandymateShadowInvoice, r: ReferenceSnapshot | null) => compareInvoiceLevel1(h, normalizeFortnoxShadowSnapshot(r))
const local = (): HandymateShadowInvoice => ({ invoice_id:'i',fortnox_document_number:'42',status:'sent',paid_amount:0,sent_at:'2026-09-15T12:00:00Z',phase_started_at:'2026-09-14T12:00:00Z',projection:{derived_status:null,recorded_minor:'0',receivables:[{component:'customer',status:'open',amount_minor:'125000',outstanding_minor:'125000',currency:'SEK'}]} })
const ref = (): ReferenceSnapshot => ({fetch_status:'ok',snapshot:{Total:1250,TotalToPay:1250,Balance:1250,FullyPaid:false,Cancelled:false}})
test('versioned policy and exact open, paid, cancelled fixtures',()=>{
 expect(COMPARISON_VERSION).toBe(1);expect(SEVERITY.PAYMENT_DIVERGENCE).toBe('critical');expect(compare(local(),ref())).toEqual({result:'match',differences:[]})
 const h=local(),r=ref();h.status='paid';h.paid_amount=1250;h.projection!.recorded_minor='125000';h.projection!.derived_status='paid';h.projection!.receivables[0].status='settled';h.projection!.receivables[0].outstanding_minor='0';r.snapshot!.Balance=0
 expect(compare(h,r).result).toBe('match');h.status='cancelled';h.projection!.receivables[0].status='voided';r.snapshot!.Cancelled=true;expect(compare(h,r).result).toBe('match')
})
for(const delta of [1,100,101])test(`${delta} öre is retained with versioned severity`,()=>{
 const r=ref();r.snapshot!.Total=(125000+delta)/100;const result=compare(local(),r);expect(result.result).toBe('divergent');expect(result.differences).toContainEqual(expect.objectContaining({dimension:'total_minor',kind:delta<=100?'ROUNDING_DIVERGENCE':'RECEIVABLE_BALANCE_DIVERGENCE',severity:delta<=100?'low':'high',expected:String(125000+delta),actual:'125000'}))
})
test('ROT classification ignores local state shortcut and has no one-krona tolerance',()=>{
 const h=local(),r=ref();h.status='customer_paid';h.paid_amount=1000;h.projection!.recorded_minor='100000';h.projection!.derived_status='customer_paid';h.projection!.receivables=[{component:'customer',status:'settled',amount_minor:'100000',outstanding_minor:'0'},{component:'tax_authority',status:'open',amount_minor:'25000',outstanding_minor:'25000'}];r.snapshot={Total:1250,TotalToPay:1000,Balance:250,TaxReduction:250}
 expect(compare(h,r).result).toBe('match');r.snapshot.Balance=250.01;expect(compare(h,r).differences).toContainEqual(expect.objectContaining({kind:'PAYMENT_DIVERGENCE',expected:'open',actual:'customer_paid'}))
})
test('FullyPaid never conceals nonzero reference or kernel balances',()=>{
 const r=ref();r.snapshot!.FullyPaid=true;r.snapshot!.Balance=0.01;expect(compare(local(),r).differences.map(d=>d.dimension)).toEqual(expect.arrayContaining(['settlement','reference_paid_balance_minor','kernel_paid_balance_minor']))
})
test('projection status and one-öre paid amount difference are critical',()=>{
 const h=local();h.status='paid';h.paid_amount=0.01;const result=compare(h,ref());expect(result.differences.filter(d=>d.kind==='PROJECTION_DIVERGENCE')).toHaveLength(2);expect(result.differences.every(d=>d.severity==='critical')).toBe(true)
})
for(const invalid of [undefined,null,'',NaN,Infinity,'unknown','1.001'])test(`invalid reference amount ${String(invalid)} never matches`,()=>{const r=ref();r.snapshot!.Total=invalid;expect(compare(local(),r).result).toBe('reference_missing')})
test('invalid kernel and invoice numeric evidence never match',()=>{
 const h=local();h.projection!.receivables[0].amount_minor='bad';expect(compare(h,ref()).differences).toContainEqual(expect.objectContaining({kind:'PROJECTION_DIVERGENCE'}));h.projection!.receivables[0].amount_minor='125000';h.paid_amount=null;expect(compare(h,ref()).result).toBe('divergent')
})
test('404 versus no document number and fetch error',()=>{
 expect(compare(local(),{fetch_status:'not_found'})).toEqual({result:'divergent',differences:[expect.objectContaining({kind:'MISSING_REFERENCE_ENTRY',severity:'high'})]});const h=local();h.fortnox_document_number=null;expect(compare(h,ref()).result).toBe('reference_missing');expect(compare(local(),{fetch_status:'error',error:'network'}).result).toBe('reference_missing')
})
test('new sent invoice missing kernel is high; prephase invoice is never false match',()=>{
 const h=local();h.projection=null;expect(compare(h,ref()).differences).toContainEqual(expect.objectContaining({kind:'MISSING_HANDYMATE_ENTRY',severity:'high'}));h.sent_at='2026-09-01T00:00:00Z';expect(compare(h,ref()).result).toBe('reference_missing')
})
test('decimal normalization rejects fabricated zero and rounding',()=>{
 expect(decimalKrToMinor('123456789012345.67')).toBe('12345678901234567');expect(decimalKrToMinor(0.29)).toBe('29');expect(decimalKrToMinor('-0.01')).toBe('-1');for(const invalid of [null,undefined,'','1.009',{},Infinity])expect(decimalKrToMinor(invalid)).toBeNull()
})

test('missing reference cannot hide proven internal projection divergence',()=>{
 const h=local(); h.paid_amount=0.01
 for (const r of [null,{fetch_status:'error' as const,error:'network'}]) {
  const result=compare(h,r);expect(result.result).toBe('divergent');expect(result.differences.map(d=>d.kind)).toEqual(expect.arrayContaining(['PROJECTION_DIVERGENCE','REFERENCE_DATA_UNAVAILABLE']))
 }
})

test('unknown reference classification is unavailable, never economic evidence',()=>{
 const snapshot=normalizeFortnoxShadowSnapshot(ref())!;
 (snapshot as unknown as {settlement_state:string}).settlement_state='future_unknown'
 expect(compareInvoiceLevel1(local(),snapshot)).toEqual({result:'reference_missing',differences:[]})
})
test('unknown derived status is corrupt projection, never open match',()=>{
 const h=local();h.projection!.derived_status='future_unknown'
 const result=compare(h,ref());expect(result.result).toBe('divergent')
 expect(result.differences).toContainEqual(expect.objectContaining({kind:'PROJECTION_DIVERGENCE',dimension:'kernel.derived_status'}))
})
