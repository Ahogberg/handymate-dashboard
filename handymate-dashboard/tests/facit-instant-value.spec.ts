/**
 * Facit — onboardingens payoff-motor (lib/onboarding/instant-value.ts).
 * Kör: npx playwright test tests/facit-instant-value.spec.ts --no-deps --workers=1
 *
 * Låser (1) headline-prioriteten (pengar-dramaturgin) och (2) aggregeringen
 * (obetald/förfallen-partitionering, öppna-deals-filter). Payoff-heron visar
 * fel/svagare budskap om prioriteten glider → detta facit fångar det.
 */
import { test, expect } from '@playwright/test'
import { computeInstantValue, pickHeadline } from '../lib/onboarding/instant-value'

test.describe('pickHeadline — prioritet (starkaste ärliga fyndet)', () => {
  const zero = {
    overdue_count: 0, overdue_sum_kr: 0,
    unpaid_count: 0, unpaid_sum_kr: 0,
    customer_count: 0, open_deals_count: 0, open_deals_value_kr: 0,
  }

  test('1. förfallna fakturor slår allt → Karin, med belopp', () => {
    const h = pickHeadline({ ...zero, overdue_count: 3, overdue_sum_kr: 45000, unpaid_count: 5, unpaid_sum_kr: 80000, customer_count: 12, open_deals_count: 4 })
    expect(h.agent).toBe('Karin')
    expect(h.text).toBe('Karin har hittat 3 förfallna fakturor värda 45 000 kr')
    expect(h.amount_kr).toBe(45000)
    expect(h.count).toBe(3)
  })

  test('2. inga förfallna men obetalda → Karin bevakar', () => {
    const h = pickHeadline({ ...zero, unpaid_count: 5, unpaid_sum_kr: 80000, customer_count: 12, open_deals_count: 4 })
    expect(h.agent).toBe('Karin')
    expect(h.text).toBe('Karin bevakar 5 obetalda fakturor värda 80 000 kr')
    expect(h.amount_kr).toBe(80000)
  })

  test('3. inga fakturor men öppna affärer → Daniel', () => {
    const h = pickHeadline({ ...zero, customer_count: 12, open_deals_count: 4, open_deals_value_kr: 30000 })
    expect(h.agent).toBe('Daniel')
    expect(h.text).toBe('Daniel följer upp 4 öppna affärer')
    expect(h.amount_kr).toBe(30000)
    expect(h.count).toBe(4)
  })

  test('3b. öppna affärer utan värde → Daniel utan amount_kr', () => {
    const h = pickHeadline({ ...zero, open_deals_count: 2, open_deals_value_kr: 0 })
    expect(h.agent).toBe('Daniel')
    expect(h.amount_kr).toBeUndefined()
  })

  test('4. bara kunder → Hanna', () => {
    const h = pickHeadline({ ...zero, customer_count: 12 })
    expect(h.agent).toBe('Hanna')
    expect(h.text).toBe('12 kunder redo — dina AI-kollegor är på plats')
    expect(h.count).toBe(12)
  })

  test('5. allt tomt (skippad import) → Lisa, aldrig fabricerat', () => {
    const h = pickHeadline({ ...zero })
    expect(h.agent).toBe('Lisa')
    expect(h.text).toBe('Ditt AI-team är redo — lägg till kunder så börjar de jobba')
    expect(h.amount_kr).toBeUndefined()
    expect(h.count).toBeUndefined()
  })
})

test.describe('computeInstantValue — aggregering', () => {
  test('partitionerar obetald/förfallen korrekt', () => {
    const r = computeInstantValue({
      invoices: [
        { total: 10000, status: 'overdue' },
        { total: 5000, status: 'overdue' },
        { total: 20000, status: 'sent' },
      ],
      customerCount: 0, deals: [], stages: [],
    })
    expect(r.overdue_count).toBe(2)
    expect(r.overdue_sum_kr).toBe(15000)
    expect(r.unpaid_count).toBe(3)       // sent + overdue
    expect(r.unpaid_sum_kr).toBe(35000)
    expect(r.headline.agent).toBe('Karin')
    expect(r.headline.count).toBe(2)      // förfallna vinner
  })

  test('ignorerar fakturor som varken är sent/overdue (defensivt)', () => {
    const r = computeInstantValue({
      invoices: [
        { total: 10000, status: 'paid' },
        { total: 5000, status: 'draft' },
        { total: 7000, status: 'sent' },
      ],
      customerCount: 0, deals: [], stages: [],
    })
    expect(r.unpaid_count).toBe(1)
    expect(r.unpaid_sum_kr).toBe(7000)
    expect(r.overdue_count).toBe(0)
  })

  test('belopp rundas till heltal kronor', () => {
    const r = computeInstantValue({
      invoices: [{ total: 999.6, status: 'sent' }, { total: 0.4, status: 'sent' }],
      customerCount: 0, deals: [], stages: [],
    })
    expect(r.unpaid_sum_kr).toBe(1000) // 1000 + 0
  })

  test('öppna deals: exkluderar won/lost och saknad stage', () => {
    const r = computeInstantValue({
      invoices: [],
      customerCount: 0,
      deals: [
        { value: 10000, stage_id: 'open1' },   // öppen
        { value: 20000, stage_id: 'won1' },    // vunnen → exkluderas
        { value: 30000, stage_id: 'lost1' },   // förlorad → exkluderas
        { value: 40000, stage_id: 'ghost' },   // saknad stage → exkluderas
      ],
      stages: [
        { id: 'open1', is_won: false, is_lost: false },
        { id: 'won1', is_won: true, is_lost: false },
        { id: 'lost1', is_won: false, is_lost: true },
      ],
    })
    expect(r.open_deals_count).toBe(1)
    expect(r.open_deals_value_kr).toBe(10000)
  })

  test('tom indata → Lisa-default, alla siffror 0', () => {
    const r = computeInstantValue({ invoices: [], customerCount: 0, deals: [], stages: [] })
    expect(r.headline.agent).toBe('Lisa')
    expect(r.overdue_count).toBe(0)
    expect(r.unpaid_count).toBe(0)
    expect(r.open_deals_count).toBe(0)
    expect(r.customer_count).toBe(0)
  })

  test('bara kunder importerade → Hanna', () => {
    const r = computeInstantValue({ invoices: [], customerCount: 42, deals: [], stages: [] })
    expect(r.customer_count).toBe(42)
    expect(r.headline.agent).toBe('Hanna')
  })
})
