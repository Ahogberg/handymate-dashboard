/** Diagnostic counterexamples, not C5 acceptance. Executes the exact SQL in the v2 brief. */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { receivablesDatabase, seedInvoice, domain } from './helpers/financial-receivables-database'

let fixture: Awaited<ReturnType<typeof receivablesDatabase>>
type Outcome = { command_id: string; state: string; recorded_minor?: string; settled_now?: string[];
  receivables?: { component: string; status: string; outstanding_minor: string }[];
  intents: { id: string }[]; replayed: boolean }
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  fixture = await receivablesDatabase()
  await fixture.db.exec("SET ROLE deployer; ALTER TABLE invoice ADD COLUMN status text DEFAULT 'sent', ADD COLUMN paid_amount numeric")
  const brief = readFileSync('../docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md', 'utf8')
  const sql = brief.match(/```sql\r?\n(-- v239_financial_payment_commands.sql[\s\S]*?)\r?\n```/)?.[1]
  if (!sql) throw Error('Missing v2 DDL in package log')
  await fixture.db.exec(sql)
  await fixture.db.exec('RESET ROLE')
})
test.afterAll(async () => { await fixture?.db.close() })
test.beforeEach(async () => { await fixture.db.exec('BEGIN'); await seedInvoice(fixture.db, 'rot', '12500', 'a', 'rot', '9500') })
test.afterEach(async () => { await fixture.db.exec('ROLLBACK; RESET ROLE') })
function command(key: string, amount: string | null = null, observation: unknown = null) {
  return domain<Outcome>(fixture.db, 'execute_payment_command', ['a', key, 'rot', 'status_patch', null, amount,
    '2026-09-14T12:00:00Z', 'manual', null, 'manual', observation, '100', ['portal_message'], 'user', 'test'])
}

test('v2: old command replay returns obsolete projection after tax settlement', async () => {
  const customer = await command('status_patch:customer')
  const tax = await command('status_patch:tax')
  expect(tax.recorded_minor).toBe('1250000')
  expect(tax.receivables?.map(r => r.status)).toEqual(['settled', 'settled'])
  const replay = await command('status_patch:customer')
  expect(replay.replayed).toBe(true)
  expect(replay.recorded_minor).toBe('950000')
  expect(replay.settled_now).toEqual(['customer'])
  expect(replay.receivables?.find(r => r.component === 'tax_authority')?.status).toBe('open')
  expect(replay.receivables).toEqual(customer.receivables)
  // The mandated app-side rewrite would downgrade paid/12500 to customer_paid/9500.
})

test('v2: no_new_money does not return the projection fields its facade algorithm requires', async () => {
  await command('status_patch:customer')
  const observation = await command('status_patch:observation', null, { paid_minor: '950000' })
  expect(observation.state).toBe('no_new_money')
  expect(observation.receivables).toBeUndefined()
  expect(observation.recorded_minor).toBeUndefined()
})

test('v2: delayed duplicate finish can fail a newer attempt and allow a third sender', async () => {
  const out = await command('status_patch:customer')
  const intentId = out.intents[0].id
  const claim = () => domain<{ claimed: { id: string; attempts: number }[] }>(fixture.db, 'claim_effect_intents', ['a', 'rot', 3, 10])
  const oldFinish = () => domain(fixture.db, 'finish_effect_intent', ['a', intentId, 'failed', { attempt: 1 }, 'first attempt failed'])
  expect((await claim()).claimed[0].attempts).toBe(1)
  await oldFinish() // committed, but imagine the response was lost in transport
  expect((await claim()).claimed[0].attempts).toBe(2) // worker two is now sending
  await oldFinish() // worker one's HTTP retry has no attempt token; it succeeds
  expect((await claim()).claimed[0].attempts).toBe(3) // now a third worker may send
})

test('v2: actual unchanged status route calls SMS twice for the required replay transition', async () => {
  let sends = 0
  const first = await command('status_patch:customer')
  const replay = await command('status_patch:customer')
  expect(first.settled_now).toEqual(['customer'])
  expect(replay.settled_now).toEqual(['customer'])
  const invoice = { invoice_id: 'rot', status: 'customer_paid', total: 12500, customer_id: 'test-customer', customer: { name: 'Test', phone_number: '+46700000000' } }
  const supabase = { from(table: string) {
    const q = { select: (_s: string) => q, eq: (_k: string, _v: unknown) => q,
      single: async () => ({ data: table === 'invoice' ? invoice : { business_name: 'Test', review_request_enabled: false }, error: null }) }
    return q
  } }
  const deps: Record<string, unknown> = {
    'next/server': { NextResponse }, '@/lib/supabase': { getServerSupabase: () => supabase },
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'a' }) },
    // v2 mandates this same transition on replay. We inject the facade result;
    // the real route is executed, and the provider is stubbed (no external SMS).
    '@/lib/invoices/apply-payment': { applyInvoicePayment: async () => ({ ok: true, transition: 'to_customer_paid', remaining_rot_kr: 3000 }) },
    '@/lib/sms-send': { sendSmsViaElks: async (args: Record<string, unknown>) => { expect(args.approvalId).toBeUndefined(); sends++; return { success: true } } },
  }
  const js = ts.transpileModule(readFileSync('app/api/invoices/[id]/status/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const module = { exports: {} as { PATCH: (req: NextRequest, ctx: { params: { id: string } }) => Promise<NextResponse> } }
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (!(name in deps)) throw Error('Unstubbed dependency: ' + name)
    return deps[name]
  }, module, module.exports)
  for (let i = 0; i < 2; i++) {
    const response = await module.exports.PATCH(new NextRequest('https://test.local/status', {
      method: 'PATCH', body: JSON.stringify({ status: 'paid' }), headers: { 'Idempotency-Key': 'same-command' },
    }), { params: { id: 'rot' } })
    expect(response.status).toBe(200)
  }
  expect(sends).toBe(2)
})
