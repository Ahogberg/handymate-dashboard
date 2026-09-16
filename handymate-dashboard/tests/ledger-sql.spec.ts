/**
 * Ledger (Paket C8) — de 48 kontrollerna i FINANCIAL_KERNEL_C8_BRIEF.md §6 mot den
 * riktiga migrationen sql/v251_ledger_posting_engine.sql i PGlite. Varje test börjar
 * i en egen transaktion; det som måste nå COMMIT (30) kör på en egen instans.
 */
import { test, expect } from '@playwright/test'
import type { PGlite } from '@electric-sql/pglite'
import {
  ISSUE_LINES, USER_A, account, events, journal, ledgerDatabase, line, lock, openFy, post, readEntry, reverse, rows, seeded, sourceEvent, unlock,
} from './helpers/ledger-database'

let db: PGlite
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { test.setTimeout(120_000); db = (await ledgerDatabase()).db })
test.afterAll(async () => { await db?.close() })
test.beforeEach(async () => { await db.exec('BEGIN') })
test.afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })

async function rejects(run: () => Promise<unknown>, message: RegExp | string) {
  await db.exec('SAVEPOINT rejected_call')
  try { await expect(run()).rejects.toThrow(message) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT rejected_call; RELEASE SAVEPOINT rejected_call') }
}
async function role(name: 'service_role' | 'anon' | 'authenticated', run: () => Promise<void>, jwtSub?: string) {
  await db.exec('SAVEPOINT role_scope')
  await db.exec(`SET LOCAL ROLE ${name}`)
  if (jwtSub) await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [jwtSub])
  try { await run() }
  catch (error) { await db.exec('ROLLBACK TO SAVEPOINT role_scope'); throw error }
  finally { await db.exec('RESET ROLE; RELEASE SAVEPOINT role_scope') }
}
const count = async (sql: string, args: unknown[] = []) => (await rows<{ n: number }>(db, `SELECT count(*)::int n FROM (${sql}) t`, args))[0].n

// ── Räkenskapsår och perioder (5) ──
test('01 a calendar fiscal year opens with twelve open monthly periods', async () => {
  const fy = await openFy(db, 'a', '2026-01-01', '2026-12-31')
  expect(fy.periods).toHaveLength(12)
  expect(fy.periods.every(p => p.status === 'open')).toBe(true)
  expect([fy.periods[0].starts_on, fy.periods[11].ends_on]).toEqual(['2026-01-01', '2026-12-31'])
})
test('02 opening the same year again is idempotent', async () => {
  const fy = await openFy(db, 'a', '2026-01-01', '2026-12-31')
  const again = await openFy(db, 'a', '2026-01-01', '2026-12-31')
  expect(again.id).toBe(fy.id)
  expect(await count('SELECT id FROM ledger_periods')).toBe(12)
})
test('03 an overlapping year is refused', async () => {
  await openFy(db, 'a', '2026-01-01', '2026-12-31')
  await rejects(() => openFy(db, 'a', '2026-07-01', '2027-06-30'), 'ledger_fiscal_year_overlap')
})
test('04 a year that does not start on the first of a month is refused', async () => {
  await rejects(() => openFy(db, 'a', '2027-01-15', '2027-12-31'), /check|starts_on/)
})
test('05 a broken first year of eighteen months has eighteen periods; nineteen is refused', async () => {
  const broken = await openFy(db, 'a', '2027-01-01', '2028-06-30')
  expect(broken.periods).toHaveLength(18)
  await rejects(() => openFy(db, 'b', '2026-01-01', '2027-07-31'), /check|18/)
})

