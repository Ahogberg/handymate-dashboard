import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { receivablesDatabase, domain } from './helpers/financial-receivables-database'

// Exact executable mapping of FINANCIAL_KERNEL_C8_BRIEF.md §6 (5+4+18+4+6+7+4 = 48).
test.describe.configure({ mode: 'serial' })
let db: Awaited<ReturnType<typeof receivablesDatabase>>['db']

type Period = { id: string; starts_on: string; ends_on: string; status: string }
type FiscalYear = { id: string; starts_on: string; ends_on: string; status: string; periods: Period[] }
type Journal = { id: string; series: string; name: string }
type Account = { id: string; number: string; name: string; type: string; active: boolean; source: string; confirmed_by: string | null }
type Line = { account: string; debit_minor?: string; credit_minor?: string; metadata?: Record<string, unknown> }
type Entry = { id: string; journal_id: string; series: string; fiscal_year_id: string; period_id: string; voucher_number: number;
  journal_type: string; effective_date: string; currency: string; total_minor: string; description: string;
  source_event_id: string | null; correlation_id: string; posting_rule_id: string; posting_rule_version: number;
  reversal_of_entry_id: string | null; reversed_by_entry_id: string | null; status: string; posted_event_id: string;
  actor_type: string; actor_id: string | null; lines: Array<Line & { line_no: number; account_id: string; vat_code: string | null;
    project_id: string | null; customer_id: string | null; supplier_id: string | null; metadata: Record<string, unknown> }>;
  inserted: boolean; reversed_event_id?: string }

const call = <T = Record<string, unknown>>(name: string, args: unknown[]) => domain<T>(db, name, args)
const year = (start = '2026-01-01', end = '2026-12-31', business = 'a') => call<FiscalYear>('open_ledger_fiscal_year', [business, start, end])
const journal = (series = 'A', name = 'Testserie', business = 'a') => call<Journal>('ensure_ledger_journal', [business, series, name])
const account = (number: string, type = 'asset', confirmed: string | null = null, active = true, business = 'a', name = `Konto ${number}`) =>
  call<Account>('upsert_ledger_account', [business, number, name, type, 'proposal', confirmed, active])
const basicLines = (amount = '100'): Line[] => [{ account: '1000', debit_minor: amount }, { account: '3000', credit_minor: amount }]
type Post = { business: string; series: string; kind: string; date: string; description: string; lines: unknown; source: string | null;
  rule: string; version: number; key: string; actor: string; actorId: string | null; currency: string }
function post(changes: Partial<Post> = {}) {
  const p: Post = { business: 'a', series: 'A', kind: 'sale', date: '2026-03-15', description: 'Testverifikation',
    lines: basicLines(), source: sourceEventId, rule: 'test_rule', version: 1, key: 'post-1', actor: 'system', actorId: null,
    currency: 'SEK', ...changes }
  return call<Entry>('post_journal_entry', [p.business, p.series, p.kind, p.date, p.description, JSON.stringify(p.lines), p.source,
    p.rule, p.version, p.key, p.actor, p.actorId, p.currency])
}
const manual = (changes: Partial<Post> = {}) => post({ source: null, rule: 'manual', version: 0, actor: 'user', actorId: 'reviewer', ...changes })
const reverse = (entry: string, changes: { business?: string; date?: string; reason?: string | null; key?: string; actor?: string; actorId?: string | null } = {}) =>
  call<Entry>('reverse_journal_entry', [changes.business ?? 'a', entry, changes.date ?? '2026-03-16', changes.reason ?? 'Felbokning',
    changes.key ?? 'reverse-1', changes.actor ?? 'user', changes.actorId ?? 'reviewer'])
const lock = (period: string, business = 'a', actor: string | null = 'reviewer') => call<{ id: string; status: string; changed: boolean; event_id?: string }>('lock_ledger_period', [business, period, actor])
const unlock = (period: string, actor: string | null = 'reviewer', reason: string | null = 'Rättelse') => call<{ id: string; status: string; changed: boolean; event_id?: string }>('unlock_ledger_period', ['a', period, actor, reason])

