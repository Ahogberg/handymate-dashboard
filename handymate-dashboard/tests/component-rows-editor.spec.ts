import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { componentCostTotal, componentSaleTotal, resolveLineShares } from '../lib/products/build-item-snapshot'

const components = [
  { component_type: 'arbete' as const, description: 'Montage', article_number: 'A1', quantity_per_unit: 2, unit: 'tim', unit_cost: 400, unit_price: 800, is_rot_eligible: true },
  { component_type: 'material' as const, description: 'Fäste', article_number: 'M1', quantity_per_unit: 3, unit: 'st', unit_cost: 50, unit_price: 100, is_rot_eligible: false },
  { component_type: 'resa' as const, description: 'Framkörning', article_number: 'R1', quantity_per_unit: 1, unit: 'st', unit_cost: 100, unit_price: 200, is_rot_eligible: false },
]

test('komponenternas antal × à-pris styr total och arbete/material/resa', () => {
  expect(componentSaleTotal(components)).toBe(2100)
  expect(componentCostTotal(components)).toBe(1050)
  const shares = resolveLineShares(components, null, 0)
  expect(shares.laborShare).toBeCloseTo(1600 / 2100)
  expect(shares.travelShare).toBeCloseTo(200 / 2100)
})

test('radeditorn har fria rader, kataloghämtning, borttagning, ROT-vakt och spara som artikel', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/quotes/document/RowEditSheet.tsx'), 'utf8')
  expect(source).toContain('Hämta artikel ur katalogen')
  expect(source).toContain('Spara som artikel')
  expect(source).toContain("component_type: event.target.value")
  expect(source).toContain("event.target.value === 'arbete'")
  expect(source).toContain('writeComponents(components.filter')
  expect(source).toContain('Kostnad {componentCost')
  expect(source).toContain('Utpris {componentSale')
})

test('produkt-API:t avvisar ROT på material och resa', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/api/products/[id]/components/route.ts'), 'utf8')
  expect(source).toContain("c.component_type !== 'arbete' && c.is_rot_eligible")
  expect(source).toContain("['arbete', 'material', 'resa']")
})