// ── Serier och konton (4) ──
test('06 a journal is idempotent per series and keeps its first name', async () => {
  const j1 = await journal(db, 'a', 'A'); const j2 = await journal(db, 'a', 'A', 'Annat namn')
  expect(j2.id).toBe(j1.id); expect(j2.name).toBe('Serie A')
})
test('07 a lower-case or seven-character series is refused', async () => {
  await rejects(() => journal(db, 'a', 'f1'), /series|check/)
  await rejects(() => journal(db, 'a', 'ABCDEFG'), /series|check/)
})
test('08 an account is unconfirmed until a named person confirms it, and stays confirmed after', async () => {
  const a1 = await account(db, 'a', '1510', 'asset')
  const a2 = await account(db, 'a', '1510', 'asset', { confirmedBy: 'Namngiven Konsult' })
  const a3 = await account(db, 'a', '1510', 'asset')
  const row = (await rows<{ confirmed_at: string | null }>(db, "SELECT confirmed_at FROM ledger_accounts WHERE number='1510'"))[0]
  expect(a1.confirmed_by).toBeNull(); expect(a2.confirmed_by).toBe('Namngiven Konsult'); expect(a3.confirmed_by).toBe('Namngiven Konsult')
  expect(row.confirmed_at).not.toBeNull()
})
test('09 a blank confirmed_by is null and the type set is closed', async () => {
  expect((await account(db, 'a', '1930', 'asset', { confirmedBy: '   ' })).confirmed_by).toBeNull()
  await rejects(() => account(db, 'a', '9999', 'other'), /type|check/)
})

