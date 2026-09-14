import { test, expect } from '@playwright/test'
import { receivablesDatabase, seedInvoice, domain, issue, settle, allocate } from './helpers/financial-receivables-database'
import { consumeOnce } from '../lib/financial-kernel/events/consume'
import { automationBridge, BRIDGE_EFFECTS } from '../lib/financial-kernel/events/bridge-automation'
import { c5bRpc } from './helpers/c5b-rpc'

let f: Awaited<ReturnType<typeof receivablesDatabase>>
test.beforeAll(async () => { f = await receivablesDatabase() })
test.afterAll(async () => { await f?.db.close() })
test.beforeEach(async () => { await f.db.exec('BEGIN'); await seedInvoice(f.db, 'i') })
test.afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
async function direct() {
  const rec = (await issue(f.db, 'i')).receivables[0]
  const pay = await settle(f.db)
  await allocate(f.db, pay.payment_id, rec.id)
  return rec
}
const event = async () => (await f.db.query<any>("SELECT id, source_id FROM financial_events WHERE event_type='receivable_settled'")).rows[0]
const ensure = async (rec: string, id: string) => domain<any>(f.db, 'ensure_effect_intents', ['a', rec, id, [...BRIDGE_EFFECTS], {}])
test('direct C4 payment through real consumer creates exactly six intents, no sends, and replay is silent', async () => {
  const rec = await direct(), e = await event()
  const first = await consumeOnce(c5bRpc(f), 'a', automationBridge, {limit:100})
  expect(first.failed).toBe(0); expect(first.delivered).toBeGreaterThan(0)
  const rows = (await f.db.query<any>('SELECT status,source_event_id,context FROM financial_effect_intents')).rows
  expect(rows).toHaveLength(6)
  for (const row of rows) { expect(row.status).toBe('pending'); expect(row.source_event_id).toBe(e.id); expect(row.context.source).toBe('bridge'); expect(row.context.paidAmountMinor).toBe('1250000') }
  expect((await ensure(rec.id, e.id)).created).toEqual([])
  expect((await consumeOnce(c5bRpc(f), 'a', automationBridge)).delivered).toBe(0)
})
for (const effects of [[], ['portal_message'], [...BRIDGE_EFFECTS]]) test(`facade decision owns omitted effects too (${effects.length} selected)`, async () => {
  await domain(f.db, 'execute_payment_command', ['a','customer_confirmed:reviewed','i','customer_confirmed','customer',null,null,
    'manual','manual','manual',null,100,effects,'manual',null,'system',null,
    {approvalFollowUps:{approvalId:'reviewed',updateWorkflows:false,runAutomationRules:false,prepareCustomerMessages:effects.length>0}}])
  const result = await consumeOnce(c5bRpc(f), 'a', automationBridge, {limit:100})
  expect(result.failed).toBe(0)
  expect((await f.db.query('SELECT * FROM financial_effect_intents')).rows).toHaveLength(effects.length)
  expect((await f.db.query('SELECT * FROM financial_effect_intents WHERE source_event_id IS NOT NULL')).rows).toEqual([])
})
test('settlement reversed before consumer catches up is acknowledged without effects or halt', async () => {
  await direct()
  const allocation = (await f.db.query<any>('SELECT id FROM financial_payment_allocations')).rows[0]
  await domain(f.db,'reverse_payment_allocation',['a',allocation.id,'correction','system',null])
  const result = await consumeOnce(c5bRpc(f), 'a', automationBridge, {limit:100})
  expect(result.failed).toBe(0); expect(result.halted).toBe(false)
  expect((await f.db.query('SELECT * FROM financial_effect_intents')).rows).toEqual([])
})
test('other tenant and wrong source event are rejected by the producer', async () => {
  const rec = await direct()
  const wrong = (await f.db.query<any>("SELECT id FROM financial_events WHERE event_type='invoice_issued'")).rows[0]
  const rpc = c5bRpc(f)
  for (const [business, id] of [['a',wrong.id], ['b',(await event()).id]]) {
    const result = await rpc.rpc('ensure_effect_intents', {p_business_id:business,p_receivable_id:rec.id,p_source_event_id:id,p_effects:[...BRIDGE_EFFECTS],p_context:{}})
    expect(result.error).not.toBeNull()
  }
  expect((await f.db.query('SELECT * FROM financial_effect_intents')).rows).toEqual([])
})
test('expired worker and replacement worker both handle settlement but produce one set', async () => {
  await direct()
  const rpc = c5bRpc(f)
  let tookOver = false
  const result = await consumeOnce(rpc,'a',{
    consumer:automationBridge.consumer,
    async handle(e,db) {
      if (e.eventType === 'receivable_settled' && !tookOver) {
        tookOver = true
        await f.db.exec("RESET ROLE; UPDATE financial_event_consumers SET lease_expires_at=clock_timestamp()-interval '1 second'; SET LOCAL ROLE service_role")
        expect((await consumeOnce(rpc,'a',automationBridge,{limit:100})).failed).toBe(0)
      }
      await automationBridge.handle(e,db)
    },
  },{limit:100})
  expect(tookOver).toBe(true); expect(result.leaseLost).toBe(true)
  expect((await f.db.query('SELECT * FROM financial_effect_intents')).rows).toHaveLength(6)
})
