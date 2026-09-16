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

test('25 procent moms ger ROT-kvoten 0,375 på den delade basen', () => {
  const base = rotRutLaborBasis([{ item_type: 'item', total: 1000, labor_amount: 600, is_rot_eligible: true }], 'rot')
  expect(rotRutDeductionInclVat('rot', base) / base).toBe(0.375)
})

test('skickad offert fryser redan lagrat avdrag', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/api/quotes/route.ts'), 'utf8')
  expect(source).toContain('const deductionIsFrozen')
  expect(source).toContain("!['draft', 'pending_approval'].includes(existing.status || '')")
  expect(source).toContain('existing.sent_at')
  expect(source).toMatch(/if \(!deductionIsFrozen\) \{[\s\S]*updates\.rot_deduction/)
})
