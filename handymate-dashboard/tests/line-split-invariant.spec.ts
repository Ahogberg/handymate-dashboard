import { expect, test } from '@playwright/test'
import { splitLine } from '../lib/rot-rut-basis'
import { buildItemSnapshot, resolveLineShares } from '../lib/products/build-item-snapshot'

test.describe('obligatorisk radfördelning', () => {
  test('splitLine är öre-exakt och material är resten', () => {
    const split = splitLine(999.99, 1 / 3, 0.1)
    expect(split).toEqual({ labor_amount: 333.33, travel_amount: 100, material_amount: 566.66 })
    expect(split.labor_amount + split.material_amount + split.travel_amount).toBe(999.99)
  })

  test('andelssumma över 1 avvisas', () => {
    expect(() => splitLine(1000, 0.8, 0.3)).toThrow('tillsammans högst 1')
    expect(() => splitLine(1000, -0.1, 0)).toThrow()
  })

  test('resa-komponent får egen andel och ROT-avstängt arbete räknas inte i arbetsbasen', () => {
    const shares = resolveLineShares([
      { component_type: 'arbete', description: 'Montage', quantity_per_unit: 2, unit: 'tim', unit_cost: 0, unit_price: 600, is_rot_eligible: true },
      { component_type: 'arbete', description: 'Kontroll', quantity_per_unit: 1, unit: 'tim', unit_cost: 0, unit_price: 300, is_rot_eligible: false },
      { component_type: 'material', description: 'Del', quantity_per_unit: 1, unit: 'st', unit_cost: 0, unit_price: 400 },
      { component_type: 'resa', description: 'Framkörning', quantity_per_unit: 1, unit: 'st', unit_cost: 0, unit_price: 100 },
    ], null, 0)
    expect(shares.laborShare).toBe(0.6)
    expect(shares.travelShare).toBe(0.05)
  })

  test('komponentradernas utpris är auktoritativt för total och delning', () => {
    const components = [
      { component_type: 'arbete' as const, description: 'Montage', quantity_per_unit: 2, unit: 'tim', unit_cost: 300, unit_price: 700, is_rot_eligible: true },
      { component_type: 'material' as const, description: 'Del', quantity_per_unit: 3, unit: 'st', unit_cost: 50, unit_price: 100 },
      { component_type: 'resa' as const, description: 'Bil', quantity_per_unit: 1, unit: 'st', unit_cost: 20, unit_price: 300, is_rot_eligible: false },
    ]
    const componentTotal = components.reduce((sum, row) => sum + row.quantity_per_unit * Number(row.unit_price), 0)
    const snapshot = buildItemSnapshot({ id: 'p', name: 'Paket', sku: null, sales_price: componentTotal, default_labor_share: 0, default_travel_share: 0 }, components, 1, componentTotal)
    expect(componentTotal).toBe(2000)
    expect(snapshot).toMatchObject({ labor_amount: 1400, material_amount: 300, travel_amount: 300 })
  })
})
