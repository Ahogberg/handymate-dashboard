import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { rotRutLaborBasis } from '../lib/rot-rut-basis'
import { rotRutDeductionInclVat } from '../lib/rot-rut'

test('delad bas läser arbetsdelen, aldrig material eller resa', () => {
  const rows = [
    { item_type: 'item', total: 1000, quantity: 1, unit_price: 1000, labor_amount: 600, material_amount: 300, travel_amount: 100, is_rot_eligible: true },
    { item_type: 'item', total: 500, quantity: 1, unit_price: 500, labor_amount: 0, material_amount: 0, travel_amount: 500, is_rot_eligible: true },
    { item_type: 'item', total: 200, quantity: 1, unit_price: 200, labor_amount: null, is_rot_eligible: true },
    { item_type: 'discount', total: -100, quantity: 1, unit_price: 100, labor_amount: null, is_rot_eligible: true },
  ]
  expect(rotRutLaborBasis(rows, 'rot')).toBe(800)
})

test('legacy-rad utan delning faller tillbaka på radtotalen, men noll gör det aldrig', () => {
  expect(rotRutLaborBasis([
    { item_type: 'item', quantity: 2, unit_price: 500, labor_amount: null, is_rut_eligible: true },
    { item_type: 'item', quantity: 1, unit_price: 9000, labor_amount: 0, is_rut_eligible: true },
  ], 'rut')).toBe(1000)
})

test('legacy-rad utan flaggor räknas som arbete bara när type är labor', () => {
  expect(rotRutLaborBasis([
    { item_type: 'item', type: 'labor', total: 1000 },
    { item_type: 'item', type: 'material', total: 400 },
    { item_type: 'item', type: 'labor', total: 300, rot_rut_type: null },
  ], 'rot')).toBe(1300)
  expect(rotRutLaborBasis([{ item_type: 'item', type: 'labor', total: 1000, is_rot_eligible: false, rot_rut_type: undefined }], 'rot')).toBe(1000)
  expect(rotRutLaborBasis([{ item_type: 'item', type: 'labor', total: 1000, rot_rut_type: 'rut' }], 'rot')).toBe(0)
})

test('25 procent moms ger ROT-kvoten 0,375 på den delade basen', () => {
  const base = rotRutLaborBasis([{ item_type: 'item', total: 1000, labor_amount: 600, is_rot_eligible: true }], 'rot')
  expect(rotRutDeductionInclVat('rot', base) / base).toBe(0.375)
})

test('varje tillåten offertsparning räknar om avdrag och kundbelopp tillsammans', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/api/quotes/route.ts'), 'utf8')
  expect(source).not.toContain('deductionIsFrozen')
  expect(source).toContain('updates.rot_deduction = rotDeduction')
  expect(source).toContain('updates.customer_pays = totalDeduction > 0 ? totals.total - totalDeduction : totals.total')
})