async function rows<T extends Record<string, unknown>>(sql: string, args: unknown[] = []) { return (await db.query<T>(sql, args)).rows }
async function count(table: string) { return (await rows<{ n: number }>(`SELECT count(*)::int n FROM ${table}`))[0].n }
async function reject(run: () => Promise<unknown>, message: string | RegExp) {
  await db.exec('SAVEPOINT expected_failure')
  try { await expect(run()).rejects.toThrow(message) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure') }
}
async function asOwner(run: () => Promise<void>) {
  await db.exec('RESET ROLE')
  try { await run() } finally { await db.exec('SET LOCAL ROLE service_role') }
}
async function asRole(role: 'anon' | 'authenticated' | 'service_role', run: () => Promise<void>) {
  await db.exec('SAVEPOINT role_scope'); await db.exec(`SET LOCAL ROLE ${role}`)
  try { await run() }
  catch (error) { await db.exec('ROLLBACK TO SAVEPOINT role_scope'); throw error }
  finally { await db.exec('RESET ROLE; SET LOCAL ROLE service_role; RELEASE SAVEPOINT role_scope') }
}
async function event(business = 'a', key = `source-${Math.random()}`, correlation = 'fin_source_test') {
  const result = await rows<{ id: string }>(`SELECT id FROM append_financial_event($1,'payment_settled',1,'2026-03-15T10:00:00Z','2026-03-15',
    'payment',$2,$3,NULL,$2,'SEK',100,'{}','system',NULL)`, [business, key, correlation])
  return result[0].id
}
async function snapshot() {
  return { entries: await count('ledger_entries'), lines: await count('ledger_entry_lines'), events: await count('financial_events'),
    counters: await rows('SELECT journal_id,fiscal_year_id,next_number FROM ledger_voucher_counters ORDER BY journal_id,fiscal_year_id') }
}

let fiscal: FiscalYear
let sourceEventId: string
test.beforeAll(async () => {
  test.setTimeout(60_000)
  db = (await receivablesDatabase()).db
  await db.exec('SET ROLE deployer')
  try { await db.exec(readFileSync('sql/v251_ledger_posting_engine.sql', 'utf8')) } finally { await db.exec('RESET ROLE') }
})
test.afterAll(async () => { await db?.close() })
test.beforeEach(async () => {
  await db.exec('BEGIN; SET LOCAL ROLE service_role')
  fiscal = await year(); await journal('A'); await journal('B')
  await account('1000', 'asset'); await account('3000', 'revenue'); await account('3740', 'expense')
  sourceEventId = await event()
})
test.afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })

test('C8-01 fiscal year creates twelve open calendar-month periods', async () => {
  expect(fiscal.periods).toHaveLength(12); expect(fiscal.periods.every(p => p.status === 'open')).toBe(true)
  expect(fiscal.periods[0]).toMatchObject({ starts_on: '2026-01-01', ends_on: '2026-01-31' })
  expect(fiscal.periods[11]).toMatchObject({ starts_on: '2026-12-01', ends_on: '2026-12-31' })
})
test('C8-02 opening the same fiscal year is idempotent', async () => {
  expect(await year()).toEqual(fiscal); expect(await count('ledger_fiscal_years')).toBe(1); expect(await count('ledger_periods')).toBe(12)
})
test('C8-03 overlapping fiscal year is refused', async () => {
  await reject(() => year('2026-07-01', '2027-06-30'), 'ledger_fiscal_year_overlap')
})
test('C8-04 fiscal year must start on the first day of a month', async () => {
  await reject(() => year('2027-01-02', '2027-12-31'), /ledger_fiscal_years.*check|check constraint/)
})
test('C8-05 broken first year permits eighteen months but refuses nineteen', async () => {
  const long = await year('2025-01-01', '2026-06-30', 'b'); expect(long.periods).toHaveLength(18)
  await reject(() => year('2023-01-01', '2024-07-31', 'b'), /ledger_fiscal_years.*check|check constraint/)
})

