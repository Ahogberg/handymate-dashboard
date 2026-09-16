import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { receivablesDatabase, domain } from './helpers/financial-receivables-database'

// C8-01..48 map to FINANCIAL_KERNEL_C8_BRIEF.md §6. Every probe executes SQL.
// One database, independent rolled-back test transactions; failures do not skip later probes.
test.describe.configure({ mode: 'default' })
let db: Awaited<ReturnType<typeof receivablesDatabase>>['db']
type Account = { id: string; confirmed_by: string; created: boolean }
type Year = { id: string; created: boolean; periods: { id: string; start_date: string; end_date: string; period_no: number; locked: boolean }[] }
type Series = { id: string; first_number: string; next_number: string; created: boolean }
type Line = { account_id: string; debit_minor?: string; credit_minor?: string; memo?: string | null }
type Voucher = { id: string; voucher_number: string; event_id: string; replayed: boolean; reverses_voucher_id: string | null; reversal_root_id: string | null; lines: Line[]; actor_id: string }
let debit: Account, credit: Account, year: Year, series: Series
let initialCounts: number[]
const tables = ['financial_ledger_accounts', 'financial_fiscal_years', 'financial_fiscal_periods', 'financial_voucher_series', 'financial_vouchers', 'financial_voucher_lines', 'financial_period_lock_audit', 'financial_ledger_rules']
const rpc = <T = Record<string, unknown>>(name: string, args: unknown[]) => domain<T>(db, name, args)
const account = (code = 'TEST-D', confirmed: string | null = 'reviewer', business = 'a', name = 'Explicit test account') => rpc<Account>('create_financial_ledger_account', [business, code, name, confirmed])
const fiscal = (start = '2026-01-01', business = 'a', label = 'Test year') => rpc<Year>('create_financial_fiscal_year', [business, label, start])
const makeSeries = (yr = year.id, business = 'a', first: string | null = '1', code = 'TEST', name = 'Explicit test series') => rpc<Series>('create_financial_voucher_series', [business, yr, code, name, first])
const lines = (amount = '100'): Line[] => [{ account_id: debit.id, debit_minor: amount }, { account_id: credit.id, credit_minor: amount }]
type Post = { business: string; series: string; date: string; currency: string; description: string; source: string; sourceId: string; key: string; lines: unknown; actor: string; actorId: string | null }
function post(changes: Partial<Post> = {}) {
  const p: Post = { business: 'a', series: series.id, date: '2026-01-15', currency: 'SEK', description: 'Test voucher', source: 'manual', sourceId: 'source-1', key: 'post-1', lines: lines(), actor: 'user', actorId: 'reviewer', ...changes }
  return rpc<Voucher>('post_financial_voucher', [p.business, p.series, p.date, p.currency, p.description, p.source, p.sourceId, p.key, JSON.stringify(p.lines), p.actor, p.actorId])
}
const reverse = (id: string, key = 'reverse-1', business = 'a', date = '2026-01-16') => rpc<Voucher>('reverse_financial_voucher', [business, id, series.id, date, 'Explicit reversal', key, 'user', 'reviewer'])
const lock = (period = year.periods[0].id, reason: string | null = 'Reviewed', business = 'a') => rpc('lock_financial_period', [business, period, reason, 'user', 'reviewer'])
const unlock = (period = year.periods[0].id, reason: string | null = 'Correction approved') => rpc('unlock_financial_period', ['a', period, reason, 'user', 'reviewer'])
async function rows<T extends Record<string, unknown>>(sql: string, args: unknown[] = []) { return (await db.query<T>(sql, args)).rows }
async function count(table: string) { return (await rows<{ n: number }>(`SELECT count(*)::int n FROM ${table}`))[0].n }
async function reject(run: () => Promise<unknown>, message: string | RegExp) {
  await db.exec('SAVEPOINT expected_failure')
  try { await expect(run()).rejects.toThrow(message) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure') }
}
async function owner(run: () => Promise<void>) {
  await db.exec('RESET ROLE')
  try { await run() } finally { await db.exec('SET LOCAL ROLE service_role') }
}
async function snapshot() {
  return { vouchers: await count('financial_vouchers'), lines: await count('financial_voucher_lines'), events: await count('financial_events'), audit: await count('financial_period_lock_audit'), numbers: await rows('SELECT id,next_number::text FROM financial_voucher_series ORDER BY id') }
}
async function sourceEvent(amount: string | null = '100', currency: string | null = 'SEK', date: string | null = '2026-01-15', business = 'a') {
  const result = await rows<{ id: string }>(`SELECT id FROM append_financial_event($1,'payment_settled',1,'2026-01-15T12:00:00Z',$2,'payment','p','fin_payment_p',NULL,'payment:p',$3,$4,'{}','system',NULL)`, [business, date, currency, amount])
  return result[0].id
}
async function rule(code = 'TEST') {
  await owner(async () => { await db.query(`INSERT INTO financial_ledger_rules(business_id,event_type,series_code,debit_account_id,credit_account_id) VALUES ('a','payment_settled',$1,$2,$3)`, [code, debit.id, credit.id]) })
}
const consume = (id: string, business = 'a') => rpc<{ state: string; voucher: Voucher }>('consume_financial_event_for_ledger', [business, id])

test.beforeAll(async () => {
  test.setTimeout(60_000)
  db = (await receivablesDatabase()).db
  await db.exec('SET ROLE deployer')
  await db.exec(readFileSync('sql/v251_ledger_posting_engine.sql', 'utf8'))
  await db.exec('RESET ROLE')
  initialCounts = await Promise.all(tables.map(count))
})
test.afterAll(async () => { await db?.close() })
test.beforeEach(async () => {
  await db.exec('BEGIN; SET LOCAL ROLE service_role')
  debit = await account(); credit = await account('TEST-C')
  year = await fiscal(); series = await makeSeries()
})
test.afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })

