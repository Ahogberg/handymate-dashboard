/**
 * ROT/RUT på arbetsandelen (produktbank v67) — enhetstester för totals-motorn.
 * Körs: npx playwright test tests/rot-split.spec.ts --no-deps
 *
 * Kärnregeln: per berättigad rad räknas (labor_amount ?? radens total) in i
 * ROT/RUT-basen. `??`, ALDRIG `||` — labor_amount 0 är GILTIGT (ren material)
 * och skall ge bas EXAKT 0, inte falla tillbaka på radens total.
 */
import { test, expect } from '@playwright/test'
import { calculateQuoteTotals } from '../lib/quote-calculations'
import type { QuoteItem } from '../lib/types/quote'

function item(over: Partial<QuoteItem>): QuoteItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'st',
    unit_price: 1000, total: 1000, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as QuoteItem
}

test.describe('ROT-basen på arbetsandelen', () => {
  test('rad med labor_amount 40156.01 av total 54000 → bas 40156.01, avdrag 30 %', () => {
    const t = calculateQuoteTotals([
      item({
        description: 'Fasadmålning', quantity: 120, unit: 'kvm', unit_price: 450,
        total: 54000, rot_rut_type: 'rot', is_rot_eligible: true,
        labor_amount: 40156.01, material_amount: 13843.99,
      }),
    ])
    expect(t.rotWorkCost).toBe(40156.01)
    // Motorn avrundar inte avdraget — exakt 40156.01 × 0.30 (≈ 12046.80)
    expect(t.rotDeduction).toBeCloseTo(40156.01 * 0.30, 10)
    expect(t.rotDeduction).toBeCloseTo(12046.8, 1)
    // Subtotal/laborTotal påverkas INTE av spliten — hela raden är kvar
    expect(t.subtotal).toBe(54000)
    expect(t.laborTotal).toBe(54000)
  })

  test('rad UTAN labor_amount → bas = radens total (legacy oförändrat)', () => {
    // Samma scenario som tests/quote-options.spec.ts: ROT-rad utan split
    const t = calculateQuoteTotals([
      item({ rot_rut_type: 'rot', is_rot_eligible: true, unit_price: 2000, total: 2000 }),
    ])
    expect(t.rotWorkCost).toBe(2000)
    expect(t.rotDeduction).toBe(600)
  })

  test('labor_amount 0 → bidrar EXAKT 0 till basen (??-vs-||-fällan)', () => {
    const t = calculateQuoteTotals([
      item({
        description: 'Kakel (ren material)', rot_rut_type: 'rot', is_rot_eligible: true,
        unit_price: 3000, total: 3000, labor_amount: 0, material_amount: 3000,
      }),
    ])
    expect(t.rotWorkCost).toBe(0)
    expect(t.rotDeduction).toBe(0)
    // Raden räknas fortfarande fullt i subtotalen
    expect(t.subtotal).toBe(3000)
  })

  test('blandade rader summerar rätt (split + legacy + ren material)', () => {
    const t = calculateQuoteTotals([
      item({
        quantity: 120, unit: 'kvm', unit_price: 450, total: 54000,
        rot_rut_type: 'rot', is_rot_eligible: true,
        labor_amount: 40156.01, material_amount: 13843.99,
      }),
      item({ rot_rut_type: 'rot', is_rot_eligible: true, unit_price: 1000, total: 1000 }),
      item({
        rot_rut_type: 'rot', is_rot_eligible: true, unit_price: 500, total: 500,
        labor_amount: 0, material_amount: 500,
      }),
      item({ unit_price: 250, total: 250 }), // vanlig materialrad utan ROT
    ])
    expect(t.rotWorkCost).toBeCloseTo(40156.01 + 1000 + 0, 10)
    expect(t.subtotal).toBe(54000 + 1000 + 500 + 250)
  })

  test('RUT-motsvarigheten: labor_amount styr basen, 50 % avdrag', () => {
    const t = calculateQuoteTotals([
      item({
        rot_rut_type: 'rut', is_rut_eligible: true, unit_price: 10000, total: 10000,
        labor_amount: 6000, material_amount: 4000,
      }),
      item({ rot_rut_type: 'rut', is_rut_eligible: true, unit_price: 2000, total: 2000 }),
    ])
    expect(t.rutWorkCost).toBe(8000)
    expect(t.rutDeduction).toBe(4000)
  })

  test('tillval med labor_amount: räknas bara när valt (option_selected)', () => {
    const optionRow = {
      item_type: 'option' as const, rot_rut_type: 'rot' as const, is_rot_eligible: true,
      unit_price: 5000, total: 5000, labor_amount: 3000, material_amount: 2000,
    }
    const on = calculateQuoteTotals([item({ ...optionRow, option_selected: true })])
    const off = calculateQuoteTotals([item({ ...optionRow, option_selected: false })])
    expect(on.rotWorkCost).toBe(3000)
    expect(off.rotWorkCost).toBe(0)
  })
})