// ── Bokföring (18) ──
test('10 a balanced entry posts with voucher A1, string minor units, ordered lines and the March period', async () => {
  const { src, periods } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  expect(e.inserted).toBe(true); expect(e.series).toBe('A'); expect(e.voucher_number).toBe(1)
  expect(e.total_minor).toBe('1250000'); expect(e.lines.map(l => l.account)).toEqual(['1510', '3001', '2611'])
  expect(e.lines[0].debit_minor).toBe('1250000'); expect(e.lines[0].line_no).toBe(1)
  expect(e.period_id).toBe(periods[2].id); expect(e.status).toBe('posted')
})
test('11 journal_entry_posted is appended in the same transaction with the FK.1 payload, the source event as causation and its correlation', async () => {
  const { src, periods } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  const ev = (await events(db, 'journal_entry_posted'))[0]
  expect(e.posted_event_id).toBe(ev.id); expect(ev.causation_id).toBe(src); expect(ev.correlation_id).toBe('fin_invoice_F-1')
  expect(ev.amount_minor).toBe('1250000'); expect(ev.eff).toBe('2026-03-10')
  expect(ev.payload).toEqual({ journal_entry_id: e.id, journal_type: 'standard', voucher_series: 'A', voucher_number: 1, effective_date: '2026-03-10',
    period_id: periods[2].id, rule_id: 'se.customer_invoice', rule_version: 1, source_event_id: src })
})
test('12 numbers run per series: A2 after A1, B1 in the other series', async () => {
  const { src } = await seeded(db)
  await post(db, 'a', { sourceEvent: src })
  const e2 = await post(db, 'a', { sourceEvent: src, key: 'k2' })
  const b1 = await post(db, 'a', { sourceEvent: src, key: 'k3', series: 'B', lines: [line('1930', '1250000', '0'), line('1510', '0', '1250000')] })
  expect(e2.voucher_number).toBe(2); expect(b1.series).toBe('B'); expect(b1.voucher_number).toBe(1)
})
test('13 numbers restart per fiscal year', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  await openFy(db, 'a', '2027-01-01', '2027-12-31')
  const next = await post(db, 'a', { sourceEvent: src, key: 'k4', date: '2027-02-01' })
  expect(next.voucher_number).toBe(1); expect(next.fiscal_year_id).not.toBe(e.fiscal_year_id)
})
test('14 an unbalanced entry is refused with no row and no event', async () => {
  const { src } = await seeded(db)
  const before = await count('SELECT id FROM financial_events')
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k5', lines: [line('1510', '100', '0'), line('3001', '0', '99')] }), 'ledger_entry_unbalanced')
  expect(await count('SELECT id FROM financial_events')).toBe(before)
  expect(await count("SELECT id FROM ledger_entries WHERE idempotency_key='k5'")).toBe(0)
})
test('15 a failed posting consumes no voucher number', async () => {
  const { src } = await seeded(db)
  await post(db, 'a', { sourceEvent: src }); await post(db, 'a', { sourceEvent: src, key: 'k2' })
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k5', lines: [line('1510', '100', '0'), line('3001', '0', '99')] }), 'ledger_entry_unbalanced')
  expect((await post(db, 'a', { sourceEvent: src, key: 'k6' })).voucher_number).toBe(3)
})
test('16 a line with both sides, neither side, or a lone line is refused', async () => {
  const { src } = await seeded(db)
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k7', lines: [line('1510', '100', '100'), line('3001', '0', '0')] }), 'ledger_line_one_side')
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k8', lines: [line('1510', '100', '0')] }), 'ledger_lines_required')
})
test('17 decimal or negative amounts are refused', async () => {
  const { src } = await seeded(db)
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k9', lines: [line('1510', '100.50', '0'), line('3001', '0', '100.50')] }), 'ledger_line_amount_invalid')
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k10', lines: [line('1510', '-100', '0'), line('3001', '0', '-100')] }), 'ledger_line_amount_invalid')
})
test('18 an unknown or inactive account is refused', async () => {
  const { src } = await seeded(db)
  await account(db, 'a', '4010', 'expense', { active: false })
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k11', lines: [line('9999', '100', '0'), line('3001', '0', '100')] }), 'ledger_account_not_found')
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k12', lines: [line('4010', '100', '0'), line('3001', '0', '100')] }), 'ledger_account_inactive')
})
test('19 replaying the same key returns the same entry without a second event', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  const replay = await post(db, 'a', { sourceEvent: src })
  expect(replay.id).toBe(e.id); expect(replay.inserted).toBe(false)
  expect(await events(db, 'journal_entry_posted')).toHaveLength(1)
})
test('20 replaying the key with different lines or date is a conflict', async () => {
  const { src } = await seeded(db)
  await post(db, 'a', { sourceEvent: src })
  await rejects(() => post(db, 'a', { sourceEvent: src, lines: [line('1510', '1250000', '0'), line('3001', '0', '1250000')] }), 'ledger_idempotency_conflict')
  await rejects(() => post(db, 'a', { sourceEvent: src, date: '2026-03-11' }), 'ledger_idempotency_conflict')
})
test('21 a date outside every fiscal year has no period', async () => {
  const { src } = await seeded(db)
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k13', date: '2025-12-31' }), 'ledger_period_not_found')
})
test('22 a rule-driven entry needs a source event of the same business', async () => {
  await seeded(db)
  const foreign = await sourceEvent(db, 'b', 'inv-b', 'fin_invoice_B-1')
  await rejects(() => post(db, 'a', { key: 'k14' }), 'ledger_source_event_required')
  await rejects(() => post(db, 'a', { key: 'k15', sourceEvent: 'not-an-event' }), 'ledger_source_event_not_found')
  await rejects(() => post(db, 'a', { key: 'k15b', sourceEvent: foreign }), 'ledger_source_event_not_found')
})
test('23 a manual voucher needs a named user and version 0 and gets its own correlation', async () => {
  await seeded(db)
  const m = await post(db, 'a', { key: 'm1', rule: 'manual', version: 0, actorType: 'user', actorId: 'u1', type: 'manual', desc: 'Periodisering' })
  expect(m.inserted).toBe(true); expect(m.source_event_id).toBeNull(); expect(m.correlation_id.startsWith('fin_ledger_')).toBe(true)
  await rejects(() => post(db, 'a', { key: 'm2', rule: 'manual', version: 0, actorType: 'system' }), 'ledger_manual_requires_user')
  await rejects(() => post(db, 'a', { key: 'm3', rule: 'manual', version: 1, actorType: 'user', actorId: 'u1' }), 'ledger_manual_requires_user')
  await rejects(() => post(db, 'a', { key: 'm4', rule: 'manual', version: 0, actorType: 'user', actorId: ' ' }), 'ledger_manual_requires_user')
})
test('24 a manual voucher may not carry a source event', async () => {
  const { src } = await seeded(db)
  await rejects(() => post(db, 'a', { key: 'm5', rule: 'manual', version: 0, actorType: 'user', actorId: 'u1', sourceEvent: src }), 'ledger_manual_requires_user')
})
test('25 post_journal_entry refuses to pose as a reversal', async () => {
  const { src } = await seeded(db)
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k16', type: 'reversal' }), 'ledger_use_reverse_journal_entry')
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'k17', rule: 'reversal' }), 'ledger_use_reverse_journal_entry')
})
test('26 amounts beyond JavaScript safe integers round-trip exactly as strings', async () => {
  const { src } = await seeded(db)
  const big = await post(db, 'a', { sourceEvent: src, key: 'big', lines: [line('1510', '9007199254740993', '0'), line('3001', '0', '9007199254740993')] })
  expect(big.total_minor).toBe('9007199254740993'); expect(big.lines[1].credit_minor).toBe('9007199254740993')
})
test('27 golden path 36: the rounding difference is an explicit line and the entry balances exactly', async () => {
  const { src } = await seeded(db)
  const gp36 = await post(db, 'a', { sourceEvent: src, key: 'gp36', series: 'B', lines: [line('1930', '123400', '0'), line('3740', '56', '0'), line('1510', '0', '123456')] })
  expect(gp36.total_minor).toBe('123456'); expect(gp36.lines).toHaveLength(3)
})