test('C8-06 journal is idempotent by series and keeps its first name', async () => {
  const first = await journal('C', 'Första'); expect(await journal('C', 'Andra')).toEqual(first)
})
test('C8-07 journal refuses lowercase and seven-character series', async () => {
  await reject(() => journal('a'), /ledger_journals.*check|check constraint/); await reject(() => journal('ABCDEFG'), /ledger_journals.*check|check constraint/)
})
test('C8-08 account stays unconfirmed until a named person confirms it', async () => {
  expect((await account('1000')).confirmed_by).toBeNull()
  expect((await account('1000', 'asset', 'Anna')).confirmed_by).toBe('Anna')
  expect((await account('1000', 'asset', null)).confirmed_by).toBe('Anna')
})
test('C8-09 blank confirmation becomes null and account types are closed', async () => {
  expect((await account('4000', 'expense', '   ')).confirmed_by).toBeNull()
  await reject(() => account('4001', 'cash'), /ledger_accounts.*check|check constraint/)
})

test('C8-10 balanced entry posts as A1 with strings, ordered lines and March period', async () => {
  const entry = await post()
  expect(entry).toMatchObject({ series: 'A', voucher_number: 1, total_minor: '100', period_id: fiscal.periods[2].id, inserted: true })
  expect(entry.lines.map(l => [l.line_no, l.account, l.debit_minor, l.credit_minor])).toEqual([[1, '1000', '100', '0'], [2, '3000', '0', '100']])
})
test('C8-11 posted event is atomic and inherits source causation and correlation', async () => {
  const entry = await post()
  expect(await rows(`SELECT event_type,causation_id,correlation_id,amount_minor::text,payload->>'journal_entry_id' entry,
    payload->>'voucher_series' series,payload->>'voucher_number' number FROM financial_events WHERE id=$1`, [entry.posted_event_id]))
    .toEqual([{ event_type: 'journal_entry_posted', causation_id: sourceEventId, correlation_id: 'fin_source_test', amount_minor: '100', entry: entry.id, series: 'A', number: '1' }])
})
test('C8-12 voucher numbers run independently per series', async () => {
  expect((await post()).voucher_number).toBe(1); expect((await post({ key: 'a2' })).voucher_number).toBe(2)
  expect((await post({ series: 'B', key: 'b1' })).voucher_number).toBe(1)
})
test('C8-13 voucher numbers restart per fiscal year', async () => {
  await post(); const next = await year('2027-01-01', '2027-12-31')
  const source = await event('a', 'source-2027', 'fin_source_2027')
  expect((await post({ date: '2027-01-15', source, key: '2027-a1' })).voucher_number).toBe(1)
  expect(next.periods).toHaveLength(12)
})
test('C8-14 unbalanced posting leaves no entry, event or counter', async () => {
  const before = await snapshot(); await reject(() => post({ lines: [{ account: '1000', debit_minor: '100' }, { account: '3000', credit_minor: '99' }] }), 'ledger_entry_unbalanced')
  expect(await snapshot()).toEqual(before)
})
test('C8-15 failed posting consumes no voucher number', async () => {
  await reject(() => post({ lines: basicLines('0') }), 'ledger_line_one_side')
  expect((await post()).voucher_number).toBe(1)
})
test('C8-16 both sides, neither side and a lone line are refused', async () => {
  await reject(() => post({ lines: [{ account: '1000', debit_minor: '100', credit_minor: '100' }, basicLines()[1]] }), 'ledger_line_one_side')
  await reject(() => post({ lines: [{ account: '1000' }, basicLines()[1]] }), 'ledger_line_one_side')
  await reject(() => post({ lines: [basicLines()[0]] }), 'ledger_lines_required')
})
test('C8-17 decimal and negative minor amounts are refused', async () => {
  for (const amount of ['1.5', '-1']) await reject(() => post({ lines: basicLines(amount) }), 'ledger_line_amount_invalid')
})
test('C8-18 unknown and inactive accounts are refused', async () => {
  await reject(() => post({ lines: [{ account: 'missing', debit_minor: '100' }, basicLines()[1]] }), 'ledger_account_not_found')
  await account('1000', 'asset', null, false)
  await reject(() => post(), 'ledger_account_inactive')
})
test('C8-19 identical idempotency key replays one entry and one posted event', async () => {
  const first = await post(), before = await snapshot(); expect(await post()).toMatchObject({ id: first.id, inserted: false })
  expect(await snapshot()).toEqual(before)
})
test('C8-20 changed lines or date under one key conflicts', async () => {
  await post(); await reject(() => post({ lines: basicLines('101') }), 'ledger_idempotency_conflict')
  await reject(() => post({ date: '2026-03-16' }), 'ledger_idempotency_conflict')
})
test('C8-21 a date outside every fiscal year has no period', async () => {
  await reject(() => post({ date: '2027-01-01' }), 'ledger_period_not_found')
})
test('C8-22 rule posting requires a same-business source event', async () => {
  await reject(() => post({ source: null }), 'ledger_source_event_required')
  await reject(() => post({ source: 'missing' }), 'ledger_source_event_not_found')
  const foreign = await event('b', 'foreign-source', 'fin_foreign'); await reject(() => post({ source: foreign }), 'ledger_source_event_not_found')
})
test('C8-23 manual voucher requires a named user and version zero and gets a ledger correlation', async () => {
  for (const change of [{ actor: 'system' }, { actorId: null }, { version: 1 }]) await reject(() => manual(change), 'ledger_manual_requires_user')
  expect((await manual()).correlation_id).toMatch(/^fin_ledger_/)
})
test('C8-24 manual voucher may not carry a source event', async () => {
  await reject(() => manual({ source: sourceEventId }), 'ledger_manual_requires_user')
})
test('C8-25 public posting RPC cannot pose as a reversal', async () => {
  await reject(() => post({ kind: 'reversal' }), 'ledger_use_reverse_journal_entry')
  await reject(() => post({ rule: 'reversal' }), 'ledger_use_reverse_journal_entry')
})
test('C8-26 values above JavaScript safe integer round-trip exactly', async () => {
  const amount = '9007199254740993', entry = await post({ lines: basicLines(amount) })
  expect(entry.total_minor).toBe(amount); expect(entry.lines[0].debit_minor).toBe(amount)
})
test('C8-27 golden path 36 rounding line posts and balances exactly', async () => {
  const entry = await post({ key: 'gp36', lines: [{ account: '1000', debit_minor: '123400' }, { account: '3740', debit_minor: '56' }, { account: '3000', credit_minor: '123456' }] })
  expect(entry.total_minor).toBe('123456')
  expect(entry.lines.map(l => [l.account, l.debit_minor, l.credit_minor])).toEqual([['1000', '123400', '0'], ['3740', '56', '0'], ['3000', '0', '123456']])
})

