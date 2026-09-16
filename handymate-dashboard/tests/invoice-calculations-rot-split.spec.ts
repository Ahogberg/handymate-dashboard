import { expect, test } from '@playwright/test'
import { calculateInvoiceTotals } from '../lib/invoice-calculations'

test('blandad fakturarad 60/30/10 ger ROT-bas 60 procent', () => {
  const totals = calculateInvoiceTotals([{
    id: 'i', item_type: 'item', description: 'Paket', quantity: 1, unit: 'st', unit_price: 1000, total: 1000,
    labor_amount: 600, material_amount: 300, travel_amount: 100,
    is_rot_eligible: true, is_rut_eligible: false, sort_order: 0,
  }])
  expect(totals).toMatchObject({ laborTotal: 600, materialTotal: 300, travelTotal: 100, subtotal: 1000, rotWorkCost: 600 })
  expect(totals.rotDeduction).toBe(225)
})