// ── Oföränderlighet på tabellnivå (4) ──
test('28 an entry cannot be edited or deleted, even by the owner', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  await rejects(() => db.query("UPDATE ledger_entries SET description='x' WHERE id=$1", [e.id]), 'ledger_entries_immutable')
  await rejects(() => db.query("UPDATE ledger_entries SET effective_date='2026-03-11' WHERE id=$1", [e.id]), 'ledger_entries_immutable')
  await rejects(() => db.query('DELETE FROM ledger_entries WHERE id=$1', [e.id]), 'ledger_entries_immutable')
})
test('29 a line cannot be edited or deleted', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  await rejects(() => db.query('UPDATE ledger_entry_lines SET debit_minor=1 WHERE entry_id=$1', [e.id]), 'ledger_lines_immutable')
  await rejects(() => db.query('DELETE FROM ledger_entry_lines WHERE entry_id=$1', [e.id]), 'ledger_lines_immutable')
})
test('30 a line inserted behind the RPC is caught at commit by the deferred balance trigger', async () => {
  // Egen instans: kontrollen måste nå ett riktigt COMMIT.
  const fresh = (await ledgerDatabase()).db
  try {
    const { src } = await seeded(fresh)
    const e = await post(fresh, 'a', { sourceEvent: src })
    const acc = (await rows<{ id: string }>(fresh, "SELECT id FROM ledger_accounts WHERE number='1510'"))[0]
    await expect((async () => {
      await fresh.exec('BEGIN')
      await fresh.query('INSERT INTO ledger_entry_lines(business_id,entry_id,line_no,account_id,debit_minor) VALUES($1,$2,9,$3,5)', ['a', e.id, acc.id])
      await fresh.exec('COMMIT')
    })()).rejects.toThrow('ledger_entry_unbalanced')
    await fresh.exec('ROLLBACK').catch(() => undefined)
    expect((await rows(fresh, 'SELECT line_no FROM ledger_entry_lines WHERE entry_id=$1', [e.id])).length).toBe(3)
  } finally { await fresh.close() }
})
test('31 the account type is frozen once it has lines', async () => {
  const { src } = await seeded(db)
  await post(db, 'a', { sourceEvent: src })
  await rejects(() => account(db, 'a', '1510', 'liability'), 'ledger_account_type_frozen')
})

// ── Vändning (6) ──
test('32 a reversal is a new entry in the same series with the sides swapped and the original marked, otherwise untouched', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  const r = await reverse(db, 'a', e.id)
  const orig = await readEntry(db, 'a', e.id)
  expect(r.inserted).toBe(true); expect(r.series).toBe('A'); expect(r.voucher_number).toBe(2); expect(r.journal_type).toBe('reversal')
  expect(r.reversal_of_entry_id).toBe(e.id); expect(r.lines[0].credit_minor).toBe('1250000'); expect(r.lines[1].debit_minor).toBe('1000000')
  expect(orig?.status).toBe('reversed'); expect(orig?.reversed_by_entry_id).toBe(r.id); expect(orig?.description).toBe('Faktura F-1')
  expect(orig?.lines.map(l => [l.account, l.debit_minor, l.credit_minor])).toEqual(ISSUE_LINES.map(l => [l.account, l.debit_minor, l.credit_minor]))
})
test('33 the reversal chains its provenance: source = original posted event; journal_entry_reversed names both entries and the reason', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  const r = await reverse(db, 'a', e.id)
  const rev = (await events(db, 'journal_entry_reversed'))[0]
  const posted = await events(db, 'journal_entry_posted')
  expect(r.source_event_id).toBe(e.posted_event_id); expect(posted[1].causation_id).toBe(e.posted_event_id)
  expect(rev.payload).toEqual({ journal_entry_id: e.id, reversal_entry_id: r.id, reason: 'Fel konto' })
  expect(rev.causation_id).toBe(r.posted_event_id); expect(r.reversed_event_id).toBe(rev.id)
})
test('34 an entry is reversed at most once, and a reversal is not reversed', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  const r = await reverse(db, 'a', e.id)
  await rejects(() => reverse(db, 'a', e.id, { key: 'rev2' }), 'ledger_entry_has_reversal')
  await rejects(() => reverse(db, 'a', r.id, { key: 'rev3' }), 'ledger_reversal_of_reversal')
})
test('35 replaying the reversal key returns the same reversal', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  const r = await reverse(db, 'a', e.id)
  const again = await reverse(db, 'a', e.id)
  expect(again.id).toBe(r.id); expect(again.inserted).toBe(false)
  expect(await events(db, 'journal_entry_reversed')).toHaveLength(1)
})
test('36 a reversal needs a reason and may not be dated before the original', async () => {
  const { src } = await seeded(db)
  const e2 = await post(db, 'a', { sourceEvent: src, key: 'k2' })
  await rejects(() => reverse(db, 'a', e2.id, { key: 'rev4', reason: ' ' }), 'ledger_reversal_reason_required')
  await rejects(() => reverse(db, 'a', e2.id, { key: 'rev5', date: '2026-03-09' }), 'ledger_reversal_before_original')
})
test('37 another tenant can neither reverse nor read the entry', async () => {
  const { src } = await seeded(db)
  const e2 = await post(db, 'a', { sourceEvent: src, key: 'k2' })
  await rejects(() => reverse(db, 'b', e2.id, { key: 'rev6' }), 'ledger_entry_not_found')
  expect(await readEntry(db, 'b', e2.id)).toBeNull()
})

