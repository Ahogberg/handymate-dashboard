import { test,expect } from '@playwright/test'
import { receivablesDatabase,seedInvoice,domain,issue,settle,allocate,adjust } from './helpers/financial-receivables-database'
import { issueInvoiceReceivables,adjustReceivable } from '../lib/financial-kernel/receivables/service'
import { recordPaymentSettlement,allocatePayment,reversePaymentAllocation } from '../lib/financial-kernel/allocations/service'
import { money } from '../lib/financial-kernel/money'
import { isFinancialKernelEnabled } from '../lib/financial-kernel/flags'
import { readFileSync } from 'fs'
let fixture:Awaited<ReturnType<typeof receivablesDatabase>>
test.describe.configure({mode:'serial'})
test.beforeAll(async()=>{fixture=await receivablesDatabase()})
test.afterAll(async()=>{await fixture?.db.close()})
test.beforeEach(async()=>{await fixture.db.exec('BEGIN');await seedInvoice(fixture.db)})
test.afterEach(async()=>{await fixture.db.exec('ROLLBACK;RESET ROLE')})
async function rejects(run:()=>Promise<unknown>,pattern:RegExp){
  await fixture.db.exec('SAVEPOINT rejected_call')
  try{await expect(run()).rejects.toThrow(pattern)}finally{await fixture.db.exec('ROLLBACK TO SAVEPOINT rejected_call;RELEASE SAVEPOINT rejected_call')}
}
test('issue preserves exact amounts, replay identity and tenant boundaries',async()=>{
  const {db}=fixture;const a=await issue(db);expect(a.receivables[0].amount_minor).toBe('1250000')
  expect(await issue(db)).toEqual({...a,inserted:false})
  await rejects(()=>issue(db,'invoice','b'),/not_found/)
})
test('ROT legacy fallback matches customer-share when customer_pays was defaulted to total',async()=>{
  const {db}=fixture;await seedInvoice(db,'rot','12500','a','rot','12500')
  await db.exec("RESET ROLE; UPDATE invoice SET rot_rut_deduction=3000 WHERE invoice_id='rot';SET LOCAL ROLE service_role")
  expect((await issue(db,'rot')).receivables.map(r=>r.amount_minor)).toEqual(['950000','300000'])
})
test('allocation rejects overpayments, wrong currency and cross-tenant pairs atomically',async()=>{
  const {db}=fixture;const rec=(await issue(db)).receivables[0].id;const pay=(await settle(db,'1300000')).payment_id
  const before=(await db.query('SELECT id FROM financial_events')).rows.length
  await rejects(()=>allocate(db,pay,rec,'1300000'),/exceeds_receivable/)
  await rejects(()=>allocate(db,pay,rec,'1400000'),/exceeds_payment/)
  expect((await db.query('SELECT id FROM financial_events')).rows.length).toBe(before)
  const eur=(await settle(db,'1250000','eur','a','EUR')).payment_id
  await rejects(()=>allocate(db,eur,rec),/currency_mismatch/)
  const other=(await settle(db,'1250000','other','b')).payment_id
  await rejects(()=>allocate(db,other,rec),/not_found/)
})
test('allocation and adjustment replays reject altered commands, including nulls',async()=>{
  const {db}=fixture;const rec=(await issue(db)).receivables[0].id;const pay=(await settle(db)).payment_id
  await allocate(db,pay,rec,'100');await rejects(()=>allocate(db,pay,rec,'101'),/idempotency_conflict/)
  await rejects(()=>allocate(db,pay,rec,'100','allocation-other').then(()=>allocate(db,pay,rec,'102','allocation-other')),/idempotency_conflict/)
  await adjust(db,rec,'-10');await rejects(()=>adjust(db,rec,'-11'),/idempotency_conflict/)
  await rejects(()=>domain(db,'record_payment_settlement',['a','manual',null,'inbound',null,'SEK',null,null,'manual','2026-09-20T00:00:00Z',null,'pay','system',null]),/idempotency_conflict/)
})
test('reversal is idempotent and permits a fresh settlement with a new causal event',async()=>{
  const {db}=fixture;const rec=(await issue(db)).receivables[0].id;const pay=(await settle(db)).payment_id
  const allocation=await allocate(db,pay,rec);const args=['a',allocation.allocation_id,'mistake','system',null]
  expect((await domain(db,'reverse_payment_allocation',args)).receivable_reopened).toBe(true)
  expect((await domain(db,'reverse_payment_allocation',args)).inserted).toBe(false)
  await allocate(db,pay,rec,'1250000','replacement')
  expect((await db.query("SELECT id FROM financial_events WHERE event_type='receivable_settled'")).rows.length).toBe(2)
})
test('rounding settles allocated balances; credit and write-off close silently',async()=>{
  const {db}=fixture;const rec=(await issue(db)).receivables[0].id;const pay=(await settle(db,'1249999')).payment_id
  await allocate(db,pay,rec,'1249999');expect((await adjust(db,rec,'-1')).receivable_settled).toBe(true)
  for(const reason of ['credit','write_off']) {
    await seedInvoice(db,reason);const r=(await issue(db,reason)).receivables[0].id
    expect((await adjust(db,r,'-1250000',reason,reason)).receivable_settled).toBe(false)
    await rejects(()=>adjust(db,r,'-1','rounding',reason+'more'),/not_open/)
  }
})
test('reclassification conserves invoice total; ownership changes require the dedicated reason',async()=>{
  const {db}=fixture;await seedInvoice(db,'rot','12500','a','rot','9500');const recs=(await issue(db,'rot')).receivables
  await adjust(db,recs[1].id,'-300000','reclassification')
  const state=(await issue(db,'rot')).receivables
  expect(state.map(r=>r.outstanding_minor)).toEqual(['1250000','0'])
  await rejects(()=>adjust(db,recs[0].id,'10','interest','owner-bypass','factor'),/ownership/)
  await adjust(db,recs[0].id,'0','ownership_transfer','owner','factor')
})
test('flag/regime defaults and real membership RLS; privileged helpers cannot be called',async()=>{
  const {db}=fixture;await issue(db);await seedInvoice(db,'other','100','b');await issue(db,'other','b')
  expect((await domain(db,'financial_kernel_flags',['a'])).financial_kernel_enabled).toBe(false)
  await rejects(()=>domain(db,'financial_lock',['a']),/permission denied/)
  for(const table of ['financial_receivables','financial_payments','financial_payment_allocations','financial_receivable_adjustments'])
    await rejects(()=>db.exec(`INSERT INTO ${table} DEFAULT VALUES`),/permission denied/)
  await db.query("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)")
  await db.exec('SET LOCAL ROLE authenticated')
  expect((await db.query('SELECT business_id FROM financial_receivables')).rows).toEqual([{business_id:'a'}])
  await rejects(()=>issue(db),/permission denied/)
  await rejects(()=>domain(db,'financial_kernel_flags',['a']),/permission denied/)
})
test('Money wrappers preserve BIGINT in responses and event payloads, including replay paths',async()=>{
  const {db,rpc}=fixture;const actor={type:'system' as const};const amount=money(BigInt('9007199254740993'),'SEK')
  await seedInvoice(db,'large','90071992547409.93');const rec=(await issueInvoiceReceivables(rpc,'a','large',actor)).receivables[0]
  expect(rec.amount).toEqual(amount);expect(await isFinancialKernelEnabled(rpc,'a')).toBe(false)
  const input={provider:'manual',direction:'inbound' as const,amount,evidence:'manual' as const,settledAt:'2026-09-20T00:00:00Z',idempotencyKey:'large-payment',actor}
  const pay=await recordPaymentSettlement(rpc,'a',input);expect(pay.unallocated).toEqual(amount)
  expect((await recordPaymentSettlement(rpc,'a',input)).inserted).toBe(false)
  const allocInput={paymentId:pay.paymentId,receivableId:rec.id,amount,idempotencyKey:'large-allocation',actor}
  const alloc=await allocatePayment(rpc,'a',allocInput);expect(alloc.paymentUnallocated.amountMinor).toBe(BigInt(0))
  expect((await allocatePayment(rpc,'a',allocInput)).paymentUnallocated.amountMinor).toBe(BigInt(0))
  await reversePaymentAllocation(rpc,'a',{allocationId:alloc.allocationId,reason:'mistake',actor})
  expect((await reversePaymentAllocation(rpc,'a',{allocationId:alloc.allocationId,reason:'mistake',actor})).inserted).toBe(false)
  const adjInput={receivableId:rec.id,reason:'rounding' as const,delta:money(-1,'SEK'),idempotencyKey:'tiny',actor}
  await adjustReceivable(rpc,'a',adjInput);expect((await adjustReceivable(rpc,'a',adjInput)).inserted).toBe(false)
  const events=(await db.query<{payload:{amount_minor?:unknown;total_minor?:unknown}}> ("SELECT payload FROM financial_events WHERE event_type IN ('invoice_issued','payment_settled') AND amount_minor>9007199254740991")).rows
  expect(events).toHaveLength(2);for(const event of events)expect(event.payload.amount_minor??event.payload.total_minor).toBe('9007199254740993')
})
test('regime coverage copies standard/reverse-charge and accrual/cash without computing VAT',async()=>{
  const {db}=fixture
  for(const [i,method,vat,tax] of [[0,'accrual','standard',null],[1,'cash','standard','rot'],[2,'cash','standard','rut'],[3,'accrual','reverse_charge_construction',null],[4,'cash','reverse_charge_construction',null]] as const){
    const id='regime-'+i;await seedInvoice(db,id,'1234.565','a',tax,tax?'1000':null)
    await db.exec('RESET ROLE');await db.query('UPDATE business_config SET accounting_method=$1 WHERE business_id=$2',[method,'a'])
    await db.query('UPDATE invoice SET vat_regime=$1 WHERE invoice_id=$2',[vat,id]);await db.exec('SET LOCAL ROLE service_role')
    const recs=(await issue(db,id)).receivables;expect(recs.reduce((s,r)=>s+BigInt(r.amount_minor),BigInt(0))).toBe(BigInt(123457))
    const row=(await db.query<{payload:Record<string,unknown>}>("SELECT payload FROM financial_events WHERE event_type='invoice_issued' AND source_id=$1",[id])).rows[0]
    expect(row.payload).toMatchObject({accounting_method:method,vat_regime:vat,tax_reduction:tax})
  }
})
test('RPC permissions cover all domain mutations and table writes',async()=>{
  const {db}=fixture;const rec=(await issue(db)).receivables[0].id;const pay=(await settle(db)).payment_id
  await allocate(db,pay,rec,'100');await adjust(db,rec,'-1')
  for(const role of ['anon','authenticated']){
    await db.exec(`SET LOCAL ROLE ${role}`)
    for(const [name,args] of [
      ['issue_invoice_receivables',['a','invoice','system',null]],
      ['record_payment_settlement',['a','manual',null,'inbound',null,'SEK','100',null,'manual',null,null,'denied','system',null]],
      ['allocate_payment',['a',pay,rec,'100','denied','system',null]],
      ['adjust_receivable',['a',rec,'rounding','-1',null,null,null,'denied','system',null]],
      ['reverse_payment_allocation',['a','none','reason','system',null]],
      ['financial_kernel_flags',['a']],
    ] as [string,unknown[]][])await rejects(()=>domain(db,name,args),/permission denied/)
    for(const table of ['financial_receivables','financial_payments','financial_payment_allocations','financial_receivable_adjustments']){
      await rejects(()=>db.exec(`UPDATE ${table} SET business_id=business_id`),/permission denied/)
      if(role==='anon')await rejects(()=>db.exec(`SELECT * FROM ${table}`),/permission denied/)
      else expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual([])
    }
  }
})
test('source contracts preserve legacy callers, exact arithmetic and business lock ordering',()=>{
  const sql=readFileSync('sql/v238_financial_receivables.sql','utf8')
  expect(sql).not.toMatch(/UPDATE\s+public\.invoice\b/i)
  expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/tolerance|epsilon/i)
  for(const name of ['issue_invoice_receivables','record_payment_settlement','allocate_payment','adjust_receivable','reverse_payment_allocation']){
    const fn=sql.slice(sql.indexOf('FUNCTION public.'+name));expect(fn.slice(fn.indexOf('BEGIN'),fn.indexOf('END $fn$'))).toMatch(/^BEGIN\s+PERFORM public\.financial_lock\(p_business_id\)/)
  }
  for(const file of ['flags.ts','receivables/service.ts','allocations/service.ts'])expect(readFileSync('lib/financial-kernel/'+file,'utf8')).not.toMatch(/Number\s*\([^)]*(?:_minor|amount)/)
})
test('adjustment signs, regime constraints, and reversal of a closed balance reject invalid commands',async()=>{
  const {db}=fixture;const rec=(await issue(db)).receivables[0].id
  for(const [reason,delta] of [['credit','1'],['write_off','1'],['dunning_fee','-1'],['interest','-1'],['rounding','0']])
    await rejects(()=>adjust(db,rec,delta,reason,reason),/sign/)
  const pay=(await settle(db,'100')).payment_id;const allocation=await allocate(db,pay,rec,'100')
  await rejects(()=>domain(db,'reverse_payment_allocation',['a',allocation.allocation_id,'  ','system',null]),/requires_reason/)
  await adjust(db,rec,'-1249900','credit','close')
  await rejects(()=>domain(db,'reverse_payment_allocation',['a',allocation.allocation_id,'mistake','system',null]),/state_invalid/)
  await db.exec('RESET ROLE')
  for(const sql of ["UPDATE business_config SET accounting_method='other'", "UPDATE invoice SET vat_regime='other'",'UPDATE business_config SET financial_kernel_enabled=NULL'])
    await rejects(()=>db.exec(sql),/constraint/)
})
