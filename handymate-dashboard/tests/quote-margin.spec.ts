/**
 * Facit-tester för täckningsbidraget i offerten (idé 3, 2026-08-05).
 *
 * Det viktigaste testet här är att ett SAKNAT inköpspris aldrig tolkas som
 * noll. Gjorde det det skulle en offert utan ifyllda inköpspriser visa 100 %
 * marginal — den värsta möjliga lögnen att fatta prisbeslut på.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-margin.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { calculateQuoteMargin, marginTone } from '../lib/quotes/margin'
import type { QuoteItem } from '../lib/types/quote'

function row(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'qi_1',
    item_type: 'item',
    description: 'Rad',
    quantity: 1,
    unit: 'st',
    unit_price: 1000,
    total: 1000,
    is_rot_eligible: false,
    is_rut_eligible: false,
    sort_order: 0,
    ...overrides,
  }
}

test.describe('saknat inköpspris räknas ALDRIG som noll', () => {
  test('en rad utan inköpspris ger ingen marginal alls — inte 100 %', () => {
    const margin = calculateQuoteMargin([row({ cost_price: undefined })])
    expect(margin.marginPercent).toBeNull()
    expect(margin.rowsWithoutCost).toBe(1)
    expect(margin.knownRevenue).toBe(0)
  })

  test('null behandlas likadant som undefined', () => {
    const margin = calculateQuoteMargin([row({ cost_price: null as any })])
    expect(margin.marginPercent).toBeNull()
    expect(margin.rowsWithoutCost).toBe(1)
  })

  test('inköpspris 0 är ett GILTIGT värde och ger 100 % på den raden', () => {
    // Egen arbetad timme eller återanvänt material — 0 är känt, inte saknat.
    const margin = calculateQuoteMargin([row({ cost_price: 0 })])
    expect(margin.marginPercent).toBe(100)
    expect(margin.rowsWithCost).toBe(1)
    expect(margin.rowsWithoutCost).toBe(0)
  })

  test('blandat underlag räknar bara på de kända raderna och flaggar partiellt', () => {
    const margin = calculateQuoteMargin([
      row({ id: 'a', total: 10000, quantity: 1, cost_price: 6000 }),
      row({ id: 'b', total: 5000, quantity: 1, cost_price: undefined }),
    ])
    expect(margin.knownRevenue).toBe(10000)
    expect(margin.knownCost).toBe(6000)
    expect(margin.contribution).toBe(4000)
    expect(margin.marginPercent).toBe(40)
    expect(margin.revenueWithoutCost).toBe(5000)
    expect(margin.isPartial).toBe(true)
  })

  test('helt känt underlag flaggas inte som partiellt', () => {
    const margin = calculateQuoteMargin([row({ total: 1000, cost_price: 400 })])
    expect(margin.isPartial).toBe(false)
  })
})

test.describe('vilka rader som räknas', () => {
  test('inköpspriset multipliceras med antalet', () => {
    const margin = calculateQuoteMargin([
      row({ quantity: 10, unit_price: 500, total: 5000, cost_price: 300 }),
    ])
    expect(margin.knownCost).toBe(3000)
    expect(margin.contribution).toBe(2000)
    expect(margin.marginPercent).toBe(40)
  })

  test('rubrik, fritext, delsumma och rabatt räknas inte', () => {
    const margin = calculateQuoteMargin([
      row({ id: 'h', item_type: 'heading', total: 0 }),
      row({ id: 't', item_type: 'text', total: 0 }),
      row({ id: 's', item_type: 'subtotal', total: 9999 }),
      row({ id: 'd', item_type: 'discount', total: -500 }),
    ])
    expect(margin.rowsWithCost).toBe(0)
    expect(margin.rowsWithoutCost).toBe(0)
    expect(margin.marginPercent).toBeNull()
  })

  test('valt tillval räknas, bortvalt gör det inte', () => {
    const selected = calculateQuoteMargin([
      row({ item_type: 'option', option_selected: true, total: 1000, cost_price: 600 }),
    ])
    expect(selected.rowsWithCost).toBe(1)

    const deselected = calculateQuoteMargin([
      row({ item_type: 'option', option_selected: false, total: 1000, cost_price: 600 }),
    ])
    expect(deselected.rowsWithCost).toBe(0)
  })

  test('tom offert ger ett tomt resultat, inte en krasch', () => {
    const margin = calculateQuoteMargin([])
    expect(margin.marginPercent).toBeNull()
    expect(margin.contribution).toBe(0)
  })
})

test.describe('negativ marginal syns', () => {
  test('en rad som säljs under inköpspris ger negativt täckningsbidrag', () => {
    const margin = calculateQuoteMargin([row({ total: 1000, quantity: 1, cost_price: 1400 })])
    expect(margin.contribution).toBe(-400)
    expect(margin.marginPercent).toBe(-40)
    expect(marginTone(margin)).toBe('låg')
  })
})

test.describe('tonen är en varningslampa, inte en dom', () => {
  test('trösklarna ligger där de ska', () => {
    expect(marginTone(calculateQuoteMargin([row({ total: 1000, cost_price: 900 })]))).toBe('låg')   // 10 %
    expect(marginTone(calculateQuoteMargin([row({ total: 1000, cost_price: 800 })]))).toBe('ok')    // 20 %
    expect(marginTone(calculateQuoteMargin([row({ total: 1000, cost_price: 600 })]))).toBe('god')   // 40 %
  })

  test('utan underlag är tonen "saknas" — aldrig ett påstående om marginalen', () => {
    expect(marginTone(calculateQuoteMargin([row({ cost_price: undefined })]))).toBe('saknas')
  })
})
