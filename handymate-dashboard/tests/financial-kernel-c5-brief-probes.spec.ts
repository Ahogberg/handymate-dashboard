/**
 * Review probes for the C5 proposal in PR #59, NOT facade acceptance tests.
 * These deliberately demonstrate counterexamples to the proposed algorithm.
 * The RPCs and Fortnox caller are real; proposal-only steps are named explicitly.
 * Convert these into prevention tests when the contract is corrected.
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { receivablesDatabase, seedInvoice, issue, settle, allocate, domain } from './helpers/financial-receivables-database'
import { isFinancialKernelEnabled } from '../lib/financial-kernel/flags'
import * as customerShare from '../lib/invoices/customer-share'

let fixture: Awaited<ReturnType<typeof receivablesDatabase>>
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { fixture = await receivablesDatabase() })
test.afterAll(async () => { await fixture?.db.close() })
test.beforeEach(async () => { await fixture.db.exec('BEGIN'); await seedInvoice(fixture.db, 'rot', '12500', 'a', 'rot', '9500') })
test.afterEach(async () => { await fixture.db.exec('ROLLBACK; RESET ROLE') })

test('proposal: deriving identity from the next open component turns a ROT double-click into a tax payment', async () => {
  const { db } = fixture
  async function proposedDerivedCall() {
    const rec = (await issue(db, 'rot')).receivables.find(r => r.status === 'open')!
    const key = `manual:rot:2026-09-20T00:00:${rec.outstanding_minor}:${rec.component}`
    const payment = await settle(db, rec.outstanding_minor, key)
    await allocate(db, payment.payment_id, rec.id, rec.outstanding_minor, key + ':' + rec.component)
    return { component: rec.component, key }
  }
  const first = await proposedDerivedCall()
  const retry = await proposedDerivedCall()
  expect(first.component).toBe('customer')
  expect(retry.component).toBe('tax_authority')
  expect(retry.key).not.toBe(first.key)
  expect((await issue(db, 'rot')).receivables.map(r => r.status)).toEqual(['settled', 'settled'])
  expect((await db.query('SELECT id FROM financial_payments')).rows).toHaveLength(2)
})

test('real C4: same minute identity with a fresh timestamp conflicts on a partial-payment retry', async () => {
  const { db } = fixture
  const args = ['a', 'manual', null, 'inbound', null, 'SEK', '10000', null, 'manual',
    '2026-09-20T00:00:01Z', 'fin_invoice_rot', 'manual:rot:2026-09-20T00:00:10000', 'system', null]
  await domain(db, 'record_payment_settlement', args)
  await db.exec('SAVEPOINT retry')
  args[9] = '2026-09-20T00:00:02Z'
  await expect(domain(db, 'record_payment_settlement', args)).rejects.toThrow('financial_payment_idempotency_conflict')
  await db.exec('ROLLBACK TO SAVEPOINT retry')
})

test('proposal: retry after allocation commits cannot discover a just-settled component from the proposed loop', async () => {
  const { db } = fixture
  const customer = (await issue(db, 'rot')).receivables[0]
  const payment = await settle(db, '950000', 'customer-command')
  await allocate(db, payment.payment_id, customer.id, '950000', 'customer-command:customer')
  // Crash here: no legacy projection or marker/effects have been written.
  const receivables = (await issue(db, 'rot')).receivables
  const replay = await domain<{ unallocated_minor: string }>(db, 'record_payment_settlement',
    ['a', 'manual', null, 'inbound', null, 'SEK', '950000', null, 'manual',
      '2026-09-20T00:00:00Z', null, 'customer-command', 'system', null])
  expect(replay.unallocated_minor).toBe('0')
  expect(receivables[0].status).toBe('settled')
  expect(receivables.filter(r => r.status === 'open' && BigInt(replay.unallocated_minor) > BigInt(0))).toEqual([])
  // The specified loop performs no allocation RPC, so its transition table has
  // neither "customer settled now" nor "tax settled now" to resume the command.
})

function compile(file: string, deps: Record<string, unknown>): Record<string, unknown> {
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (!(name in deps)) throw Error('Unstubbed dependency: ' + name)
    return deps[name]
  }, module, module.exports)
  return module.exports
}

async function captureFortnoxCall(status: string, balance: number) {
  const calls: Record<string, unknown>[] = []
  const invoice = { invoice_id: 'rot', business_id: 'a', status, fortnox_document_number: 'doc-42',
    fortnox_invoice_number: '42', total: 12500, customer_pays: 9500, rot_rut_type: 'rot', paid_amount: status === 'customer_paid' ? 9500 : 0 }
  const supabase = { from(table: string) {
    const query = {
      select: (_fields: string) => query, eq: (_key: string, _value: unknown) => query,
      not: (_key: string, _op: string, _value: unknown) => query,
      update: (_values: unknown) => query,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: table === 'invoice' ? [invoice] : null, error: null }).then(resolve),
    }
    return query
  } }
  const classifier = compile('lib/fortnox/classify-payment.ts', { '@/lib/invoices/customer-share': customerShare })
  const module = compile('lib/fortnox/sync-payments.ts', {
    '@/lib/supabase': { getServerSupabase: () => supabase },
    '@/lib/fortnox': { isFortnoxConnected: async () => true, fortnoxRequest: async () => ({ Invoice: { Total: 12500, Balance: balance, TaxReduction: 3000, TotalToPay: 9500 } }) },
    '@/lib/fortnox/classify-payment': classifier,
    '@/lib/invoices/customer-share': customerShare,
    '@/lib/invoices/apply-payment': { applyInvoicePayment: async (opts: Record<string, unknown>) => { calls.push(opts); return { ok: true, transition: 'none' } } },
  })
  await (module.syncFortnoxPaymentsForBusiness as (id: string) => Promise<unknown>)('a')
  expect(calls).toHaveLength(1)
  return calls[0]
}

test('real Fortnox caller: two distinct balances are indistinguishable at the facade after customer_paid', async () => {
  const zero = await captureFortnoxCall('customer_paid', 0)
  const credit = await captureFortnoxCall('customer_paid', -100)
  expect(zero).toEqual(credit)
  expect(zero).toEqual({ businessId: 'a', invoiceId: 'rot', amount: undefined, paidVia: 'fortnox', source: 'fortnox' })
  expect(zero).not.toHaveProperty('Balance')
  expect(zero).not.toHaveProperty('fortnox_document_number')
})

test('real caller + lazy-issue proposal: old customer_paid invoice records customer share instead of tax remainder', async () => {
  const { db } = fixture
  const opts = await captureFortnoxCall('customer_paid', 0)
  expect(opts.amount).toBeUndefined()
  // Old invoice has 9,500 kr paid in legacy, but no kernel history (C4b deferred).
  const next = (await issue(db, 'rot')).receivables.find(r => r.status === 'open')!
  expect(next.component).toBe('customer')
  expect(next.outstanding_minor).toBe('950000') // actual remaining tax payment is 300000
  const pay = await settle(db, next.outstanding_minor, 'fortnox-import')
  await allocate(db, pay.payment_id, next.id, next.outstanding_minor, 'fortnox-import:customer')
  expect((await issue(db, 'rot')).receivables.map(r => r.status)).toEqual(['settled', 'open'])
})

test('real C4 flag helper makes one kernel RPC even for a disabled business', async () => {
  const calls: string[] = []
  const enabled = await isFinancialKernelEnabled({ async rpc(name, args) {
    calls.push(name)
    return fixture.rpc.rpc(name, args)
  } }, 'a')
  expect(enabled).toBe(false)
  expect(calls).toEqual(['financial_kernel_flags'])
})
