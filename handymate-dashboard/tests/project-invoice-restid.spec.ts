import { expect, test } from '@playwright/test'
import { rotRutLaborBasis, splitTimeEntryLine, type TimeEntryCategory } from '../lib/rot-rut-basis'

for (const category of ['travel', 'material_pickup', 'meeting', 'admin'] as TimeEntryCategory[]) {
  test(`${category} ger aldrig ROT-bas`, () => {
    const row = { item_type: 'item', total: 1000, ...splitTimeEntryLine(1000, category) }
    expect(rotRutLaborBasis([row], 'rot')).toBe(0)
  })
}

test('work ger hela radens arbetsbas', () => {
  const row = { item_type: 'item', total: 1000, ...splitTimeEntryLine(1000, 'work') }
  expect(rotRutLaborBasis([row], 'rot')).toBe(1000)
})

test('Restid ligger i resebeloppet, övriga icke-arbeten i materialbeloppet', () => {
  expect(splitTimeEntryLine(500, 'travel')).toMatchObject({ labor_amount: 0, material_amount: 0, travel_amount: 500 })
  expect(splitTimeEntryLine(500, 'meeting')).toMatchObject({ labor_amount: 0, material_amount: 500, travel_amount: 0 })
})

test('manuella fakturabyggaren flaggar tidposten från kategorin, inte från fakturans avdragstyp', () => {
  // Speglar app/dashboard/invoices/new/page.tsx (klientkod utan harness).
  const flag = (category: string, rotRutType: 'rot' | 'rut' | '') => {
    const split = splitTimeEntryLine(1000, category)
    return { ...split, is_rot_eligible: split.is_rot_eligible && rotRutType === 'rot', is_rut_eligible: split.is_rot_eligible && rotRutType === 'rut' }
  }
  expect(flag('travel', 'rot')).toMatchObject({ is_rot_eligible: false, labor_amount: 0, travel_amount: 1000 })
  expect(flag('work', 'rot')).toMatchObject({ is_rot_eligible: true, labor_amount: 1000 })
  expect(flag('work', 'rut')).toMatchObject({ is_rot_eligible: false, is_rut_eligible: true })
  expect(flag('work', '')).toMatchObject({ is_rot_eligible: false, is_rut_eligible: false, labor_amount: 1000 })
})
