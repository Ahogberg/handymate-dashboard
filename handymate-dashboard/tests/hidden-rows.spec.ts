/**
 * Facit-tester för dold offertrad (etapp 2c, offertplanen 2026-08-05).
 *
 * SEMANTIKEN (beslut av Andreas 2026-08-05): raden syns INTE för kunden men
 * PRISET INGÅR I SUMMAN. Det testet som betyder mest här är därför att
 * beräkningarna är helt oberörda — hade summan ändrats vore funktionen bara
 * "ta bort rad light", och kunden hade kunnat räkna ihop de synliga raderna
 * och få en annan totalsumma än den som står längst ned.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/hidden-rows.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { calculateQuoteTotals, recalculateItems } from '../lib/quote-calculations'
import type { QuoteItem } from '../lib/types/quote'

function row(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: `qi_${Math.abs(overrides.sort_order ?? 0)}`,
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

test.describe('dold rad — summan är oförändrad', () => {
  test('totalen är identisk med och utan dold-flaggan', () => {
    const visible = [
      row({ id: 'a', sort_order: 0, unit_price: 12000, total: 12000 }),
      row({ id: 'b', sort_order: 1, unit_price: 8000, total: 8000 }),
      row({ id: 'c', sort_order: 2, unit_price: 4000, total: 4000 }),
    ]
    const withHidden = visible.map(item =>
      item.id === 'c' ? { ...item, is_hidden: true } : item,
    )

    const before = calculateQuoteTotals(visible, 0, 25)
    const after = calculateQuoteTotals(withHidden, 0, 25)

    expect(after.subtotal).toBe(before.subtotal)
    expect(after.total).toBe(before.total)
    expect(after.vat).toBe(before.vat)
  })

  test('ROT-avdraget påverkas inte av att en arbetsrad döljs', () => {
    const items = [
      row({ id: 'a', sort_order: 0, unit: 'tim', quantity: 10, unit_price: 600, total: 6000, is_rot_eligible: true, rot_rut_type: 'rot' }),
      row({ id: 'b', sort_order: 1, unit_price: 4000, total: 4000 }),
    ]
    const hidden = items.map(item => (item.id === 'a' ? { ...item, is_hidden: true } : item))

    const before = calculateQuoteTotals(items, 0, 25)
    const after = calculateQuoteTotals(hidden, 0, 25)

    expect(before.rotDeduction).toBeGreaterThan(0)
    expect(after.rotDeduction).toBe(before.rotDeduction)
    expect(after.rotCustomerPays).toBe(before.rotCustomerPays)
  })

  test('en helt dold offert summerar fortfarande till hela beloppet', () => {
    const items = [
      row({ id: 'a', sort_order: 0, unit_price: 5000, total: 5000, is_hidden: true }),
      row({ id: 'b', sort_order: 1, unit_price: 3000, total: 3000, is_hidden: true }),
    ]
    expect(calculateQuoteTotals(items, 0, 25).subtotal).toBe(8000)
  })

  test('recalculateItems bevarar dold-flaggan', () => {
    const items = [
      row({ id: 'a', sort_order: 0, quantity: 2, unit_price: 500, total: 0, is_hidden: true }),
      row({ id: 'b', sort_order: 1, quantity: 1, unit_price: 900, total: 0 }),
    ]
    const recalculated = recalculateItems(items)
    expect(recalculated.find(i => i.id === 'a')?.is_hidden).toBe(true)
    expect(recalculated.find(i => i.id === 'b')?.is_hidden).toBeFalsy()
    // ...och radtotalen räknas som vanligt även för den dolda raden.
    expect(recalculated.find(i => i.id === 'a')?.total).toBe(1000)
  })
})

test.describe('dold rad — default är alltid synlig', () => {
  test('en rad utan flaggan behandlas som synlig', () => {
    const item = row()
    expect(item.is_hidden).toBeUndefined()
    // Renderarna filtrerar på `item.isHidden` / `is_hidden === true`, så
    // undefined måste betyda synlig — annars skulle varje befintlig rad i
    // databasen försvinna ur kundens dokument vid deploy.
    expect(item.is_hidden === true).toBe(false)
  })
})
