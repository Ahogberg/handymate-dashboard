/**
 * Facit för fakturaeditorns delsummor + radomräkning (2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * `calculateSubtotal`/`recalculateItems` (lib/invoice-calculations.ts)
 * speglar exakt samma mönster som de redan facit-testade offert-
 * varianterna (tests/quote-payment-plan.spec.ts) — men det är en
 * SEPARAT implementation, inte samma funktion återanvänd. En framtida
 * ändring i den ena filen som glöms i den andra syns annars först när
 * en faktura visar fel delsumma.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/invoice-editor-subtotals.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { calculateSubtotal, recalculateItems } from '../lib/invoice-calculations'
import type { InvoiceItem } from '../lib/types/invoice'

function item(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 'ii',
    item_type: 'item',
    description: 'Rad',
    quantity: 1,
    unit: 'st',
    unit_price: 0,
    total: 0,
    is_rot_eligible: false,
    is_rut_eligible: false,
    sort_order: 0,
    ...overrides,
  }
}

test.describe('calculateSubtotal — samma sektionsgräns-regel som offertens', () => {
  test('stannar vid närmast föregående rubrik, räknar inte hela listan', () => {
    const items = [
      item({ item_type: 'heading', description: 'Sektion' }),
      item({ quantity: 3, unit_price: 1000 }),
      item({ item_type: 'subtotal' }),
    ]
    expect(calculateSubtotal(items, 2)).toBe(3000)
  })

  test('en rabattrad inom sektionen dras av', () => {
    const items = [
      item({ quantity: 1, unit_price: 5000 }),
      item({ item_type: 'discount', total: -500 }),
      item({ item_type: 'subtotal' }),
    ]
    expect(calculateSubtotal(items, 2)).toBe(4500)
  })

  test('index som inte är en subtotal-rad ger 0', () => {
    const items = [item({ quantity: 1, unit_price: 100 })]
    expect(calculateSubtotal(items, 0)).toBe(0)
  })
})

test.describe('recalculateItems', () => {
  test('varje rads total räknas om från kvantitet × à-pris, inte det gamla sparade värdet', () => {
    const items = [item({ quantity: 3, unit_price: 500, total: 999999 })] // sparat värde är medvetet FEL
    const result = recalculateItems(items)
    expect(result[0].total).toBe(1500) // 3 × 500, inte 999999
  })

  test('en rabattrad blir alltid negativ, oavsett tecken på inmatningen', () => {
    const positivInput = recalculateItems([item({ item_type: 'discount', quantity: 1, unit_price: 200 })])
    const negativInput = recalculateItems([item({ item_type: 'discount', quantity: -1, unit_price: -200 })])
    expect(positivInput[0].total).toBe(-200)
    expect(negativInput[0].total).toBe(-200)
  })

  test('en delsummerad rad speglar exakt calculateSubtotal-resultatet för samma lista', () => {
    const items = [
      item({ id: 'a', quantity: 2, unit_price: 250 }),
      item({ id: 'b', item_type: 'subtotal' }),
    ]
    const result = recalculateItems(items)
    expect(result[1].total).toBe(calculateSubtotal(items, 1))
    expect(result[1].total).toBe(500)
  })

  test('rubrik-/textrader lämnas helt orörda', () => {
    const heading = item({ item_type: 'heading', description: 'En rubrik', total: 0 })
    const result = recalculateItems([heading])
    expect(result[0]).toEqual(heading)
  })
})
