import { test, expect } from '@playwright/test'
import { c5bRpc } from './helpers/c5b-rpc'
import { readFileSync } from 'fs'
import {
  receivablesDatabase,
  seedInvoice,
  issue,
  settle,
  allocate,
  adjust,
  domain,
} from './helpers/financial-receivables-database'
let f: Awaited<ReturnType<typeof receivablesDatabase>>
test.beforeAll(async () => {
  f = await receivablesDatabase()
  await f.db
    .exec(`RESET ROLE; ALTER TABLE invoice ADD COLUMN sent_at timestamptz; ALTER TABLE invoice ADD COLUMN quote_id text;
 CREATE TABLE quotes(quote_id text PRIMARY KEY,business_id text,lead_id text,sent_at timestamptz);
 CREATE TABLE project(project_id text PRIMARY KEY,business_id text,completed_at timestamptz);
 CREATE TABLE leads(lead_id text PRIMARY KEY,business_id text,created_at timestamptz);`)
  for (const file of ['v2_pending_approvals.sql', 'v3_automation_logs.sql'])
    await f.db.exec(readFileSync('sql/' + file, 'utf8'))
  await f.db
    .exec(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO deployer; ALTER TABLE pending_approvals OWNER TO deployer;
 ALTER TABLE v3_automation_logs OWNER TO deployer; ALTER TABLE quotes OWNER TO deployer; SET ROLE deployer;`)
  for (const file of ['v241_value_events.sql', 'v245_value_money_events.sql'])
    await f.db.exec(readFileSync('sql/' + file, 'utf8'))
  await f.db.exec('RESET ROLE')
})
test.afterAll(async () => {
  await f?.db.close()
})
test.beforeEach(async () => {
  await f.db.exec('BEGIN')
})
test.afterEach(async () => {
  await f.db.exec('ROLLBACK; RESET ROLE')
})
async function rejected(run: () => Promise<unknown>, message: string) {
  await f.db.exec('SAVEPOINT expected_error')
  try {
    await expect(run()).rejects.toThrow(message)
  } finally {
    await f.db.exec(
      'ROLLBACK TO SAVEPOINT expected_error; RELEASE SAVEPOINT expected_error',
    )
  }
}
async function observe() {
  const rows = (
    await f.db.query<any>(
      "SELECT id FROM financial_events WHERE business_id='a' ORDER BY seq",
    )
  ).rows
  for (const e of rows)
    await domain(f.db, 'record_value_money_event', ['a', e.id])
  return (
    await f.db.query<any>(
      "SELECT payload FROM value_events WHERE event_type='money_state_observed' ORDER BY seq DESC LIMIT 1",
    )
  ).rows[0]?.payload
}
test('issuance and settlement replay once, partial is not fully paid; allocations work without facade correlation', async () => {
  await seedInvoice(f.db, 'i', '1000')
  const r = (await issue(f.db, 'i')).receivables[0]
  expect(await observe()).toMatchObject({
    billed_minor: '100000',
    paid_minor: '0',
    customer_settled: false,
  })
  const p = await settle(f.db, '40000')
  await allocate(f.db, p.payment_id, r.id, '40000')
  expect(await observe()).toMatchObject({
    allocated_customer_minor: '40000',
    paid_minor: '0',
  })
  const p2 = await settle(f.db, '60000', 'p2')
  await allocate(f.db, p2.payment_id, r.id, '60000', 'a2')
  expect(await observe()).toMatchObject({
    paid_minor: '100000',
    customer_settled: true,
  })
  const count = (
    await f.db.query<any>('SELECT count(*)::int n FROM value_events')
  ).rows[0].n
  await observe()
  expect(
    (await f.db.query<any>('SELECT count(*)::int n FROM value_events')).rows[0]
      .n,
  ).toBe(count)
  expect(
    (
      await f.db.query<any>(
        "SELECT amount_minor::text FROM value_events WHERE event_type='payment_received'",
      )
    ).rows,
  ).toEqual([{ amount_minor: '100000' }])
})
test('ROT customer and authority allocations stay separate; reversal removes current paid evidence', async () => {
  await seedInvoice(f.db, 'i', '1000', 'a', 'rot', '700')
  const rs = (await issue(f.db, 'i')).receivables
  const customer = rs.find((r) => r.component === 'customer')!,
    tax = rs.find((r) => r.component === 'tax_authority')!
  const p = await settle(f.db, '70000')
  const a: any = await allocate(f.db, p.payment_id, customer.id, '70000')
  const pt = await settle(f.db, '30000', 'tax')
  await allocate(f.db, pt.payment_id, tax.id, '30000', 'tax')
  expect(await observe()).toMatchObject({
    paid_minor: '70000',
    billed_minor: '100000',
  })
  await domain(f.db, 'reverse_payment_allocation', [
    'a',
    a.allocation_id,
    'Incorrect match',
    'system',
    null,
  ])
  expect(await observe()).toMatchObject({
    paid_minor: '0',
    customer_settled: false,
    allocated_customer_minor: '0',
  })
  expect(
    (
      await f.db.query<any>(
        "SELECT count(*)::int n FROM value_events WHERE event_type='payment_received'",
      )
    ).rows[0].n,
  ).toBe(1)
})
test('credit is not payment; delayed consumption reconstructs historical settlement before reversal', async () => {
  await seedInvoice(f.db, 'i', '1000')
  const r = (await issue(f.db, 'i')).receivables[0]
  const p = await settle(f.db, '100000')
  const a: any = await allocate(f.db, p.payment_id, r.id, '100000')
  await domain(f.db, 'reverse_payment_allocation', [
    'a',
    a.allocation_id,
    'Incorrect match',
    'system',
    null,
  ])
  await adjust(f.db, r.id, '-100000', 'credit')
  expect(await observe()).toMatchObject({
    billed_minor: '0',
    paid_minor: '0',
    customer_status: 'closed',
  })
  expect(
    (
      await f.db.query<any>(
        "SELECT amount_minor::text FROM value_events WHERE event_type='payment_received'",
      )
    ).rows,
  ).toEqual([{ amount_minor: '100000' }])
})
test('trusted boundary isolates tenants, retains immutability and denies generic money publication', async () => {
  await seedInvoice(f.db, 'i', '1000')
  await issue(f.db, 'i')
  await observe()
  const e = (
    await f.db.query<any>(
      "SELECT id FROM financial_events WHERE business_id='a' LIMIT 1",
    )
  ).rows[0]
  await rejected(
    () => domain(f.db, 'record_value_money_event', ['b', e.id]),
    'value_money_event_not_found',
  )
  await rejected(
    () =>
      domain(f.db, 'append_value_event', [
        'a',
        { event_type: 'payment_received' },
      ]),
    'value_event_type_not_allowed',
  )
  await f.db.exec('RESET ROLE')
  await rejected(
    () => f.db.exec('UPDATE value_events SET amount_minor=0'),
    'value_events_immutable',
  )
  await f.db.exec(
    "SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'",
  )
  expect((await f.db.query('SELECT * FROM value_events')).rows).toEqual([])
  await rejected(
    () => domain(f.db, 'record_value_money_event', ['a', e.id]),
    'permission denied',
  )
  await rejected(
    () => domain(f.db, 'read_value_invoice_evidence', ['a', ['i']]),
    'permission denied',
  )
})
test('reader refuses backlog and missing evidence; never silently falls back to invoice columns', async () => {
  await seedInvoice(f.db, 'i', '1000')
  await issue(f.db, 'i')
  await observe()
  await rejected(
    () => domain(f.db, 'read_value_invoice_evidence', ['a', ['i']]),
    'value_money_projection_not_ready',
  )
  await f.db.exec(
    "RESET ROLE; INSERT INTO financial_event_consumers(business_id,consumer,last_seq) SELECT 'a','value-ledger',max(seq) FROM financial_events WHERE business_id='a'; SET ROLE service_role",
  )
  const result: any = await domain(f.db, 'read_value_invoice_evidence', [
    'a',
    ['i'],
  ])
  expect(result.invoices[0]).toMatchObject({ billed_minor: '100000' })
  await rejected(
    () => domain(f.db, 'read_value_invoice_evidence', ['a', ['unknown']]),
    'value_money_evidence_missing',
  )
})

test('C3 replay after projection commit and before ack produces exactly one issuance and catches up', async () => {
  const { consumeOnce } = await import('../lib/financial-kernel/events/consume')
  const { valueLedgerConsumer } = await import(
    '../lib/value/events/kernel-consumer'
  )
  await seedInvoice(f.db, 'i', '1000')
  await issue(f.db, 'i')
  let loseAck = true
  const unreliable = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'ack_financial_event' && loseAck) {
        loseAck = false
        throw new Error('ack response lost before commit')
      }
      return c5bRpc(f).rpc(name, args)
    },
  }
  await expect(
    consumeOnce(unreliable, 'a', valueLedgerConsumer),
  ).rejects.toThrow('ack response lost')
  expect(
    (
      await f.db.query<any>(
        "SELECT count(*)::int n FROM value_events WHERE event_type='invoice_issued'",
      )
    ).rows[0].n,
  ).toBe(1)
  await consumeOnce(c5bRpc(f), 'a', valueLedgerConsumer)
  expect(
    (
      await f.db.query<any>(
        "SELECT count(*)::int n FROM value_events WHERE event_type='invoice_issued'",
      )
    ).rows[0].n,
  ).toBe(1)
  const result: any = await domain(f.db, 'read_value_invoice_evidence', [
    'a',
    ['i'],
  ])
  expect(result.invoices[0].billed_minor).toBe('100000')
})
test('reader omits known drafts, blocks unprojected issued invoices and uses current net payment window', async () => {
  const { consumeOnce } = await import('../lib/financial-kernel/events/consume')
  const { valueLedgerConsumer } = await import(
    '../lib/value/events/kernel-consumer'
  )
  await seedInvoice(f.db, 'draft', '1000')
  await f.db.exec(
    "RESET ROLE; UPDATE invoice SET status='draft' WHERE invoice_id='draft'; SET ROLE service_role",
  )
  expect(
    (await domain<any>(f.db, 'read_value_invoice_evidence', ['a', ['draft']]))
      .invoices,
  ).toEqual([])
  await seedInvoice(f.db, 'i', '1000')
  const r = (await issue(f.db, 'i')).receivables[0]
  const p = await settle(f.db, '100000')
  const allocation: any = await allocate(f.db, p.payment_id, r.id, '100000')
  await consumeOnce(c5bRpc(f), 'a', valueLedgerConsumer)
  let window: any = await domain(f.db, 'read_value_payment_window', [
    'a',
    '2026-09-01',
    '2026-10-01',
    '',
  ])
  expect(window.payments).toHaveLength(1)
  expect(window.payments[0]).toMatchObject({
    invoice_id: 'i',
    paid_minor: '100000',
    customer_id: 'customer',
  })
  expect(
    (
      await domain<any>(f.db, 'read_value_payment_window', [
        'a',
        '2026-08-01',
        '2026-09-01',
        '',
      ])
    ).payments,
  ).toEqual([])
  await domain(f.db, 'reverse_payment_allocation', [
    'a',
    allocation.allocation_id,
    'Incorrect match',
    'system',
    null,
  ])
  await consumeOnce(c5bRpc(f), 'a', valueLedgerConsumer)
  window = await domain(f.db, 'read_value_payment_window', [
    'a',
    '2026-09-01',
    '2026-10-01',
    '',
  ])
  expect(window.payments).toEqual([])
  await seedInvoice(f.db, 'legacy', '1000')
  await rejected(
    () => domain(f.db, 'read_value_invoice_evidence', ['a', ['legacy']]),
    'value_money_evidence_missing',
  )
})
test('rounding and write-off close receivables without inventing customer cash', async () => {
  await seedInvoice(f.db, 'i', '1000.01')
  const r = (await issue(f.db, 'i')).receivables[0]
  const p = await settle(f.db, '100000')
  await allocate(f.db, p.payment_id, r.id, '100000')
  await adjust(f.db, r.id, '-1', 'rounding')
  expect(await observe()).toMatchObject({
    billed_minor: '100001',
    allocated_customer_minor: '100000',
    paid_minor: '100000',
  })
  await seedInvoice(f.db, 'writeoff', '500')
  const w = (await issue(f.db, 'writeoff')).receivables[0]
  await adjust(f.db, w.id, '-50000', 'write_off', 'writeoff')
  expect(await observe()).toMatchObject({
    billed_minor: '50000',
    paid_minor: '0',
    allocated_customer_minor: '0',
  })
})
async function publishTest(
  event: string,
  sourceType: string,
  sourceId: string,
  key: string,
  payload: any,
) {
  return (
    await f.db.query<any>(
      `SELECT * FROM append_financial_event('a',$1,1,'2026-09-14'::timestamptz,'2026-09-14'::date,$2,$3,'fin_test_money',NULL,$4,'SEK',0,$5,'system',NULL)`,
      [event, sourceType, sourceId, key, payload],
    )
  ).rows[0].id
}
test('another receivable or contradictory invoice source cannot become monetary evidence', async () => {
  await seedInvoice(f.db, 'i', '1000')
  const one = (await issue(f.db, 'i')).receivables[0]
  await seedInvoice(f.db, 'other', '500')
  const other = (await issue(f.db, 'other')).receivables[0]
  const wrong = await publishTest(
    'receivable_settled',
    'receivable',
    one.id,
    'wrong-rec',
    { receivable_id: other.id, invoice_id: 'other', component: 'customer' },
  )
  await rejected(
    () => domain(f.db, 'record_value_money_event', ['a', wrong]),
    'value_money_receivable_mismatch',
  )
  const wrongIssue = await publishTest(
    'invoice_issued',
    'invoice',
    'i',
    'wrong-source',
    { invoice_id: 'other' },
  )
  await rejected(
    () => domain(f.db, 'record_value_money_event', ['a', wrongIssue]),
    'value_money_source_mismatch',
  )
  expect((await f.db.query('SELECT * FROM value_events')).rows).toEqual([])
})
test('unallocated overpayment is not counted as an invoice payment', async () => {
  await seedInvoice(f.db, 'i', '1000')
  const r = (await issue(f.db, 'i')).receivables[0]
  const p = await settle(f.db, '120000')
  await allocate(f.db, p.payment_id, r.id, '100000')
  expect(await observe()).toMatchObject({
    paid_minor: '100000',
    allocated_customer_minor: '100000',
    billed_minor: '100000',
  })
})
test('unmapped future money event halts C3 and requires a reasoned manual resume', async () => {
  const { consumeOnce } = await import('../lib/financial-kernel/events/consume')
  const { valueLedgerConsumer } = await import(
    '../lib/value/events/kernel-consumer'
  )
  await publishTest('payment_refunded', 'payment', 'future', 'refund', {})
  expect(
    await consumeOnce(c5bRpc(f), 'a', valueLedgerConsumer, { maxAttempts: 1 }),
  ).toMatchObject({ failed: 1, halted: true })
  await rejected(
    () => domain(f.db, 'read_value_invoice_evidence', ['a', []]),
    'value_money_projection_not_ready',
  )
  await rejected(
    () =>
      domain(f.db, 'resume_financial_consumer', [
        'a',
        'value-ledger',
        'reviewer',
        ' ',
      ]),
    'financial_consumer_resume_requires_actor_and_reason',
  )
  expect(
    await domain(f.db, 'resume_financial_consumer', [
      'a',
      'value-ledger',
      'reviewer',
      'Mapping reviewed; retry after deployment',
    ]),
  ).toBe(true)
})