test('C8-01: migration seeds no accounts, years, series, vouchers or rules', async () => {
  expect(initialCounts).toEqual(tables.map(() => 0))
  expect(await rows("SELECT * FROM financial_ledger_rules")).toEqual([])
})
test('C8-02: explicit confirmation is persisted with a timestamp', async () => {
  expect(await rows('SELECT confirmed_by,confirmed_at IS NOT NULL AS stamped FROM financial_ledger_accounts WHERE id=$1', [debit.id])).toEqual([{ confirmed_by: 'reviewer', stamped: true }])
})
test('C8-03: missing or blank account confirmation is rejected', async () => {
  for (const value of [null, '', '   ']) await reject(() => account('NEW', value), 'financial_account_fields_required')
  expect(await count('financial_ledger_accounts')).toBe(2)
})
test('C8-04: identical account creation replays the same record', async () => {
  expect(await account()).toEqual({ ...debit, created: false })
  expect(await count('financial_ledger_accounts')).toBe(2)
})
test('C8-05: account code cannot overwrite name or confirmation', async () => {
  await reject(() => account('TEST-D', 'other'), 'financial_account_code_conflict')
  await reject(() => account('TEST-D', 'reviewer', 'a', 'Renamed'), 'financial_account_code_conflict')
})
test('C8-06: account codes are tenant-scoped and malformed codes fail', async () => {
  expect((await account('TEST-D', 'reviewer', 'b')).id).not.toBe(debit.id)
  await reject(() => account('bad code'), /check constraint/)
})
test('C8-07: a fiscal year creates exactly twelve contiguous monthly periods', async () => {
  expect(year.periods).toHaveLength(12)
  expect(year.periods.map(p => p.period_no)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
  expect(year.periods[0]).toMatchObject({ start_date: '2026-01-01', end_date: '2026-01-31', locked: false })
  expect(year.periods[11]).toMatchObject({ start_date: '2026-12-01', end_date: '2026-12-31' })
  expect(await rows(`SELECT count(*)::int n FROM (SELECT start_date, lag(end_date) OVER (ORDER BY start_date) previous FROM financial_fiscal_periods) p WHERE previous IS NOT NULL AND start_date <> previous + 1`)).toEqual([{ n: 0 }])
})
test('C8-08: shifted fiscal years include leap February correctly', async () => {
  const shifted = await fiscal('2023-07-01', 'b')
  expect(shifted.periods[7]).toMatchObject({ start_date: '2024-02-01', end_date: '2024-02-29' })
  expect(shifted.periods[11].end_date).toBe('2024-06-30')
})
test('C8-09: fiscal year must start on a month boundary', async () => {
  await reject(() => fiscal('2027-01-02'), 'financial_fiscal_year_invalid')
  expect(await count('financial_fiscal_periods')).toBe(12)
})
test('C8-10: overlapping years fail while adjacent years succeed', async () => {
  await reject(() => fiscal('2026-07-01'), 'financial_fiscal_year_overlap')
  expect((await fiscal('2027-01-01')).periods).toHaveLength(12)
})
test('C8-11: year replay is stable and a changed label conflicts', async () => {
  expect(await fiscal()).toEqual({ ...year, created: false })
  await reject(() => fiscal('2026-01-01', 'a', 'Changed'), 'financial_fiscal_year_conflict')
  expect(await count('financial_fiscal_periods')).toBe(12)
})
test('C8-12: series requires an explicit positive first number', async () => {
  for (const first of [null, '0', '-1']) await reject(() => makeSeries(year.id, 'a', first, 'NEW'), 'financial_voucher_series_invalid')
  const explicit = await makeSeries(year.id, 'a', '900', 'EXPLICIT')
  expect(await post({ series: explicit.id })).toMatchObject({ voucher_number: '900' })
})
test('C8-13: series replays without resetting its counter and rejects changed configuration', async () => {
  await post()
  expect(await makeSeries()).toMatchObject({ id: series.id, created: false, next_number: '2' })
  await reject(() => makeSeries(year.id, 'a', '2'), 'financial_voucher_series_conflict')
  await reject(() => makeSeries(year.id, 'a', '1', 'TEST', 'Changed'), 'financial_voucher_series_conflict')
})
test('C8-14: series cannot refer to another tenant fiscal year', async () => {
  await reject(() => makeSeries(year.id, 'b'), 'financial_fiscal_year_not_found')
})
test('C8-15: balanced posting persists lines and one matching kernel event', async () => {
  const v = await post()
  expect(v).toMatchObject({ voucher_number: '1', replayed: false, actor_id: 'reviewer' })
  expect(v.lines).toEqual([{ line_no: 1, account_id: debit.id, debit_minor: '100', credit_minor: '0', memo: null }, { line_no: 2, account_id: credit.id, debit_minor: '0', credit_minor: '100', memo: null }])
  expect(await rows('SELECT event_type,source_id,amount_minor::text,payload->>\'voucher_id\' voucher FROM financial_events WHERE id=$1', [v.event_id])).toEqual([{ event_type: 'journal_entry_posted', source_id: v.id, amount_minor: '100', voucher: v.id }])
})
test('C8-16: successful postings allocate consecutive numbers within each explicit series', async () => {
  expect((await post()).voucher_number).toBe('1')
  expect((await post({ key: 'second' })).voucher_number).toBe('2')
  const other = await makeSeries(year.id, 'a', '20', 'OTHER')
  expect((await post({ key: 'other', series: other.id })).voucher_number).toBe('20')
})
test('C8-17: replay creates no lines, events or number allocation', async () => {
  const first = await post(), before = await snapshot()
  expect(await post({ actorId: 'retrying-user' })).toMatchObject({ id: first.id, replayed: true, actor_id: 'reviewer' })
  expect(await snapshot()).toEqual(before)
})
test('C8-18: changed monetary or source identity under the same key conflicts', async () => {
  await post(); const before = await snapshot()
  for (const change of [{ series: 'other' }, { date: '2026-01-16' }, { currency: 'EUR' }, { description: 'Changed' }, { source: 'import' }, { sourceId: 'other' }, { lines: lines('101') }]) {
    await reject(() => post(change), 'financial_voucher_idempotency_conflict')
  }
  expect(await snapshot()).toEqual(before)
})
test('C8-19: line normalization gives semantically identical requests stable replay', async () => {
  const first = await post()
  expect(await post({ lines: [{ account_id: debit.id, debit_minor: '00100', credit_minor: '0', memo: '' }, { account_id: credit.id, debit_minor: '0', credit_minor: '100' }] })).toMatchObject({ id: first.id, replayed: true })
})
test('C8-20: posting requires an array of at least two object lines', async () => {
  for (const invalid of [null, {}, [], [lines()[0]]]) await reject(() => post({ lines: invalid }), 'financial_voucher_requires_two_lines')
  await reject(() => post({ lines: [null, null] }), 'financial_voucher_line_invalid')
})
test('C8-21: every line must have exactly one positive side', async () => {
  for (const first of [{ account_id: debit.id }, { account_id: debit.id, debit_minor: '100', credit_minor: '100' }]) {
    await reject(() => post({ lines: [first, lines()[1]] }), 'financial_voucher_line_one_side_required')
  }
})
test('C8-22: unequal debit and credit totals cannot be posted', async () => {
  await reject(() => post({ lines: [lines()[0], { account_id: credit.id, credit_minor: '99' }] }), 'financial_voucher_unbalanced')
  expect((await post()).voucher_number).toBe('1')
})
test('C8-23: negative, fractional, nonnumeric and overflowing amounts fail atomically', async () => {
  const before = await snapshot()
  for (const amount of ['-1', '1.2', 'NaN', '9223372036854775808']) await reject(() => post({ lines: lines(amount) }), /financial_voucher_line_invalid|out of range/)
  expect(await snapshot()).toEqual(before)
})
test('C8-24: amounts beyond JavaScript safe integer remain exact decimal strings', async () => {
  const amount = '9007199254740993', v = await post({ lines: lines(amount) })
  expect(v.lines[0].debit_minor).toBe(amount)
  expect(await rows('SELECT amount_minor::text FROM financial_events WHERE id=$1', [v.event_id])).toEqual([{ amount_minor: amount }])
})
test('C8-25: missing and foreign tenant accounts are rejected', async () => {
  const foreign = await account('FOREIGN', 'reviewer', 'b')
  for (const id of ['missing', foreign.id]) await reject(() => post({ lines: [{ account_id: id, debit_minor: '100' }, lines()[1]] }), 'financial_voucher_account_not_found')
})
test('C8-26: series must belong to both the posting tenant and year', async () => {
  const otherYear = await fiscal('2027-01-01'), otherSeries = await makeSeries(otherYear.id)
  const foreignYear = await fiscal('2026-01-01', 'b'), foreignSeries = await makeSeries(foreignYear.id, 'b')
  for (const id of [otherSeries.id, foreignSeries.id, 'missing']) await reject(() => post({ series: id }), 'financial_voucher_series_wrong_year')
})
test('C8-27: posting dates outside configured years are rejected', async () => {
  for (const date of ['2025-12-31', '2027-01-01']) await reject(() => post({ date }), 'financial_fiscal_year_for_date_not_found')
})
test('C8-28: failure at event append rolls back voucher, lines and allocated number', async () => {
  const before = await snapshot()
  await owner(async () => { await db.exec(`CREATE FUNCTION c8_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'c8_injected_event_failure'; END $$; CREATE TRIGGER c8_fail_event BEFORE INSERT ON financial_events FOR EACH ROW EXECUTE FUNCTION c8_fail_event()` ) })
  await reject(() => post(), 'c8_injected_event_failure')
  expect(await snapshot()).toEqual(before)
  await owner(async () => { await db.exec('DROP TRIGGER c8_fail_event ON financial_events') })
  expect((await post()).voucher_number).toBe('1')
})
test('C8-29: caller rollback also returns the allocated number', async () => {
  const before = await snapshot()
  await db.exec('SAVEPOINT caller_transaction'); await post(); await db.exec('ROLLBACK TO SAVEPOINT caller_transaction')
  expect(await snapshot()).toEqual(before)
  expect((await post()).voucher_number).toBe('1')
})
test('C8-30: even the table owner cannot update or delete a posted voucher', async () => {
  await post()
  await owner(async () => {
    await reject(() => db.exec("UPDATE financial_vouchers SET description='changed'"), 'financial_ledger_immutable')
    await reject(() => db.exec('DELETE FROM financial_vouchers'), 'financial_ledger_immutable')
  })
})
test('C8-31: even the table owner cannot update or delete posted lines', async () => {
  await post()
  await owner(async () => {
    await reject(() => db.exec("UPDATE financial_voucher_lines SET memo='changed'"), 'financial_ledger_immutable')
    await reject(() => db.exec('DELETE FROM financial_voucher_lines'), 'financial_ledger_immutable')
  })
})
test('C8-32: reversal creates a new voucher with swapped sides and preserves the original', async () => {
  const original = await post(), before = await rows('SELECT * FROM financial_vouchers WHERE id=$1', [original.id])
  const reversal = await reverse(original.id)
  expect(reversal).toMatchObject({ voucher_number: '2', reverses_voucher_id: original.id, reversal_root_id: original.id })
  expect(reversal.lines).toEqual(original.lines.map(l => ({ ...l, debit_minor: l.credit_minor, credit_minor: l.debit_minor })))
  expect(await rows('SELECT * FROM financial_vouchers WHERE id=$1', [original.id])).toEqual(before)
})
test('C8-33: reversal replay is stable but a second distinct reversal is rejected', async () => {
  const original = await post(), first = await reverse(original.id), before = await snapshot()
  expect(await reverse(original.id)).toMatchObject({ id: first.id, replayed: true })
  await reject(() => reverse(original.id, 'another-reversal'), 'financial_voucher_already_reversed')
  expect(await snapshot()).toEqual(before)
})
test('C8-34: reversal of reversal retains root and chains kernel event provenance', async () => {
  const original = await post(), first = await reverse(original.id), second = await reverse(first.id, 'reverse-2')
  expect(second).toMatchObject({ reverses_voucher_id: first.id, reversal_root_id: original.id })
  expect(second.lines).toEqual(original.lines)
  const events = await rows<{ id: string; causation_id: string | null; correlation_id: string }>('SELECT id,causation_id,correlation_id FROM financial_events ORDER BY seq')
  expect(events.map(e => e.causation_id)).toEqual([null, original.event_id, first.event_id])
  expect(new Set(events.map(e => e.correlation_id)).size).toBe(1)
})
test('C8-35: reversal target must exist within the same tenant', async () => {
  const original = await post()
  await reject(() => reverse(original.id, 'foreign', 'b'), 'financial_reversal_target_not_found')
  await reject(() => reverse('missing'), 'financial_reversal_target_not_found')
})
test('C8-36: periods lock in chronological date order across fiscal years', async () => {
  const earlier = await fiscal('2025-01-01')
  await reject(() => lock(), 'financial_period_lock_out_of_order')
  for (const period of earlier.periods) await lock(period.id)
  expect(await lock()).toMatchObject({ locked: true, changed: true })
  await reject(() => lock(year.periods[2].id), 'financial_period_lock_out_of_order')
})
test('C8-37: locked periods reject new posting and reversal but allow exact replay', async () => {
  const v = await post(); await lock()
  await reject(() => post({ key: 'new' }), 'financial_period_locked')
  await reject(() => reverse(v.id), 'financial_period_locked')
  expect(await post()).toMatchObject({ id: v.id, replayed: true })
})
test('C8-38: unlocking requires a reason and records actor, audit and kernel event', async () => {
  await lock()
  for (const reason of [null, '', '  ']) await reject(() => unlock(year.periods[0].id, reason), 'financial_period_unlock_reason_required')
  expect(await unlock()).toMatchObject({ changed: true, locked: false })
  expect(await rows("SELECT action,actor_id,reason FROM financial_period_lock_audit WHERE action='unlock'")).toEqual([{ action: 'unlock', actor_id: 'reviewer', reason: 'Correction approved' }])
  expect(await rows("SELECT event_type FROM financial_events ORDER BY seq")).toEqual([{ event_type: 'period_locked' }, { event_type: 'period_unlocked' }])
  expect((await post()).voucher_number).toBe('1')
})
test('C8-39: unlocking follows reverse date order, including across years', async () => {
  for (const period of year.periods) await lock(period.id)
  const next = await fiscal('2027-01-01'); await lock(next.periods[0].id)
  await reject(() => unlock(year.periods[11].id), 'financial_period_unlock_out_of_order')
  await unlock(next.periods[0].id); await unlock(year.periods[11].id)
  await reject(() => unlock(year.periods[0].id), 'financial_period_unlock_out_of_order')
})
test('C8-40: repeated lock or unlock creates no duplicate audit or event', async () => {
  await lock(); const locked = await snapshot()
  expect(await lock()).toMatchObject({ changed: false }); expect(await snapshot()).toEqual(locked)
  await unlock(); const unlocked = await snapshot()
  expect(await unlock()).toMatchObject({ changed: false }); expect(await snapshot()).toEqual(unlocked)
  await reject(() => lock(year.periods[0].id, 'reason', 'b'), 'financial_period_not_found')
})
test('C8-41: period audit is immutable and event failure rolls back unlocking', async () => {
  await lock()
  await owner(async () => {
    await reject(() => db.exec("UPDATE financial_period_lock_audit SET reason='changed'"), 'financial_ledger_immutable')
    await reject(() => db.exec('DELETE FROM financial_period_lock_audit'), 'financial_ledger_immutable')
    await db.exec(`CREATE FUNCTION c8_fail_unlock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'c8_unlock_failure'; END $$; CREATE TRIGGER c8_fail_unlock BEFORE INSERT ON financial_events FOR EACH ROW EXECUTE FUNCTION c8_fail_unlock()`)
  })
  const before = await snapshot(); await reject(() => unlock(), 'c8_unlock_failure')
  expect(await snapshot()).toEqual(before)
  expect(await rows('SELECT locked FROM financial_fiscal_periods WHERE id=$1', [year.periods[0].id])).toEqual([{ locked: true }])
})
test('C8-42: runtime roles cannot mutate tables or call private helpers; only service can call commands', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const table of tables) {
      expect(await rows('SELECT has_table_privilege($1,$2,\'INSERT,UPDATE,DELETE,TRUNCATE\') allowed', [role, table])).toEqual([{ allowed: false }])
    }
    expect(await rows("SELECT has_function_privilege($1,'financial_voucher_json(text,text)','EXECUTE') allowed", [role])).toEqual([{ allowed: false }])
    expect(await rows("SELECT has_function_privilege($1,'financial_post_voucher_internal(text,text,date,text,text,text,text,text,jsonb,text,text,text)','EXECUTE') allowed", [role])).toEqual([{ allowed: false }])
    expect(await rows("SELECT has_function_privilege($1,'post_financial_voucher(text,text,date,text,text,text,text,text,jsonb,text,text)','EXECUTE') allowed", [role])).toEqual([{ allowed: role === 'service_role' }])
  }
  await reject(() => db.exec('DELETE FROM financial_vouchers'), /permission denied/)
})
test('C8-43: authenticated membership isolates all eight ledger tables and anonymous reads fail', async () => {
  await account('FOREIGN', 'reviewer', 'b'); await post(); await lock(); await rule()
  await db.exec("SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)")
  for (const table of tables) {
    expect(await rows(`SELECT DISTINCT business_id FROM ${table}`)).toEqual([{ business_id: 'a' }])
  }
  await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true)")
  for (const table of tables) expect(await count(table)).toBe(0)
  await db.exec('SET LOCAL ROLE anon')
  await reject(() => db.exec('SELECT * FROM financial_vouchers'), /permission denied/)
})
test('C8-44: empty rule engine returns no_rule without posting or consuming a number', async () => {
  const id = await sourceEvent(), before = await snapshot()
  expect(await consume(id)).toMatchObject({ state: 'no_rule' })
  expect(await snapshot()).toEqual(before)
})
test('C8-45: explicitly configured rule posts once with event provenance and exact replay', async () => {
  const id = await sourceEvent(); await rule()
  const first = await consume(id), before = await snapshot()
  expect(first.state).toBe('posted')
  expect(await consume(id)).toMatchObject({ state: 'posted', voucher: { id: first.voucher.id, replayed: true } })
  expect(await snapshot()).toEqual(before)
  expect(await rows('SELECT causation_id FROM financial_events WHERE id=$1', [first.voucher.event_id])).toEqual([{ causation_id: id }])
})
test('C8-46: ambiguous enabled rules fail; disabled rules are not candidates', async () => {
  const id = await sourceEvent(); await rule(); await rule()
  const before = await snapshot(); await reject(() => consume(id), 'financial_ledger_rule_ambiguous'); expect(await snapshot()).toEqual(before)
  await owner(async () => { await db.exec('UPDATE financial_ledger_rules SET enabled=false WHERE id=(SELECT id FROM financial_ledger_rules LIMIT 1)') })
  expect((await consume(id)).state).toBe('posted')
})
test('C8-47: configured rules reject nonpostable events and missing explicit series', async () => {
  const id = await sourceEvent(); await rule('MISSING')
  await reject(() => consume(id), 'financial_ledger_rule_series_not_found')
  await owner(async () => { await db.exec("UPDATE financial_ledger_rules SET series_code='TEST'") })
  // Create a legitimate nonmonetary kernel event; do not alter immutable source events.
  const invalid = await rows<{ id: string }>(`SELECT id FROM append_financial_event('a','period_locked',1,now(),NULL,'period','p','fin_period_p',NULL,'period:p',NULL,NULL,'{}','system',NULL)`)
  await owner(async () => { await db.exec("UPDATE financial_ledger_rules SET event_type='period_locked'") })
  await reject(() => consume(invalid[0].id), 'financial_ledger_event_not_postable')
  expect(await count('financial_vouchers')).toBe(0)
})
test('C8-48: rule consumption is tenant-scoped and a locked-period failure is atomic', async () => {
  const id = await sourceEvent(); await rule()
  await reject(() => consume(id, 'b'), 'financial_ledger_event_not_found')
  await lock(); const before = await snapshot()
  await reject(() => consume(id), 'financial_period_locked'); expect(await snapshot()).toEqual(before)
  await unlock(); expect((await consume(id)).voucher.voucher_number).toBe('1')
})