test('C8-28 owner cannot edit or delete a posted entry', async () => {
  const entry = await post(); await asOwner(async () => {
    await reject(() => db.query("UPDATE ledger_entries SET description='changed' WHERE id=$1", [entry.id]), 'ledger_entries_immutable')
    await reject(() => db.query('DELETE FROM ledger_entries WHERE id=$1', [entry.id]), 'ledger_entries_immutable')
  })
})
test('C8-29 owner cannot edit or delete a posted line', async () => {
  const entry = await post(); await asOwner(async () => {
    await reject(() => db.query('UPDATE ledger_entry_lines SET debit_minor=101 WHERE entry_id=$1', [entry.id]), 'ledger_lines_immutable')
    await reject(() => db.query('DELETE FROM ledger_entry_lines WHERE entry_id=$1', [entry.id]), 'ledger_lines_immutable')
  })
})
test('C8-30 deferred table invariant rejects a line inserted behind the RPC', async () => {
  const entry = await post(); await asOwner(async () => {
    await db.exec('SAVEPOINT direct_line')
    try {
      await db.query(`INSERT INTO ledger_entry_lines(business_id,entry_id,line_no,account_id,debit_minor,credit_minor)
        SELECT 'a',$1,3,id,1,0 FROM ledger_accounts WHERE business_id='a' AND number='1000'`, [entry.id])
      await expect(db.exec('SET CONSTRAINTS ledger_entry_lines_balanced IMMEDIATE')).rejects.toThrow('ledger_entry_unbalanced')
    } finally { await db.exec('ROLLBACK TO SAVEPOINT direct_line; RELEASE SAVEPOINT direct_line') }
  })
})
test('C8-31 account type freezes after the account has posted lines', async () => {
  await post(); await reject(() => account('1000', 'liability'), 'ledger_account_type_frozen')
})

