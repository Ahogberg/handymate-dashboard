import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { FINANCIAL_EVENT_TYPES } from '../lib/financial-kernel/events/catalog'
import { envelopeFromRow, rowFromEnvelope, type FinancialEventRow, type FinancialEventPayloads } from '../lib/financial-kernel/events/types'
import type { FinancialEventType } from '../lib/financial-kernel/events/catalog'

// tsc checks coverage and prevents premature payloads from later packages.
type Assert<T extends true> = T
type SameKeys = Assert<[Exclude<keyof FinancialEventPayloads, FinancialEventType>, Exclude<FinancialEventType, keyof FinancialEventPayloads>] extends [never, never] ? true : false>
const completeCatalog: SameKeys = true
function typeContract() {
  // @ts-expect-error C7 has not defined its payload yet
  const future: FinancialEventPayloads['payment_intent_created'] = {}
  // @ts-expect-error invoice VAT regime and accounting method are mandatory
  const incomplete: FinancialEventPayloads['invoice_issued'] = { invoice_id: 'i' }
  return [future, incomplete, completeCatalog]
}
void typeContract

const migration = () => readFileSync('sql/v235_financial_events.sql', 'utf8')
let db: PGlite
const userA = '00000000-0000-0000-0000-000000000001'
const userB = '00000000-0000-0000-0000-000000000002'
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  test.setTimeout(60_000)
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE business_config(business_id text PRIMARY KEY, user_id uuid);
    CREATE TABLE business_users(business_id text, user_id uuid, is_active boolean);
    INSERT INTO business_config VALUES ('a', NULL), ('b', '${userB}');
    INSERT INTO business_users VALUES ('a', '${userA}', true);
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;`)
  const tenantSql = readFileSync('sql/testbed_tenant_isolation.sql', 'utf8')
  const helper = tenantSql.match(/CREATE OR REPLACE FUNCTION public\.is_business_member[\s\S]*?\$function\$;/)
  if (!helper) throw Error('Missing real membership function')
  await db.exec(helper[0])
  await db.exec('REVOKE ALL ON FUNCTION public.is_business_member(text) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.is_business_member(text) TO authenticated, service_role;')
  await db.exec(migration())
})
test.afterAll(async () => { await db?.close() })
test.beforeEach(async () => { await db.exec('BEGIN') })
test.afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })

type Input = Omit<FinancialEventRow, 'id' | 'seq' | 'created_at'>
function input(overrides: Partial<Input> = {}): Input {
  return { business_id: 'a', event_type: 'payment_settled', schema_version: 1,
    occurred_at: '2026-09-13T12:00:00Z', effective_date: '2026-09-12', source_type: 'payment', source_id: 'p1',
    correlation_id: 'fin_payment_p1', causation_id: null, idempotency_key: 'manual:p1', currency: 'SEK', amount_minor: '100',
    payload: { payment_id: 'p1', currency: 'SEK', amount_minor: 100, settled_at: '2026-09-13T12:00:00Z', evidence: 'manual' },
    actor_type: 'system', actor_id: null, ...overrides }
}
async function append(overrides: Partial<Input> = {}) {
  const v = input(overrides)
  const args = [v.business_id, v.event_type, v.schema_version, v.occurred_at, v.effective_date,
    v.source_type, v.source_id, v.correlation_id, v.causation_id, v.idempotency_key,
    v.currency, v.amount_minor, JSON.stringify(v.payload), v.actor_type, v.actor_id]
  // Explicit text projections prevent a JSONB conversion from rounding BIGINT.
  const r = await db.query<{ id: string; seq: string; amount_minor: string | null; inserted: boolean }>(
    `SELECT (event).id, (event).seq::text, (event).amount_minor::text, inserted
     FROM public.append_financial_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, args)
  return r.rows[0]
}
async function rejects(run: () => Promise<unknown>, message: RegExp) {
  await db.exec('SAVEPOINT rejected_call')
  try { await expect(run()).rejects.toThrow(message) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT rejected_call; RELEASE SAVEPOINT rejected_call') }
}
async function role(name: 'service_role' | 'anon' | 'authenticated', run: () => Promise<void>) {
  await db.exec(`SET LOCAL ROLE ${name}`)
  try { await run() } finally { await db.exec('RESET ROLE') }
}
async function count() { return (await db.query<{ n: number }>('SELECT count(*)::int n FROM financial_events')).rows[0].n }

test('1: repeated key returns one immutable event; same key is independent per business', async () => {
  await role('service_role', async () => {
    const first = await append(), replay = await append()
    expect(first.inserted).toBe(true); expect(replay).toEqual({ ...first, inserted: false })
    expect((await append({ business_id: 'b' })).id).not.toBe(first.id)
  })
  expect(await count()).toBe(2)
})
test('2: changed payload or monetary identity under one key fails without inserting', async () => {
  await append()
  for (const change of [{ payload: { different: true } }, { amount_minor: '101' }, { currency: 'EUR' }, { event_type: 'payment_initiated' }]) {
    await rejects(() => append(change as Partial<Input>), /financial_event_idempotency_conflict/)
  }
  expect(await count()).toBe(1)
})
test('3: CHECK list exactly equals catalog; undocumented event rejected', async () => {
  const block = migration().match(/CHECK \(event_type IN \(([\s\S]*?)\)\)/)?.[1]
  expect(block).toBeDefined()
  const names = Array.from(block!.matchAll(/'([a-z_]+)'/g), m => m[1])
  expect(names.sort()).toEqual([...FINANCIAL_EVENT_TYPES].sort())
  await rejects(() => append({ event_type: 'unknown_event' } as unknown as Partial<Input>), /check constraint/)
})
test('4: causation cannot cross tenants; existing same-tenant chain can be walked', async () => {
  const parent = await append()
  await rejects(() => append({ business_id: 'b', causation_id: parent.id }), /foreign key constraint/)
  await rejects(() => append({ causation_id: 'missing', idempotency_key: 'missing' }), /foreign key constraint/)
  const child = await append({ causation_id: parent.id, idempotency_key: 'child' })
  const chain = await db.query<{ id: string }>("SELECT id FROM financial_events WHERE business_id='a' AND correlation_id='fin_payment_p1' ORDER BY seq")
  expect(chain.rows.map(r => r.id)).toEqual([parent.id, child.id])
})
test('5: service role cannot mutate or truncate; trigger also protects privileged UPDATE/DELETE', async () => {
  await append()
  await role('service_role', async () => {
    for (const sql of ['UPDATE financial_events SET payload=payload', 'DELETE FROM financial_events', 'TRUNCATE financial_events']) {
      await rejects(() => db.exec(sql), /permission denied/)
    }
  })
  for (const sql of ['UPDATE financial_events SET payload=payload', 'DELETE FROM financial_events']) {
    await rejects(() => db.exec(sql), /financial_events_immutable/)
  }
  // A mistakenly re-granted UPDATE/DELETE still cannot mutate existing history.
  await db.exec('GRANT UPDATE, DELETE ON financial_events TO service_role')
  await role('service_role', async () => {
    await rejects(() => db.exec('DELETE FROM financial_events'), /financial_events_immutable/)
    await rejects(() => db.exec('UPDATE financial_events SET payload=payload'), /financial_events_immutable/)
  })
  expect(await count()).toBe(1)
})
test('6: clients cannot append or insert; broad service defaults cannot bypass the RPC', async () => {
  for (const name of ['anon', 'authenticated'] as const) await role(name, async () => {
    await rejects(() => append(), /permission denied/)
    await rejects(() => db.exec('INSERT INTO financial_events DEFAULT VALUES'), /permission denied/)
  })
  await role('service_role', async () => {
    await rejects(() => db.exec('INSERT INTO financial_events DEFAULT VALUES'), /permission denied/)
    await rejects(() => db.exec("SELECT nextval('financial_events_seq_seq')"), /permission denied/)
    expect((await append()).inserted).toBe(true)
  })
})
test('7: real membership predicate isolates active members, owners and nonmembers', async () => {
  await append(); await append({ business_id: 'b' })
  for (const [user, expected] of [[userA, ['a']], [userB, ['b']], ['00000000-0000-0000-0000-000000000003', []]] as const) {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user])
    await role('authenticated', async () => {
      const rows = await db.query<{ business_id: string }>('SELECT business_id FROM financial_events')
      expect(rows.rows.map(r => r.business_id)).toEqual(expected)
    })
  }
  await db.exec('UPDATE business_users SET is_active=false')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [userA])
  await role('authenticated', async () => { expect(await count()).toBe(0) })
  await role('anon', async () => { await rejects(() => count(), /permission denied/) })
})
test('8: required envelope constraints are enforced in the database', async () => {
  for (const change of [{ currency: null }, { amount_minor: null }, { actor_type: 'agent', actor_id: null },
    { actor_type: 'user', actor_id: null }, { correlation_id: 'finXbad' }, { source_id: '' }, { schema_version: 0 },
    { business_id: '' }, { currency: 'sek' }, { payload: [] }]) {
    await rejects(() => append(change as Partial<Input>), /check constraint|financial_event_business_required/)
  }
})
test('9: 200 per-business appends have increasing cursors; advisory lock precedes reads and INSERT', async () => {
  let previous = BigInt(0)
  for (let i = 0; i < 200; i++) {
    const event = await append({ idempotency_key: `order:${i}` })
    expect(BigInt(event.seq) > previous).toBe(true); previous = BigInt(event.seq)
  }
  const sql = migration(), lock = sql.indexOf('PERFORM pg_advisory_xact_lock')
  expect(lock).toBeGreaterThan(-1)
  expect(lock).toBeLessThan(sql.indexOf('SELECT * INTO existing'))
  expect(lock).toBeLessThan(sql.indexOf('INSERT INTO public.financial_events'))
})
test('10: signed BIGINT above JS safe integer preserves all digits through the envelope', async () => {
  for (const amount of ['9007199254740993', '-9007199254740993', '9223372036854775807', '-9223372036854775808']) {
    const event = await append({ amount_minor: amount, idempotency_key: amount })
    expect(event.amount_minor).toBe(amount)
    const row = { ...input(), id: event.id, seq: event.seq, amount_minor: event.amount_minor, created_at: '2026-09-13T13:00:00Z' }
    const envelope = envelopeFromRow(row)
    expect(envelope.amount?.amountMinor.toString()).toBe(amount)
    expect(rowFromEnvelope(envelope).amount_minor).toBe(amount)
  }
  const source = readFileSync('lib/financial-kernel/events/types.ts', 'utf8')
  expect(source).not.toMatch(/Number\([^)]*amount_minor/)
})

