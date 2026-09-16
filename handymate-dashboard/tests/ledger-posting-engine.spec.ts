/**
 * Ledger (Paket C8) — posting engine mot riktig consume.ts (v236) och riktig v251 i PGlite.
 * En testregel; registret i lib/ledger är tomt. Bevisar: en bokföring per event, idempotent
 * omleverans, determinism, stopp utan delvis bokföring när ett konto saknas, ack utan
 * bokföring när ingen regel finns.
 */
import { test, expect } from '@playwright/test'
import type { PGlite } from '@electric-sql/pglite'
import { appendFinancialEvent, correlationId, idempotencyKey, type KernelDb } from '../lib/financial-kernel/events/publish'
import { consumeOnce } from '../lib/financial-kernel/events/consume'
import type { FinancialEventEnvelope } from '../lib/financial-kernel/events/types'
import { money } from '../lib/financial-kernel/money'
import {
  JournalDraftInvalidError, LEDGER_POSTING_CONSUMER, LedgerAccountMissingError, accountFor, createRuleRegistry, ledgerPostingHandler,
  postEvent, postingIdempotencyKey, validateDraft, type JournalDraft, type PostingRule, type PostingRuleContext,
} from '../lib/ledger/posting-engine'
import { account, events, journal, ledgerDatabase, openFy, rows } from './helpers/ledger-database'

let db: PGlite
let rpc: KernelDb
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { test.setTimeout(120_000); ({ db, rpc } = await ledgerDatabase()) })
test.afterAll(async () => { await db?.close() })
test.beforeEach(async () => {
  await db.exec('BEGIN')
  await openFy(db, 'a', '2026-01-01', '2026-12-31'); await journal(db, 'a', 'A')
  for (const [n, t] of [['1510', 'asset'], ['3001', 'revenue'], ['2611', 'liability']]) await account(db, 'a', n, t)
  await db.exec('SET LOCAL ROLE service_role')
})
test.afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })

const CTX: PostingRuleContext = { accounts: { receivable: '1510', revenue: '3001', vat_out: '2611' } }
/** Testregel: kundfaktura 25 % moms ur payloadens total. Bara mekanik; inte ett kontobeslut. */
const customerInvoice: PostingRule<'invoice_issued'> = {
  id: 'test.customer_invoice', version: 1, eventTypes: ['invoice_issued'],
  draft(event, ctx): JournalDraft {
    const total = BigInt(event.payload.total_minor)
    const net = total * BigInt(4) / BigInt(5)
    return {
      series: 'A', journalType: 'standard', effectiveDate: event.payload.issued_date, currency: event.payload.currency,
      description: `Faktura ${event.payload.invoice_number}`,
      lines: [
        { account: accountFor(ctx, 'receivable'), debitMinor: total.toString() },
        { account: accountFor(ctx, 'revenue'), creditMinor: net.toString() },
        { account: accountFor(ctx, 'vat_out'), creditMinor: (total - net).toString() },
      ],
    }
  },
}
function registryWith(...rules: PostingRule[]) { const r = createRuleRegistry(); for (const rule of rules) r.register(rule); return r }
async function issued(id = 'F-1') {
  return (await appendFinancialEvent(rpc, {
    businessId: 'a', eventType: 'invoice_issued', occurredAt: '2026-03-10T09:00:00Z', effectiveDate: '2026-03-10',
    source: { type: 'invoice', id }, correlationId: correlationId('invoice', id), idempotencyKey: idempotencyKey('invoice', 'issued', id),
    amount: money(BigInt(1250000), 'SEK'), actor: { type: 'system' },
    payload: { invoice_id: id, invoice_number: id, customer_id: 'c1', currency: 'SEK', total_minor: '1250000', vat_regime: 'standard',
      accounting_method: 'accrual', issued_date: '2026-03-10', due_date: '2026-04-09' },
  })).event
}
const entries = () => rows<{ id: string; source_event_id: string; idempotency_key: string; posting_rule_id: string; posting_rule_version: number; actor_type: string; voucher_number: number }>(
  db, 'SELECT id, source_event_id, idempotency_key, posting_rule_id, posting_rule_version, actor_type, voucher_number FROM ledger_entries ORDER BY voucher_number')
