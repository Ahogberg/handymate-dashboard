/**
 * Tillvalsrader — enhetstester för totals-motorn (EN summa-sanning).
 * Körs: npx playwright test tests/quote-options.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { calculateQuoteTotals, createDefaultItem } from '../lib/quote-calculations'
import type { QuoteItem } from '../lib/types/quote'

function item(over: Partial<QuoteItem>): QuoteItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'st',
    unit_price: 1000, total: 1000, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as QuoteItem
}

test.describe('calculateQuoteTotals med tillval', () => {
  test('OVALT tillval räknas INTE i subtotal', () => {
    const t = calculateQuoteTotals([
      item({}),
      item({ item_type: 'option', option_selected: false, unit_price: 500, total: 500 }),
    ])
    expect(t.subtotal).toBe(1000)
  })
  test('VALT tillval räknas som vanlig rad', () => {
    const t = calculateQuoteTotals([
      item({}),
      item({ item_type: 'option', option_selected: true, unit_price: 500, total: 500 }),
    ])
    expect(t.subtotal).toBe(1500)
  })
  test('valt ROT-tillval ökar rotWorkCost; ovalt gör det inte', () => {
    const rotOpt = { item_type: 'option' as const, is_rot_eligible: true, rot_rut_type: 'rot' as const, unit_price: 2000, total: 2000 }
    const on = calculateQuoteTotals([item({ ...rotOpt, option_selected: true })])
    const off = calculateQuoteTotals([item({ ...rotOpt, option_selected: false })])
    expect(on.rotWorkCost).toBe(2000)
    expect(off.rotWorkCost).toBe(0)
  })
  test('tillval + rabattrad samspelar (rabatt dras, valt tillval adderas)', () => {
    const t = calculateQuoteTotals([
      item({ unit_price: 5000, total: 5000 }),
      item({ item_type: 'option', option_selected: true, unit_price: 1000, total: 1000 }),
      item({ item_type: 'discount', quantity: 1, unit_price: 500, total: -500 }),
    ])
    expect(t.subtotal).toBe(6000)
    expect(t.discountAmount).toBe(500)
    expect(t.afterDiscount).toBe(5500)
  })
  test('createDefaultItem(option): quantity 1, selected = default (false)', () => {
    const o = createDefaultItem('option')
    expect(o.item_type).toBe('option')
    expect(o.quantity).toBe(1)
    expect(o.option_selected).toBe(false)
    expect(o.option_default).toBe(false)
  })
})