test('C8-32 reversal is a new swapped entry and marks only reversal fields on original', async () => {
  const original = await post(), before = (await rows<Record<string, unknown>>('SELECT * FROM ledger_entries WHERE id=$1', [original.id]))[0]
  const reversal = await reverse(original.id)
  expect(reversal).toMatchObject({ voucher_number: 2, reversal_of_entry_id: original.id, journal_type: 'reversal', status: 'posted' })
  expect(reversal.lines.map(l => [l.account, l.debit_minor, l.credit_minor])).toEqual([['1000', '0', '100'], ['3000', '100', '0']])
  const after = (await rows<Record<string, unknown>>('SELECT * FROM ledger_entries WHERE id=$1', [original.id]))[0]
  expect({ ...after, status: before.status, reversed_by_entry_id: before.reversed_by_entry_id }).toEqual(before)
  expect(after).toMatchObject({ status: 'reversed', reversed_by_entry_id: reversal.id })
})
test('C8-33 reversal provenance chains through both canonical events', async () => {
  const original = await post(), reversal = await reverse(original.id)
  expect(reversal.source_event_id).toBe(original.posted_event_id)
  expect(await rows(`SELECT event_type,causation_id,payload->>'journal_entry_id' original,payload->>'reversal_entry_id' reversal,payload->>'reason' reason
    FROM financial_events WHERE id=$1`, [reversal.reversed_event_id!])).toEqual([{ event_type: 'journal_entry_reversed', causation_id: reversal.posted_event_id, original: original.id, reversal: reversal.id, reason: 'Felbokning' }])
})
test('C8-34 an entry is reversed at most once and a reversal cannot be reversed', async () => {
  const original = await post(), reversal = await reverse(original.id)
  await reject(() => reverse(original.id, { key: 'reverse-2' }), 'ledger_entry_has_reversal')
  await reject(() => reverse(reversal.id, { key: 'reverse-reversal' }), 'ledger_reversal_of_reversal')
})
test('C8-35 reversal idempotency key replays the same reversal', async () => {
  const original = await post(), first = await reverse(original.id), before = await snapshot()
  expect(await reverse(original.id)).toMatchObject({ id: first.id, inserted: false }); expect(await snapshot()).toEqual(before)
})
test('C8-36 reversal requires a reason and cannot predate the original', async () => {
  const original = await post(); await reject(() => reverse(original.id, { reason: ' ' }), 'ledger_reversal_reason_required')
  await reject(() => reverse(original.id, { date: '2026-03-14' }), 'ledger_reversal_before_original')
})
test('C8-37 another tenant can neither reverse nor read an entry', async () => {
  const original = await post(); await reject(() => reverse(original.id, { business: 'b' }), 'ledger_entry_not_found')
  expect(await call('read_ledger_entry', ['b', original.id])).toBeNull()
})