const consume = (handler: ReturnType<typeof ledgerPostingHandler>, opts: { maxAttempts?: number } = {}) =>
  consumeOnce(rpc, 'a', handler, { limit: 10, leaseSeconds: 60, handlerTimeoutMs: 5_000, ...opts })

test('the handler posts one entry per event through the consumer, with the event as source and the key ledger:<event>:<rule>:v<n>', async () => {
  const ev = await issued()
  const posted: string[] = []
  const handler = ledgerPostingHandler(registryWith(customerInvoice), async () => CTX, (_e, out) => posted.push(...out.map(o => o.entry.id)))
  expect(handler.consumer).toBe(LEDGER_POSTING_CONSUMER)
  const result = await consume(handler)
  expect(result).toMatchObject({ claimed: 1, delivered: 1, failed: 0, halted: false })
  const [e] = await entries()
  expect(e).toMatchObject({ source_event_id: ev.eventId, idempotency_key: postingIdempotencyKey(ev.eventId, customerInvoice), posting_rule_id: 'test.customer_invoice', posting_rule_version: 1, actor_type: 'system', voucher_number: 1 })
  expect(posted).toEqual([e.id])
  const lines = await rows<{ account: string; debit_minor: string; credit_minor: string }>(db, 'SELECT a.number account, l.debit_minor::text debit_minor, l.credit_minor::text credit_minor FROM ledger_entry_lines l JOIN ledger_accounts a ON a.id=l.account_id ORDER BY l.line_no')
  expect(lines).toEqual([{ account: '1510', debit_minor: '1250000', credit_minor: '0' }, { account: '3001', debit_minor: '0', credit_minor: '1000000' }, { account: '2611', debit_minor: '0', credit_minor: '250000' }])
  const appended = await events(db, 'journal_entry_posted')
  expect(appended).toHaveLength(1); expect(appended[0].causation_id).toBe(ev.eventId)
  // Bokföringseventet hamnar i samma kö; utan regel för det ackas det utan ny bokföring.
  expect(await consume(handler)).toMatchObject({ claimed: 1, delivered: 1, failed: 0 })
  expect(await entries()).toHaveLength(1)
})

test('at-least-once: the same event delivered twice posts once, and the replay returns the same entry', async () => {
  const ev = await issued()
  const registry = registryWith(customerInvoice)
  const first = await postEvent(rpc, ev, registry, CTX)
  const second = await postEvent(rpc, ev, registry, CTX)
  expect(first[0].inserted).toBe(true); expect(second[0].inserted).toBe(false); expect(second[0].entry.id).toBe(first[0].entry.id)
  expect(await entries()).toHaveLength(1); expect(await events(db, 'journal_entry_posted')).toHaveLength(1)
})

test('determinism: the same event and rule version give byte-identical drafts; a new version is a new key', async () => {
  const ev = await issued()
  const a = JSON.stringify(customerInvoice.draft(ev as FinancialEventEnvelope<'invoice_issued'>, CTX))
  const b = JSON.stringify(customerInvoice.draft(ev as FinancialEventEnvelope<'invoice_issued'>, CTX))
  expect(a).toBe(b)
  expect(postingIdempotencyKey(ev.eventId, { id: 'r', version: 1 })).not.toBe(postingIdempotencyKey(ev.eventId, { id: 'r', version: 2 }))
})

