/**
 * Ledger (Paket C8) — varje verifikat i tests/financial-kernel/golden-paths.ts bokförs genom
 * post_journal_entry i PGlite och läses tillbaka rad för rad. Det gör golden paths körbara från
 * C8: standard, omvänd skattskyldighet, ROT/RUT och kontantmetod bokförs genom samma RPC med
 * samma radform. Kontonumren är förslag (confirmed_by = null); kontotypen är en fixturkonstant
 * eftersom klassificeringen är konsultens (brief §5.10) och inte asserteras här. Källeventen är
 * provenanspinnar: rätt eventtyp och datum ur golden path, men syntetisk källa och payload.
 * Kör som ägare utan roller; rollerna bevisas i ledger-sql.spec.ts 45–48.
 */
import { test, expect } from '@playwright/test'
import type { PGlite } from '@electric-sql/pglite'
import { GOLDEN_PATHS, PROPOSED_ACCOUNTS, type Voucher } from './financial-kernel/golden-paths'
import { fromDecimalString } from '../lib/financial-kernel/money'
import { account, journal, ledgerDatabase, openFy, post, rows, sourceEvent, type EntryJson, type LineJson } from './helpers/ledger-database'

let db: PGlite
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { test.setTimeout(180_000); db = (await ledgerDatabase()).db })
test.afterAll(async () => { await db?.close() })

/** Fixturtyp, inte en klassificering: paketet beslutar ingen kontoplan (§5.10) och typen asserteras inte. */
const FIXTURE_ACCOUNT_TYPE = 'asset'
const VOUCHERS_IN_FIXTURE = 39
const minor = (decimal: string | null) => decimal === null ? '0' : fromDecimalString(decimal, 'SEK').amountMinor.toString()
const toLines = (v: Voucher): LineJson[] => v.lines.map(([acc, d, c]) => ({ account: acc, debit_minor: minor(d), credit_minor: minor(c) }))
const fiscalYearOf = (date: string) => date.slice(0, 4)

const posted: Array<{ gp: number; index: number; voucher: Voucher; entry: EntryJson }> = []

test('the ledger accepts every proposed account as an unconfirmed proposal and every series the fixtures use', async () => {
  await openFy(db, 'a', '2026-01-01', '2026-12-31'); await openFy(db, 'a', '2027-01-01', '2027-12-31')
  for (const series of ['F', 'B', 'L', 'M', 'IB']) await journal(db, 'a', series, `Serie ${series}`)
  for (const [number, meta] of Object.entries(PROPOSED_ACCOUNTS)) {
    const a = await account(db, 'a', number, FIXTURE_ACCOUNT_TYPE, { name: meta.name, source: 'proposal' })
    expect(a.confirmed_by).toBeNull()
  }
  expect((await rows<{ n: number }>(db, 'SELECT count(*)::int n FROM ledger_accounts WHERE confirmed_by IS NOT NULL'))[0].n).toBe(0)
})

test('every golden-path voucher posts through post_journal_entry and reads back line for line', async () => {
  for (const gp of GOLDEN_PATHS) {
    for (let index = 0; index < gp.vouchers.length; index++) {
      const voucher = gp.vouchers[index]
      const trigger = gp.events[voucher.after]
      const src = await sourceEvent(db, 'a', `gp${gp.id}:${index}`, `fin_invoice_GP${gp.id}`, trigger.t, voucher.effectiveDate)
      const lines = toLines(voucher)
      const entry = await post(db, 'a', { series: voucher.series, date: voucher.effectiveDate, desc: `GP${gp.id} verifikat ${index + 1}`, lines, sourceEvent: src, rule: 'gp', version: 1, key: `gp${gp.id}:${index}` })
      expect(entry.inserted, `GP${gp.id} #${index + 1}`).toBe(true)
      expect(entry.lines.map(l => [l.account, l.debit_minor, l.credit_minor]), `GP${gp.id} #${index + 1}`).toEqual(lines.map(l => [l.account, l.debit_minor, l.credit_minor]))
      const debit = lines.reduce((s, l) => s + BigInt(l.debit_minor), BigInt(0))
      expect(entry.total_minor).toBe(debit.toString())
      expect(entry.source_event_id).toBe(src); expect(entry.status).toBe('posted'); expect(entry.series).toBe(voucher.series)
      expect(entry.correlation_id).toBe(`fin_invoice_GP${gp.id}`); expect(entry.posting_rule_id).toBe('gp')
      posted.push({ gp: gp.id, index, voucher, entry })
    }
  }
  // Pinnat: ett nytt verifikat i fixturen ska synas här och få en radkontroll ovan, inte glida in tyst.
  expect(posted).toHaveLength(VOUCHERS_IN_FIXTURE)
  expect(GOLDEN_PATHS).toHaveLength(18)
})

test('voucher numbers run gapless per series and fiscal year, in fixture order', async () => {
  const counters = new Map<string, number>()
  for (const { voucher, entry, gp, index } of posted) {
    const key = `${voucher.series}:${fiscalYearOf(voucher.effectiveDate)}`
    const expected = (counters.get(key) ?? 0) + 1
    counters.set(key, expected)
    expect(entry.voucher_number, `GP${gp} #${index + 1} ${key}`).toBe(expected)
  }
  expect(Array.from(counters.keys()).some(k => k.startsWith('F:'))).toBe(true)
})

test('the rounding line in golden path 36 is an explicit 3740 line and the entry balances exactly', async () => {
  const gp36 = posted.filter(p => p.gp === 36).find(p => p.voucher.lines.some(([acc]) => acc === '3740'))
  expect(gp36).toBeDefined()
  expect(gp36!.entry.lines.find(l => l.account === '3740')?.debit_minor).toBe('56')
  expect(gp36!.entry.total_minor).toBe('123456')
})

test('replaying every voucher with its key returns the same entry and appends nothing', async () => {
  const before = (await rows<{ n: number }>(db, "SELECT count(*)::int n FROM financial_events WHERE event_type='journal_entry_posted'"))[0].n
  for (const { gp, index, voucher, entry } of posted) {
    const again = await post(db, 'a', { series: voucher.series, date: voucher.effectiveDate, desc: `GP${gp} verifikat ${index + 1}`, lines: toLines(voucher), sourceEvent: entry.source_event_id, rule: 'gp', version: 1, key: `gp${gp}:${index}` })
    expect(again.id).toBe(entry.id); expect(again.inserted).toBe(false)
  }
  expect((await rows<{ n: number }>(db, "SELECT count(*)::int n FROM financial_events WHERE event_type='journal_entry_posted'"))[0].n).toBe(before)
  expect(before).toBe(posted.length)
})

test('all regimes in the fixture went through the same RPC, and no account was confirmed on the way', async () => {
  const regimes = new Set(GOLDEN_PATHS.map(g => `${g.regime.vatRegime}/${g.regime.accountingMethod}/${g.regime.taxReduction ?? '-'}`))
  expect(regimes.size).toBeGreaterThanOrEqual(3)
  expect(new Set(posted.map(p => p.entry.posting_rule_id))).toEqual(new Set(['gp']))
  expect((await rows<{ n: number }>(db, 'SELECT count(*)::int n FROM ledger_accounts WHERE confirmed_by IS NOT NULL'))[0].n).toBe(0)
  expect((await rows<{ n: number }>(db, 'SELECT count(*)::int n FROM ledger_entries'))[0].n).toBe(posted.length)
})
