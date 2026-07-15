/**
 * Grön teknik-avdrag (Skatteverket 2026, Fas 1) — enhetstester för totals-motorn.
 * Körs: npx playwright test tests/gron-teknik.spec.ts --no-deps
 *
 * Kärnregeln: till skillnad från ROT/RUT (som räknar på labor_amount / arbetsandel)
 * räknas grön teknik-avdraget på HELA radtotalen (arbete + material). Tre kategorier:
 * solceller 15%, batteri (lagring) 50%, laddbox (laddpunkt) 50%. Tak 50 000 kr/år,
 * tillämpat per offert i Fas 1.
 */
import { test, expect } from '@playwright/test'
import { calculateQuoteTotals, GRON_TEKNIK_MAX_PER_YEAR } from '../lib/quote-calculations'
import type { QuoteItem } from '../lib/types/quote'

function item(over: Partial<QuoteItem>): QuoteItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'st',
    unit_price: 1000, total: 1000, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as QuoteItem
}

test.describe('Grön teknik-avdrag på HELA radtotalen (arbete + material)', () => {
  test('laddbox: arbete 15000 + material 10000 = radtotal 25000 → bas 25000, avdrag 50%', () => {
    const t = calculateQuoteTotals([
      item({
        description: 'Laddbox installation', quantity: 1, unit: 'st', unit_price: 25000,
        total: 25000, rot_rut_type: 'gron_laddpunkt',
        labor_amount: 15000, material_amount: 10000,
      }),
    ])
    expect(t.gronBase).toBe(25000)
    expect(t.gronDeduction).toBe(12500) // 50 % av 25000
    expect(t.gronCustomerPays).toBe(t.total - 12500)
  })

  test('solceller: radtotal 100000 → avdrag 15%', () => {
    const t = calculateQuoteTotals([
      item({ description: 'Solcellsanläggning', quantity: 1, unit: 'st', unit_price: 100000, total: 100000, rot_rut_type: 'gron_solceller' }),
    ])
    expect(t.gronBase).toBe(100000)
    expect(t.gronDeduction).toBe(15000) // 15 % av 100000
  })

  test('tak: batteri radtotal 120000 → rått avdrag 60000, takas till 50000', () => {
    const t = calculateQuoteTotals([
      item({ description: 'Batterilager', quantity: 1, unit: 'st', unit_price: 120000, total: 120000, rot_rut_type: 'gron_lagring' }),
    ])
    expect(t.gronBase).toBe(120000)
    // Rått avdrag (60 % ... nej 50 % av 120000 = 60000) överskrider taket
    expect(t.gronDeduction).toBe(GRON_TEKNIK_MAX_PER_YEAR)
    expect(t.gronDeduction).toBe(50000)
  })

  test('basen är HELA radtotalen, INTE labor_amount — oavsett vad labor_amount är satt till', () => {
    const t = calculateQuoteTotals([
      item({
        description: 'Laddbox', quantity: 1, unit: 'st', unit_price: 20000, total: 20000,
        rot_rut_type: 'gron_laddpunkt',
        labor_amount: 500, material_amount: 19500, // liten arbetsandel — ska INTE styra basen
      }),
    ])
    expect(t.gronBase).toBe(20000) // = lineTotal, inte labor_amount (500)
    expect(t.gronDeduction).toBe(10000) // 50 % av HELA 20000, inte av 500
  })

  test('ROT-rad och grön-rad i samma offert räknas oberoende — totalDeduction = summan', () => {
    const t = calculateQuoteTotals([
      item({ description: 'Fönsterbyte', quantity: 1, unit: 'st', unit_price: 10000, total: 10000, rot_rut_type: 'rot', is_rot_eligible: true }),
      item({ description: 'Solceller', quantity: 1, unit: 'st', unit_price: 40000, total: 40000, rot_rut_type: 'gron_solceller' }),
    ])
    expect(t.rotWorkCost).toBe(10000)
    expect(t.rotDeduction).toBe(3000) // 30 % av 10000
    expect(t.gronBase).toBe(40000)
    expect(t.gronDeduction).toBe(6000) // 15 % av 40000
    expect(t.totalDeduction).toBeCloseTo(3000 + 6000, 10)
    expect(t.customerPaysAfterDeductions).toBeCloseTo(t.total - t.totalDeduction, 10)
  })

  test('grön-taggning ändrar INTE subtotal/moms/total jämfört med en otaggad rad', () => {
    const untagged = calculateQuoteTotals([
      item({ description: 'Laddbox', quantity: 1, unit: 'st', unit_price: 25000, total: 25000 }),
    ])
    const tagged = calculateQuoteTotals([
      item({ description: 'Laddbox', quantity: 1, unit: 'st', unit_price: 25000, total: 25000, rot_rut_type: 'gron_laddpunkt' }),
    ])
    expect(tagged.subtotal).toBe(untagged.subtotal)
    expect(tagged.materialTotal).toBe(untagged.materialTotal)
    expect(tagged.laborTotal).toBe(untagged.laborTotal)
    expect(tagged.vat).toBe(untagged.vat)
    expect(tagged.total).toBe(untagged.total)
    // Men grön-avdraget syns bara på den taggade raden
    expect(untagged.gronBase).toBe(0)
    expect(tagged.gronBase).toBe(25000)
  })

  test('grön-rad med unit "tim" flödar till laborTotal, inte materialTotal (samma som otaggad tim-rad)', () => {
    const t = calculateQuoteTotals([
      item({ description: 'Installationsarbete', quantity: 10, unit: 'tim', unit_price: 1000, total: 10000, rot_rut_type: 'gron_solceller' }),
    ])
    expect(t.laborTotal).toBe(10000)
    expect(t.materialTotal).toBe(0)
    expect(t.gronBase).toBe(10000)
    expect(t.gronDeduction).toBe(1500)
  })
})