const payloads = {
  invoice_issued: { invoice_id: 'i', invoice_number: '1', customer_id: 'c', project_id: 'p', currency: 'SEK', total_minor: 100, vat_regime: 'standard', accounting_method: 'cash', issued_date: '2026-09-13', due_date: '2026-10-13', tax_reduction: 'rot' },
  invoice_credited: { invoice_id: 'i', credit_invoice_id: 'credit', currency: 'SEK', amount_minor: -100, issued_date: '2026-09-13' },
  receivable_created: { receivable_id: 'r', invoice_id: 'i', component: 'customer', owner: 'business', currency: 'SEK', amount_minor: 100, due_date: '2026-10-13' },
  receivable_adjusted: { receivable_id: 'r', reason: 'ownership_transfer', owner_after: 'factor' },
  receivable_settled: { receivable_id: 'r', invoice_id: 'i', component: 'tax_authority', settled_at: '2026-09-13T12:00:00Z' },
  payment_initiated: { payment_id: 'p', provider: 'manual', direction: 'inbound', currency: 'SEK', amount_minor: 100 },
  payment_settled: { payment_id: 'p', currency: 'SEK', amount_minor: 100, fee_minor: 0, settled_at: '2026-09-13T12:00:00Z', evidence: 'manual' },
  payment_allocated: { allocation_id: 'al', payment_id: 'p', receivable_id: 'r', currency: 'SEK', amount_minor: 100 },
  payment_allocation_reversed: { allocation_id: 'al', reason: 'wrong allocation' },
} satisfies Pick<FinancialEventPayloads, 'invoice_issued' | 'invoice_credited' | 'receivable_created' | 'receivable_adjusted' | 'receivable_settled' | 'payment_initiated' | 'payment_settled' | 'payment_allocated' | 'payment_allocation_reversed'>
test('11: every typed payload round-trips every envelope field and optional null', () => {
  for (const [eventType, payload] of Object.entries(payloads)) {
    for (const hasOptionals of [true, false]) {
      const row: FinancialEventRow = { ...input(), id: 'id', seq: '9007199254740993', created_at: '2026-09-13T13:00:00Z',
        event_type: eventType as keyof typeof payloads, payload,
        ...(hasOptionals ? { causation_id: 'parent', actor_type: 'agent', actor_id: 'agent-1' } as const : { effective_date: null, amount_minor: null, currency: null }) }
      const envelope = envelopeFromRow(row)
      const { id, seq, created_at, ...writable } = row
      expect(rowFromEnvelope(envelope)).toEqual(writable)
      expect(envelopeFromRow({ ...rowFromEnvelope(envelope), id, seq, created_at })).toEqual(envelope)
    }
  }
})
test('retention FK rejects deleting a business with events; transactions roll back atomically', async () => {
  await append()
  await rejects(() => db.exec("DELETE FROM business_config WHERE business_id='a'"), /foreign key constraint/)
  await db.exec('SAVEPOINT domain_write')
  await append({ idempotency_key: 'rolled-back' })
  await db.exec('ROLLBACK TO SAVEPOINT domain_write')
  expect(await count()).toBe(1)
})

test('row adapter refuses numeric BIGINT transport or unpaired monetary columns', () => {
  const row: FinancialEventRow = { ...input(), id: 'id', seq: '1', created_at: '2026-09-13T12:00:00Z' }
  expect(() => envelopeFromRow({ ...row, amount_minor: 9007199254740992 } as unknown as FinancialEventRow)).toThrow(/BIGINT string/)
  expect(() => envelopeFromRow({ ...row, seq: 1 } as unknown as FinancialEventRow)).toThrow(/BIGINT string/)
  expect(() => envelopeFromRow({ ...row, amount_minor: null })).toThrow(/paired/)
  expect(() => envelopeFromRow({ ...row, currency: null })).toThrow(/paired/)
})
