/**
 * Financial Kernel — konsistenskontroller på golden paths (Claude-spår C, 2026-09-13).
 *
 * Körs utan databas: kontrollerar att scenariodatan i tests/financial-kernel/golden-paths.ts
 * är internt konsistent med kontraktet i ARCHITECTURE.md §FK.1–FK.3 och blueprint §5,
 * §15.1–15.2, §18.5. När C4–C9 finns blir datan indata till riktiga körningar.
 *
 *   npx playwright test tests/financial-kernel-golden-paths.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { FINANCIAL_EVENT_TYPES } from '../lib/financial-kernel/events/catalog'
import { fromDecimalString, add, equals, sum, compare, money, type Money } from '../lib/financial-kernel/money'
import { GOLDEN_PATHS, PROPOSED_ACCOUNTS, type GoldenPath } from './financial-kernel/golden-paths'

const sek = (s: string) => fromDecimalString(s, 'SEK')
const zero = money(0, 'SEK')
const catalog = new Set<string>(FINANCIAL_EVENT_TYPES)
const byId = (id: number) => GOLDEN_PATHS.find(g => g.id === id)!

test('scenarierna har unika id inom blueprint §23 (1–40) och bara katalogens eventnamn', () => {
  const ids = GOLDEN_PATHS.map(g => g.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const id of ids) expect(id).toBeGreaterThanOrEqual(1), expect(id).toBeLessThanOrEqual(40)
  for (const g of GOLDEN_PATHS) for (const e of g.events) expect(catalog.has(e.t), `${g.id}: ${e.t}`).toBe(true)
})

test('causation pekar alltid bakåt i kedjan', () => {
  for (const g of GOLDEN_PATHS) g.events.forEach((e, i) => {
    if (e.cause !== undefined) expect(e.cause, `${g.id}[${i}]`).toBeLessThan(i)
  })
})

test('varje verifikation balanserar exakt och använder bara föreslagna konton', () => {
  for (const g of GOLDEN_PATHS) for (const v of g.vouchers) {
    let debit: Money = zero, credit: Money = zero
    for (const [account, d, c] of v.lines) {
      expect(PROPOSED_ACCOUNTS[account], `${g.id}: konto ${account} saknas i PROPOSED_ACCOUNTS`).toBeDefined()
      expect((d === null) !== (c === null), `${g.id}: rad ${account} måste ha exakt en av debet/kredit`).toBe(true)
      if (d !== null) debit = add(debit, sek(d))
      if (c !== null) credit = add(credit, sek(c))
    }
    expect(equals(debit, credit), `${g.id}: verifikation efter event ${v.after} balanserar inte (${debit.amountMinor} vs ${credit.amountMinor})`).toBe(true)
    expect(v.after).toBeLessThan(g.events.length)
  }
  for (const a of Object.values(PROPOSED_ACCOUNTS)) expect(a.confirmed).toBe(false)
})

function allocationsByPayment(g: GoldenPath): Map<string, Money> {
  const m = new Map<string, Money>()
  for (const e of g.events) if (e.t === 'payment_allocated') {
    const pid = String(e.p?.payment_id); m.set(pid, add(m.get(pid) ?? zero, sek(e.amt!)))
  }
  return m
}

test('allokeringar överstiger aldrig betalningen; överskott är kundtillgodohavande, aldrig intäkt', () => {
  for (const g of GOLDEN_PATHS) {
    const settled = new Map<string, Money>()
    for (const e of g.events) if (e.t === 'payment_settled') settled.set(String(e.p?.payment_id), sek(e.amt!))
    for (const [pid, allocated] of allocationsByPayment(g)) {
      expect(settled.has(pid), `${g.id}: allokering utan settlement ${pid}`).toBe(true)
      expect(compare(allocated, settled.get(pid)!), `${g.id}: ${pid} överallokerad`).toBeLessThanOrEqual(0)
    }
  }
  const over = byId(7)
  expect(over.vouchers.some(v => v.lines.some(([a]) => a === '2420'))).toBe(true)
  expect(over.vouchers.some(v => v.lines.some(([a]) => a === '3740'))).toBe(false)
})

test('fordranskomponenter summerar till fakturan; ROT ger två komponenter', () => {
  for (const g of GOLDEN_PATHS) {
    const issued = g.events.find(e => e.t === 'invoice_issued')
    if (!issued) continue
    const comps = g.events.filter(e => e.t === 'receivable_created')
    expect(equals(sum(comps.map(e => sek(e.amt!)), 'SEK'), sek(issued.amt!)), `${g.id}`).toBe(true)
    if (g.regime.taxReduction) {
      expect(comps.map(e => e.p?.component).sort()).toEqual(['customer', 'tax_authority'])
    }
  }
})

test('payment_received avfyras exakt lika många gånger som KUND-komponenter settlas (blueprint §18.5, GP34)', () => {
  for (const g of GOLDEN_PATHS) {
    const customerSettled = g.events.filter(e => e.t === 'receivable_settled' && e.p?.component === 'customer').length
    expect(g.automation.paymentReceived, `${g.id}`).toBe(customerSettled)
  }
  const rot = byId(34)
  expect(rot.events.filter(e => e.t === 'receivable_settled').length).toBe(2)
  expect(rot.automation.paymentReceived).toBe(1)
  const credit = byId(10)
  expect(credit.events.some(e => e.t === 'receivable_settled')).toBe(false)
  expect(credit.automation.paymentReceived).toBe(0)
})

test('omvänd skattskyldighet: ingen utgående moms, intäkt på eget konto', () => {
  const g = byId(31)
  for (const v of g.vouchers) for (const [a] of v.lines) expect(a.startsWith('26'), `${a}`).toBe(false)
  expect(g.vouchers[0].lines.some(([a]) => a === '3231')).toBe(true)
  expect(g.events[0].p?.vat_regime).toBe('reverse_charge_construction')
})

test('kontantmetoden: ingen verifikation vid invoice_issued, intäkt och moms vid allokering', () => {
  const g = byId(33)
  const issuedIdx = g.events.findIndex(e => e.t === 'invoice_issued')
  expect(g.vouchers.some(v => v.after === issuedIdx)).toBe(false)
  const allocIdx = g.events.findIndex(e => e.t === 'payment_allocated')
  const v = g.vouchers.find(v => v.after === allocIdx)!
  expect(v.lines.map(([a]) => a).sort()).toEqual(['1930', '2611', '3001'])
  // Pay-sidan är identisk med GP1: samma eventtyper i samma ordning fram till settlement.
  const payTypes = (x: GoldenPath) => x.events.map(e => e.t).filter(t => t.startsWith('payment_') || t === 'receivable_settled')
  expect(payTypes(g)).toEqual(payTypes(byId(1)).slice(0, payTypes(g).length))
})

test('avrundning: inom policy → explicit 3740-rad och settlement; utanför → öppen fordran, ingen 3740', () => {
  const within = byId(36), outside = byId(37)
  expect(within.events.some(e => e.t === 'receivable_adjusted' && e.p?.reason === 'rounding')).toBe(true)
  expect(within.events.some(e => e.t === 'receivable_settled')).toBe(true)
  expect(within.vouchers.some(v => v.lines.some(([a]) => a === '3740'))).toBe(true)
  expect(outside.events.some(e => e.t === 'receivable_settled')).toBe(false)
  expect(outside.vouchers.some(v => v.lines.some(([a]) => a === '3740'))).toBe(false)
  expect(sek(outside.invoice.outstanding).amountMinor).toBe(BigInt(3456))
  const src = readFileSync(join(__dirname, 'financial-kernel', 'golden-paths.ts'), 'utf8')
  expect(src).not.toMatch(/TOLERANCE|EPSILON|Math\.abs\(/)
})

test('periodlås och cut-over: ingen bokföring i låst period, ingen replay av historik', () => {
  const lock = byId(24)
  const lockIdx = lock.events.findIndex(e => e.t === 'period_locked')
  for (const v of lock.vouchers) if (v.after > lockIdx) expect(v.effectiveDate >= '2027-01-01').toBe(true)
  const cutover = byId(35)
  expect(cutover.events.some(e => e.t === 'invoice_issued')).toBe(false)
  expect(cutover.vouchers.every(v => v.effectiveDate >= '2026-01-01')).toBe(true)
  expect(cutover.vouchers.every(v => !v.lines.some(([a]) => a.startsWith('3')))).toBe(true)
})

test('påminnelseavgift och ränta är fordransjusteringar, inte omskrivning av fakturan', () => {
  const g = byId(39)
  const adj = g.events.filter(e => e.t === 'receivable_adjusted')
  expect(adj.map(e => e.p?.reason).sort()).toEqual(['dunning_fee', 'interest'])
  const issued = sek(g.events[0].amt!)
  const expectedPaid = add(add(issued, sek('60.00')), sek('45.20'))
  expect(equals(sek(g.invoice.paidAmount), expectedPaid)).toBe(true)
  expect(g.events.find(e => e.t === 'invoice_issued')!.amt).toBe('12500.00')
})

test('PSP: clearing töms av utbetalningen, avgiften är en egen rad', () => {
  const g = byId(2)
  const clearing = g.vouchers.flatMap(v => v.lines).filter(([a]) => a === '1580')
  const d = sum(clearing.filter(([, x]) => x !== null).map(([, x]) => sek(x!)), 'SEK')
  const c = sum(clearing.filter(([, , x]) => x !== null).map(([, , x]) => sek(x!)), 'SEK')
  expect(equals(d, c)).toBe(true)
  expect(g.vouchers.some(v => v.lines.some(([a, x]) => a === '6570' && x === '181.25'))).toBe(true)
})

test('täckning: vilka §23-scenarier som är körbara i dag, och vilka som återstår', () => {
  const covered = GOLDEN_PATHS.map(g => g.id).sort((a, b) => a - b)
  const remaining = Array.from({ length: 40 }, (_, i) => i + 1).filter(n => !covered.includes(n))
  console.log(`golden paths executable: ${covered.join(', ')}\nremaining: ${remaining.join(', ')}`)
  expect(covered.length).toBeGreaterThanOrEqual(15)
})