// ── Periodlås (7) ──
test('38 locking a period is audited with the actor and blocks posting into it, not into the next', async () => {
  const { src, periods } = await seeded(db)
  const [jan] = periods
  const l = await lock(db, 'a', jan.id)
  const ev = (await events(db, 'period_locked'))[0]
  expect(l.changed).toBe(true); expect(ev.actor_id).toBe('u1'); expect(ev.eff).toBe('2026-01-31')
  expect(ev.payload).toEqual({ period_id: jan.id, fiscal_year_id: jan.id && (await rows<{ fiscal_year_id: string }>(db, 'SELECT fiscal_year_id FROM ledger_periods WHERE id=$1', [jan.id]))[0].fiscal_year_id, locked_by: 'u1' })
  await rejects(() => post(db, 'a', { sourceEvent: src, key: 'jan', date: '2026-01-15' }), 'ledger_period_not_open')
  expect((await post(db, 'a', { sourceEvent: src, key: 'feb', date: '2026-02-15' })).inserted).toBe(true)
})
test('39 periods lock in date order', async () => {
  const { periods } = await seeded(db)
  const [jan, feb, mar] = periods
  await lock(db, 'a', jan.id)
  await rejects(() => lock(db, 'a', mar.id), 'ledger_period_lock_order')
  expect((await lock(db, 'a', feb.id)).changed).toBe(true); expect((await lock(db, 'a', mar.id)).changed).toBe(true)
})
test('40 locking a locked period changes nothing and appends nothing', async () => {
  const { periods } = await seeded(db)
  await lock(db, 'a', periods[0].id)
  const n = (await events(db, 'period_locked')).length
  expect((await lock(db, 'a', periods[0].id)).changed).toBe(false)
  expect(await events(db, 'period_locked')).toHaveLength(n)
})
test('41 unlock needs an actor and a reason and runs in reverse order', async () => {
  const { periods } = await seeded(db)
  const [jan, feb, mar] = periods
  await lock(db, 'a', jan.id); await lock(db, 'a', feb.id); await lock(db, 'a', mar.id)
  await rejects(() => unlock(db, 'a', mar.id, 'u1', ' '), 'ledger_unlock_requires_actor_and_reason')
  await rejects(() => unlock(db, 'a', mar.id, ' ', 'Rättelse'), 'ledger_unlock_requires_actor_and_reason')
  await rejects(() => unlock(db, 'a', feb.id), 'ledger_period_unlock_order')
})
test('42 unlock is audited with reason and actor, caused by the lock event, and posting works again', async () => {
  const { src, periods } = await seeded(db)
  const [jan, feb, mar] = periods
  await lock(db, 'a', jan.id); await lock(db, 'a', feb.id); const locked = await lock(db, 'a', mar.id)
  const u = await unlock(db, 'a', mar.id)
  const uev = (await events(db, 'period_unlocked'))[0]
  const marRow = (await rows<{ status: string; lock_event_id: string | null }>(db, 'SELECT status, lock_event_id FROM ledger_periods WHERE id=$1', [mar.id]))[0]
  expect(u.changed).toBe(true); expect(uev.payload).toMatchObject({ period_id: mar.id, unlocked_by: 'u1', reason: 'Rättelse' })
  expect(uev.causation_id).toBe(locked.event_id); expect(marRow).toEqual({ status: 'open', lock_event_id: null })
  expect((await post(db, 'a', { sourceEvent: src, key: 'mar', date: '2026-03-20' })).inserted).toBe(true)
})
test('43 a reversal into a locked period is refused', async () => {
  const { src, periods } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src, key: 'apr', date: '2026-04-05' })
  for (const p of periods.slice(0, 4)) await lock(db, 'a', p.id)
  await rejects(() => reverse(db, 'a', e.id, { key: 'rev', date: '2026-04-10' }), 'ledger_period_not_open')
})
test('44 another tenant can neither lock nor unlock the period', async () => {
  const { periods } = await seeded(db)
  await rejects(() => lock(db, 'b', periods[1].id), 'ledger_period_not_found')
  await rejects(() => unlock(db, 'b', periods[1].id), 'ledger_period_not_found')
})

