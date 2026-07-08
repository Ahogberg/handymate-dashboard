/**
 * Visningsnivå (Del C — produktbank) — enhetstester för den rena resolvern
 * och summary-grupperingen. Körs: npx playwright test tests/display-level.spec.ts --no-deps
 *
 * Täcker: hela läs-mappningstabellen (inkl. total_only → summary och
 * null/undefined → full), skrivfälten per planens tabell, round-trip
 * write→resolve, samt groupItemsForSummary (rubrik-partitionering, default-
 * grupp, rabatter, ignorerade text/subtotal-rader, tillval alltid separata).
 */
import { test, expect } from '@playwright/test'
import {
  resolveDisplayLevel,
  displayLevelToColumns,
  displayLevelToWriteFields,
  groupItemsForSummary,
  type DisplayLevel,
} from '../lib/quotes/display-level'

test.describe('resolveDisplayLevel — läs-mappning', () => {
  test('subtotals_only → summary', () => {
    expect(resolveDisplayLevel({ detail_level: 'subtotals_only' })).toBe('summary')
    expect(resolveDisplayLevel({ detail_level: 'subtotals_only', show_unit_prices: true })).toBe('summary')
  })

  test('total_only (legacy) → summary', () => {
    expect(resolveDisplayLevel({ detail_level: 'total_only' })).toBe('summary')
    expect(resolveDisplayLevel({ detail_level: 'total_only', show_unit_prices: true })).toBe('summary')
  })

  test('detailed + show_unit_prices !== false → full', () => {
    expect(resolveDisplayLevel({ detail_level: 'detailed', show_unit_prices: true })).toBe('full')
    expect(resolveDisplayLevel({ detail_level: 'detailed' })).toBe('full')
    expect(resolveDisplayLevel({ detail_level: 'detailed', show_unit_prices: null })).toBe('full')
  })

  test('detailed + show_unit_prices === false → rows', () => {
    expect(resolveDisplayLevel({ detail_level: 'detailed', show_unit_prices: false })).toBe('rows')
  })

  test('null/undefined detail_level → full (oförändrat för äldre offerter)', () => {
    expect(resolveDisplayLevel({})).toBe('full')
    expect(resolveDisplayLevel({ detail_level: null })).toBe('full')
    expect(resolveDisplayLevel({ detail_level: undefined, show_unit_prices: undefined })).toBe('full')
  })

  test('null/undefined detail_level + show_unit_prices false → rows', () => {
    expect(resolveDisplayLevel({ detail_level: null, show_unit_prices: false })).toBe('rows')
  })
})

test.describe('displayLevelToColumns', () => {
  test('summary döljer allt + inga rader', () => {
    expect(displayLevelToColumns('summary')).toEqual({ showQuantities: false, showUnitPrices: false, showRows: false })
  })
  test('rows visar rader men inga kolumner', () => {
    expect(displayLevelToColumns('rows')).toEqual({ showQuantities: false, showUnitPrices: false, showRows: true })
  })
  test('full visar allt', () => {
    expect(displayLevelToColumns('full')).toEqual({ showQuantities: true, showUnitPrices: true, showRows: true })
  })
})

test.describe('displayLevelToWriteFields — planens tabell', () => {
  test('summary → subtotals_only, false, false', () => {
    expect(displayLevelToWriteFields('summary')).toEqual({
      detail_level: 'subtotals_only', show_unit_prices: false, show_quantities: false,
    })
  })
  test('rows → detailed, false, false', () => {
    expect(displayLevelToWriteFields('rows')).toEqual({
      detail_level: 'detailed', show_unit_prices: false, show_quantities: false,
    })
  })
  test('full → detailed, true, true', () => {
    expect(displayLevelToWriteFields('full')).toEqual({
      detail_level: 'detailed', show_unit_prices: true, show_quantities: true,
    })
  })
})

test.describe('round-trip write → resolve', () => {
  for (const level of ['summary', 'rows', 'full'] as DisplayLevel[]) {
    test(`${level} överlever write→resolve`, () => {
      const written = displayLevelToWriteFields(level)
      expect(resolveDisplayLevel(written)).toBe(level)
    })
  }
})

test.describe('groupItemsForSummary', () => {
  test('två rubriker partitionerar korrekt med rätt summor', () => {
    const { groups, options } = groupItemsForSummary([
      { item_type: 'heading', description: 'Snickeri' },
      { item_type: 'item', description: 'Rad A', total: 1000 },
      { item_type: 'item', description: 'Rad B', total: 500 },
      { item_type: 'heading', description: 'Målning' },
      { item_type: 'item', description: 'Rad C', total: 2000 },
    ])
    expect(options).toHaveLength(0)
    expect(groups).toEqual([
      { heading: 'Snickeri', total: 1500 },
      { heading: 'Målning', total: 2000 },
    ])
  })

  test('rader före första rubriken → default-gruppen "Arbete och material"', () => {
    const { groups } = groupItemsForSummary([
      { item_type: 'item', description: 'Lös rad', total: 800 },
      { item_type: 'heading', description: 'Sektion' },
      { item_type: 'item', description: 'Rad', total: 200 },
    ])
    expect(groups).toEqual([
      { heading: 'Arbete och material', total: 800 },
      { heading: 'Sektion', total: 200 },
    ])
  })

  test('inga rubriker → en enda default-grupp', () => {
    const { groups } = groupItemsForSummary([
      { item_type: 'item', total: 100 },
      { item_type: 'item', total: 250 },
    ])
    expect(groups).toEqual([{ heading: 'Arbete och material', total: 350 }])
  })

  test('rabattrad minskar sin grupp (negativt oavsett lagrat tecken)', () => {
    const { groups } = groupItemsForSummary([
      { item_type: 'item', total: 1000 },
      { item_type: 'discount', description: 'Rabatt', total: -200 },
      { item_type: 'item', total: 500 },
      { item_type: 'discount', description: 'Rabatt 2', total: 100 }, // lagrat positivt
    ])
    expect(groups).toEqual([{ heading: 'Arbete och material', total: 1200 }]) // 1000 - 200 + 500 - 100
  })

  test('text- och subtotal-rader ignoreras (dubbelräknar ej)', () => {
    const { groups } = groupItemsForSummary([
      { item_type: 'item', total: 1000 },
      { item_type: 'text', description: 'Not' },
      { item_type: 'subtotal', description: 'Delsumma', total: 1000 },
      { item_type: 'item', total: 500 },
    ])
    expect(groups).toEqual([{ heading: 'Arbete och material', total: 1500 }])
  })

  test('tillval returneras alltid separat med belopp — aldrig i gruppsummor', () => {
    const opt = { item_type: 'option', description: 'Extra', total: 999, unit_price: 999, quantity: 1 }
    const { groups, options } = groupItemsForSummary([
      { item_type: 'item', total: 1000 },
      opt,
    ])
    expect(groups).toEqual([{ heading: 'Arbete och material', total: 1000 }])
    expect(options).toHaveLength(1)
    expect(options[0].total).toBe(999)
  })

  test('tom radlista → inga grupper och inga tillval', () => {
    const { groups, options } = groupItemsForSummary([])
    expect(groups).toEqual([])
    expect(options).toEqual([])
  })

  test('rader utan total härleds från quantity × unit_price', () => {
    const { groups } = groupItemsForSummary([
      { item_type: 'item', quantity: 3, unit_price: 100 },
    ])
    expect(groups).toEqual([{ heading: 'Arbete och material', total: 300 }])
  })
})