test('a rule that names an account missing from the context stops the consumer with no entry and no event', async () => {
  const ev = await issued()
  const handler = ledgerPostingHandler(registryWith(customerInvoice), async () => ({ accounts: { receivable: '1510', revenue: '3001' } }))
  const result = await consume(handler, { maxAttempts: 2 })
  expect(result).toMatchObject({ claimed: 1, delivered: 0, failed: 1, halted: false })
  expect(await entries()).toHaveLength(0); expect(await events(db, 'journal_entry_posted')).toHaveLength(0)
  const delivery = (await rows<{ attempts: number; last_error: string }>(db, 'SELECT attempts, last_error FROM financial_event_deliveries WHERE event_id=$1', [ev.eventId]))[0]
  expect(delivery.attempts).toBe(1); expect(delivery.last_error).toContain('ledger_account_missing:vat_out')
  // consumeOnce släpper leasen i finally; nästa körning är försök två och stoppar konsumenten.
  expect(await consume(handler, { maxAttempts: 2 })).toMatchObject({ failed: 1, halted: true })
  expect(await entries()).toHaveLength(0)
  expect(() => accountFor(CTX, 'bank')).toThrow(LedgerAccountMissingError)
})

test('an unbalanced or one-line draft never reaches the database', async () => {
  const ev = await issued()
  const broken: PostingRule<'invoice_issued'> = {
    id: 'test.broken', version: 1, eventTypes: ['invoice_issued'],
    draft: () => ({ series: 'A', journalType: 'standard', effectiveDate: '2026-03-10', currency: 'SEK', description: 'x',
      lines: [{ account: '1510', debitMinor: '100' }, { account: '3001', creditMinor: '99' }] }),
  }
  await expect(postEvent(rpc, ev, registryWith(customerInvoice, broken), CTX)).rejects.toThrow(JournalDraftInvalidError)
  expect(await entries()).toHaveLength(0)
  expect(() => validateDraft({ series: 'A', journalType: 'standard', effectiveDate: '2026-03-10', currency: 'SEK', description: 'x', lines: [{ account: '1510', debitMinor: '1' }] })).toThrow('lines_required')
  expect(() => validateDraft({ series: 'A', journalType: 'standard', effectiveDate: '2026-03-10', currency: 'SEK', description: 'x', lines: [{ account: '1510', debitMinor: '1.5' }, { account: '3001', creditMinor: '1.5' }] })).toThrow('amount_invalid')
  expect(() => validateDraft({ series: 'A', journalType: 'standard', effectiveDate: '2026-03-10', currency: 'SEK', description: 'x', lines: [{ account: '1510', debitMinor: '1', creditMinor: '1' }, { account: '3001', creditMinor: '1' }] })).toThrow('line_one_side')
})

test('an empty registry or a rule that returns null acks the event without posting', async () => {
  await issued()
  const nothing: PostingRule<'invoice_issued'> = { id: 'test.silent', version: 1, eventTypes: ['invoice_issued'], draft: () => null }
  expect(await consume(ledgerPostingHandler(createRuleRegistry(), async () => { throw new Error('never resolved') }))).toMatchObject({ delivered: 1, failed: 0 })
  await issued('F-2')
  expect(await consume(ledgerPostingHandler(registryWith(nothing), async () => CTX))).toMatchObject({ delivered: 1, failed: 0 })
  expect(await entries()).toHaveLength(0)
})

test('the registry refuses the reserved rule ids, version 0 and duplicates; it ships empty', async () => {
  const r = createRuleRegistry()
  expect(r.size).toBe(0)
  expect(() => r.register({ ...customerInvoice, id: 'manual' })).toThrow('Invalid rule id')
  expect(() => r.register({ ...customerInvoice, id: 'reversal' })).toThrow('Invalid rule id')
  expect(() => r.register({ ...customerInvoice, version: 0 })).toThrow('positive integer')
  r.register(customerInvoice)
  expect(() => r.register(customerInvoice)).toThrow('already registered')
  expect(r.rulesFor('invoice_issued')).toHaveLength(1); expect(r.rulesFor('payment_settled')).toHaveLength(0)
})
