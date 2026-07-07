/**
 * Produktbank — enhetstester för snapshot-byggaren (rena funktioner).
 * Körs: npx playwright test tests/product-snapshot.spec.ts --no-deps
 *
 * Facit ur tasks/produktbank-spec.md (Fasadmålning):
 *   arbete 0.13 tim/kvm à 550 = 71.50 · grundfärg 0.1 l à 89 = 8.90 ·
 *   täckfärg 0.15 l à 105 = 15.75 → kalkylkostnad/kvm 96.15,
 *   arbetsandel 71.5/96.15 ≈ 0.7436. 120 kvm × 450 = 54 000 →
 *   labor_amount 40 156.01, material_amount 13 843.99, 15.6 tim.
 */
import { test, expect } from '@playwright/test'
import {
  resolveLaborShare,
  splitAmount,
  estimateHours,
  buildItemSnapshot,
  type SnapshotComponent,
  type SnapshotProduct,
} from '../lib/products/build-item-snapshot'

const fasadComponents: SnapshotComponent[] = [
  { component_type: 'arbete', description: 'Målningsarbete', quantity_per_unit: 0.13, unit: 'tim', unit_cost: 550 },
  { component_type: 'material', description: 'Grundfärg', quantity_per_unit: 0.1, unit: 'l', unit_cost: 89 },
  { component_type: 'material', description: 'Täckfärg', quantity_per_unit: 0.15, unit: 'l', unit_cost: 105 },
]

test.describe('resolveLaborShare', () => {
  test('komponentderivering: 71.5/96.15 ≈ 0.7436 (spec-fallet)', () => {
    const share = resolveLaborShare(fasadComponents, null)
    expect(share).toBeCloseTo(71.5 / 96.15, 10)
    expect(share).toBeCloseTo(0.7436, 3)
  })
  test('tom komponentlista + default 0.6 → 0.6', () => {
    expect(resolveLaborShare([], 0.6)).toBe(0.6)
  })
  test('default 0 → 0, INTE null (??-vs-||-fällan — ren material är giltig)', () => {
    expect(resolveLaborShare([], 0)).toBe(0)
  })
  test('undefined default utan komponenter → null (legacy, ingen split)', () => {
    expect(resolveLaborShare([], undefined)).toBeNull()
    expect(resolveLaborShare([], null)).toBeNull()
  })
  test('totalCost 0 (komponenter utan kostnad) → fallback till default', () => {
    const freeComponents: SnapshotComponent[] = [
      { component_type: 'arbete', description: 'Arbete', quantity_per_unit: 1, unit: 'tim', unit_cost: 0 },
    ]
    expect(resolveLaborShare(freeComponents, 0.5)).toBe(0.5)
    expect(resolveLaborShare(freeComponents, 0)).toBe(0)
    expect(resolveLaborShare(freeComponents, undefined)).toBeNull()
  })
})

test.describe('splitAmount', () => {
  test('andel 1/3 på 999.99 → labor + material === total EXAKT', () => {
    const { labor_amount, material_amount } = splitAmount(999.99, 1 / 3)
    expect(labor_amount).toBe(333.33)
    expect(material_amount).toBe(666.66)
    expect(labor_amount! + material_amount!).toBe(999.99)
  })
  test('share 0 → labor_amount === 0 (inte null) och material === total', () => {
    const { labor_amount, material_amount } = splitAmount(5000, 0)
    expect(labor_amount).toBe(0)
    expect(material_amount).toBe(5000)
  })
  test('share null → båda null (legacy, ingen split)', () => {
    const { labor_amount, material_amount } = splitAmount(5000, null)
    expect(labor_amount).toBeNull()
    expect(material_amount).toBeNull()
  })
  test('share 1 → allt arbete', () => {
    const { labor_amount, material_amount } = splitAmount(1234.56, 1)
    expect(labor_amount).toBe(1234.56)
    expect(material_amount).toBe(0)
  })
})

test.describe('estimateHours', () => {
  test('120 kvm × 0.13 tim/kvm = 15.6', () => {
    expect(estimateHours(fasadComponents, 120)).toBeCloseTo(15.6, 10)
  })
  test('inga arbetskomponenter → null (ingen uppskattning, inte 0)', () => {
    const materialOnly: SnapshotComponent[] = [
      { component_type: 'material', description: 'Färg', quantity_per_unit: 0.2, unit: 'l', unit_cost: 100 },
    ]
    expect(estimateHours(materialOnly, 120)).toBeNull()
    expect(estimateHours([], 120)).toBeNull()
  })
})

test.describe('buildItemSnapshot — Fasadmålning end-to-end', () => {
  const product: SnapshotProduct = {
    id: 'prod_fasad',
    name: 'Fasadmålning',
    sku: 'FM-450',
    sales_price: 450,
    default_labor_share: null,
  }

  test('120 kvm × 450 = 54 000 → split 40 156.01 / 13 843.99 + 15.6 tim', () => {
    const result = buildItemSnapshot(product, fasadComponents, 120, 54000)
    expect(result.labor_amount).toBe(Math.round(54000 * (71.5 / 96.15) * 100) / 100)
    expect(result.labor_amount).toBe(40156.01)
    expect(result.material_amount).toBe(13843.99)
    expect(result.labor_amount! + result.material_amount!).toBe(54000)
    expect(result.estimated_hours).toBeCloseTo(15.6, 10)
    expect(result.labor_share).toBeCloseTo(71.5 / 96.15, 10)
  })

  test('component_snapshot fryser produkt + komponenter + labor_share', () => {
    const result = buildItemSnapshot(product, fasadComponents, 120, 54000)
    expect(result.component_snapshot).not.toBeNull()
    expect(result.component_snapshot!.product_id).toBe('prod_fasad')
    expect(result.component_snapshot!.product_name).toBe('Fasadmålning')
    expect(result.component_snapshot!.sku).toBe('FM-450')
    expect(result.component_snapshot!.sales_price).toBe(450)
    expect(result.component_snapshot!.components).toHaveLength(3)
    // labor_share i snapshoten → mängdändring räknar om spliten utan API
    expect(result.component_snapshot!.labor_share).toBeCloseTo(71.5 / 96.15, 10)
  })

  test('enkel produkt utan komponenter: default_labor_share 0 → labor_amount 0', () => {
    const materialProduct: SnapshotProduct = {
      id: 'prod_mtrl', name: 'Kakel', sku: null, sales_price: 300, default_labor_share: 0,
    }
    const result = buildItemSnapshot(materialProduct, [], 10, 3000)
    expect(result.labor_share).toBe(0)
    expect(result.labor_amount).toBe(0)
    expect(result.material_amount).toBe(3000)
    expect(result.estimated_hours).toBeNull()
  })

  test('enkel produkt utan komponenter och utan default → ingen split (legacy)', () => {
    const legacyProduct: SnapshotProduct = {
      id: 'prod_leg', name: 'Övrigt', sku: null, sales_price: 100, default_labor_share: null,
    }
    const result = buildItemSnapshot(legacyProduct, [], 1, 100)
    expect(result.labor_share).toBeNull()
    expect(result.labor_amount).toBeNull()
    expect(result.material_amount).toBeNull()
  })
})