// ── Roller och grants (4) ──
test('45 anon can neither read nor post', async () => {
  const { src } = await seeded(db)
  await post(db, 'a', { sourceEvent: src })
  await role('anon', async () => {
    await rejects(() => rows(db, 'SELECT * FROM ledger_entries'), 'permission denied')
    await rejects(() => post(db, 'a', { sourceEvent: src, key: 'x' }), 'permission denied')
  })
})
test('46 authenticated reads only its own business and can neither post nor lock', async () => {
  const { src } = await seeded(db)
  const e = await post(db, 'a', { sourceEvent: src })
  await role('authenticated', async () => { expect(await rows(db, 'SELECT * FROM ledger_entries')).toHaveLength(0) })
  await role('authenticated', async () => {
    expect(await rows(db, 'SELECT * FROM ledger_entries')).toHaveLength(1)
    expect(await rows(db, 'SELECT * FROM ledger_entry_lines')).toHaveLength(3)
    await rejects(() => rows(db, 'SELECT * FROM ledger_voucher_counters'), 'permission denied')
    await rejects(() => post(db, 'a', { sourceEvent: src, key: 'x' }), 'permission denied')
    await rejects(() => lock(db, 'a', e.period_id), 'permission denied')
  }, USER_A)
  await role('authenticated', async () => { expect(await rows(db, 'SELECT * FROM ledger_entries')).toHaveLength(0) }, '00000000-0000-0000-0000-000000000002')
})
test('47 service_role reads but cannot insert an entry, update a counter or a period directly', async () => {
  const { src } = await seeded(db)
  await post(db, 'a', { sourceEvent: src })
  await role('service_role', async () => {
    expect(await rows(db, 'SELECT * FROM ledger_entry_lines')).toHaveLength(3)
    await rejects(() => db.query(`INSERT INTO ledger_entries(business_id,journal_id,fiscal_year_id,period_id,voucher_number,journal_type,effective_date,currency,total_minor,description,correlation_id,posting_rule_id,posting_rule_version,idempotency_key,request_hash,posted_event_id,actor_type)
      SELECT business_id,journal_id,fiscal_year_id,period_id,99,journal_type,effective_date,currency,total_minor,description,correlation_id,posting_rule_id,posting_rule_version,'zz','h',posted_event_id,actor_type FROM ledger_entries`), 'permission denied')
    await rejects(() => db.query('UPDATE ledger_voucher_counters SET next_number=1'), 'permission denied')
    await rejects(() => db.query("UPDATE ledger_periods SET status='locked'"), 'permission denied')
  })
})
test('48 service_role cannot call the internal posting core, only the RPCs', async () => {
  const { src } = await seeded(db)
  await role('service_role', async () => {
    await rejects(() => db.query("SELECT ledger_post('a','A','standard','2026-03-10','x','[]',NULL,'r',1,'k','system',NULL,'SEK',NULL)"), 'permission denied')
    expect((await post(db, 'a', { sourceEvent: src, key: 'svc' })).inserted).toBe(true)
  })
})