test('C8-38 lock is audited and blocks that period but not the next', async () => {
  const jan = fiscal.periods[0], result = await lock(jan.id)
  expect(await rows(`SELECT event_type,actor_id,payload->>'locked_by' locked_by FROM financial_events WHERE id=$1`, [result.event_id!]))
    .toEqual([{ event_type: 'period_locked', actor_id: 'reviewer', locked_by: 'reviewer' }])
  await reject(() => post({ date: '2026-01-15', key: 'jan' }), 'ledger_period_not_open')
  expect((await post({ date: '2026-02-15', key: 'feb' })).period_id).toBe(fiscal.periods[1].id)
})
test('C8-39 periods lock in date order', async () => {
  await reject(() => lock(fiscal.periods[1].id), 'ledger_period_lock_order'); await lock(fiscal.periods[0].id); expect((await lock(fiscal.periods[1].id)).changed).toBe(true)
})
test('C8-40 locking an already locked period changes nothing and appends nothing', async () => {
  await lock(fiscal.periods[0].id); const before = await count('financial_events'); expect(await lock(fiscal.periods[0].id)).toMatchObject({ changed: false }); expect(await count('financial_events')).toBe(before)
})
test('C8-41 unlock requires actor and reason and proceeds in reverse order', async () => {
  await lock(fiscal.periods[0].id); await lock(fiscal.periods[1].id)
  await reject(() => unlock(fiscal.periods[1].id, null), 'ledger_unlock_requires_actor_and_reason')
  await reject(() => unlock(fiscal.periods[1].id, 'reviewer', ' '), 'ledger_unlock_requires_actor_and_reason')
  await reject(() => unlock(fiscal.periods[0].id), 'ledger_period_unlock_order')
  expect((await unlock(fiscal.periods[1].id)).changed).toBe(true)
})
test('C8-42 unlock is audited from the lock event and permits posting again', async () => {
  const locked = await lock(fiscal.periods[0].id), opened = await unlock(fiscal.periods[0].id, 'reviewer', 'Godkänd rättelse')
  expect(await rows(`SELECT event_type,causation_id,actor_id,payload->>'reason' reason FROM financial_events WHERE id=$1`, [opened.event_id!]))
    .toEqual([{ event_type: 'period_unlocked', causation_id: locked.event_id, actor_id: 'reviewer', reason: 'Godkänd rättelse' }])
  expect((await post({ date: '2026-01-15', key: 'after-unlock' })).voucher_number).toBe(1)
})
test('C8-43 reversal into a locked period is refused', async () => {
  const original = await post({ date: '2026-01-15' }); await lock(fiscal.periods[0].id)
  await reject(() => reverse(original.id, { date: '2026-01-20' }), 'ledger_period_not_open')
})
test('C8-44 another tenant can neither lock nor unlock a period', async () => {
  await reject(() => lock(fiscal.periods[0].id, 'b'), 'ledger_period_not_found')
  await lock(fiscal.periods[0].id); await reject(() => call('unlock_ledger_period', ['b', fiscal.periods[0].id, 'reviewer', 'reason']), 'ledger_period_not_found')
})

test('C8-45 anon can neither read nor post', async () => {
  await asRole('anon', async () => {
    await reject(() => db.exec('SELECT * FROM ledger_entries'), /permission denied/)
    await reject(() => post(), /permission denied/)
  })
})
test('C8-46 authenticated reads only its business and cannot post or lock', async () => {
  const own = await post(); await year('2026-01-01', '2026-12-31', 'b'); await journal('A', 'Testserie', 'b')
  await db.exec("SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)")
  expect(await rows('SELECT id FROM ledger_entries')).toEqual([{ id: own.id }])
  await reject(() => post({ key: 'member-post' }), /permission denied/)
  await reject(() => lock(fiscal.periods[0].id), /permission denied/)
})
test('C8-47 service role reads but cannot insert entries or mutate counters or periods', async () => {
  await post(); expect(await count('ledger_entries')).toBe(1)
  await reject(() => db.exec(`INSERT INTO ledger_entries(id,business_id,journal_id,fiscal_year_id,period_id,voucher_number,journal_type,effective_date,currency,total_minor,description,correlation_id,posting_rule_id,posting_rule_version,idempotency_key,request_hash,posted_event_id,actor_type)
    VALUES('x','a','x','x','x',99,'sale','2026-01-01','SEK',1,'x','fin_x','x',1,'x','x','x','system')`), /permission denied/)
  await reject(() => db.exec('UPDATE ledger_voucher_counters SET next_number=99'), /permission denied/)
  await reject(() => db.exec("UPDATE ledger_periods SET status='locked'"), /permission denied/)
})
test('C8-48 service role cannot call ledger_post but can call post_journal_entry', async () => {
  expect(await rows("SELECT has_function_privilege('service_role','ledger_post(text,text,text,date,text,jsonb,text,text,integer,text,text,text,text,text)','EXECUTE') allowed")).toEqual([{ allowed: false }])
  expect(await rows("SELECT has_function_privilege('service_role','post_journal_entry(text,text,text,date,text,jsonb,text,text,integer,text,text,text,text)','EXECUTE') allowed")).toEqual([{ allowed: true }])
  expect((await post()).inserted).toBe(true)
})
