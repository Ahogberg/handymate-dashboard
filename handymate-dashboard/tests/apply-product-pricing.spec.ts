/**
 * Facit för UX1a + UX1f (Prisslingan V2).
 *
 * UX1a: applyProductToItem — en PRISLÖS bankartikel förfyller raden men
 * skriver ALDRIG över ett pris hantverkaren redan satt.
 * UX1f: applyHourlyRateToDefaults — onboardingens timpris läggs på seedade
 * timartiklar med bevarade relativa påslag; prislösa rörs aldrig.
 */
import { test, expect } from '@playwright/test'
import { applyProductToItem, type ProductWithComponents } from '../app/dashboard/quotes/_shared/applyProductToItem'
import { applyHourlyRateToDefaults, type ProductDefault } from '../lib/product-defaults'
import type { QuoteItem } from '../lib/types/quote'

const baseItem = (over: Partial<QuoteItem> = {}): QuoteItem => ({
  id: 'row1',
  item_type: 'item',
  description: '',
  quantity: 1,
  unit: 'st',
  unit_price: 0,
  total: 0,
  is_rot_eligible: false,
  is_rut_eligible: false,
  sort_order: 0,
  ...over,
} as QuoteItem)

const produkt = (over: Partial<ProductWithComponents> = {}): ProductWithComponents => ({
  id: 'prod1',
  name: 'Installation utomhusbelysning',
  unit: 'st',
  sales_price: 0,
  components: [],
  ...over,
})

test.describe('applyProductToItem — prislös artikel (UX1a)', () => {
  test('prislös artikel skriver INTE över radens pris', () => {
    const rad = applyProductToItem(baseItem({ unit_price: 850, total: 850 }), produkt({ sales_price: 0 }))
    expect(rad.unit_price).toBe(850)
    expect(rad.total).toBe(850)
    expect(rad.linked_product_id).toBe('prod1')
    expect(rad.description).toBe('Installation utomhusbelysning')
  })

  test('prissatt artikel skriver över radens pris (som förut)', () => {
    const rad = applyProductToItem(baseItem({ unit_price: 850 }), produkt({ sales_price: 1200 }))
    expect(rad.unit_price).toBe(1200)
    expect(rad.total).toBe(1200)
  })

  test('prislös artikel + tom rad → 0 (osatt, aldrig gissning)', () => {
    const rad = applyProductToItem(baseItem(), produkt({ sales_price: 0 }))
    expect(rad.unit_price).toBe(0)
  })
})

const seedRad = (over: Partial<ProductDefault>): ProductDefault => ({
  sku: 'HM-EL-001',
  name: 'Elinstallation',
  unit: 'tim',
  unit_price: 550,
  category: 'arbete',
  legacy_category: 'labor',
  labor_share: 1,
  deduction: 'rot',
  ...over,
})

test.describe('applyHourlyRateToDefaults (UX1f)', () => {
  const lista: ProductDefault[] = [
    seedRad({ sku: 'HM-EL-001', name: 'Elinstallation', unit_price: 550 }),
    seedRad({ sku: 'HM-EL-002', name: 'Felsökning', unit_price: 650 }),
    seedRad({ sku: 'HM-EL-003', name: 'Jour', unit_price: 950 }),
    seedRad({ sku: 'HM-EL-004', name: 'Lärling', unit_price: 0 }), // prislös
    seedRad({ sku: 'HM-EL-013', name: 'Installation vägguttag', unit: 'st', unit_price: 850, labor_share: 0.7 }),
  ]

  test('basen får timpriset, relativa påslag bevaras', () => {
    const r = applyHourlyRateToDefaults(lista, 900)
    expect(r[0].unit_price).toBe(900)       // bas 550 → 900
    expect(r[1].unit_price).toBe(1000)      // +100 bevaras
    expect(r[2].unit_price).toBe(1300)      // +400 bevaras
  })

  test('prislösa och icke-tim-artiklar rörs aldrig', () => {
    const r = applyHourlyRateToDefaults(lista, 900)
    expect(r[3].unit_price).toBe(0)
    expect(r[4].unit_price).toBe(850)
  })

  test('olika branscher har egna baser', () => {
    const tvåBranscher = [
      seedRad({ sku: 'HM-EL-001', unit_price: 550 }),
      seedRad({ sku: 'HM-BYG-001', name: 'Snickeri', unit_price: 500 }),
      seedRad({ sku: 'HM-BYG-002', name: 'Rivning', unit_price: 450 }),
    ]
    const r = applyHourlyRateToDefaults(tvåBranscher, 800)
    expect(r[0].unit_price).toBe(800)
    expect(r[1].unit_price).toBe(800)       // egen bas
    expect(r[2].unit_price).toBe(750)       // −50 bevaras
  })

  test('rate null/0 → identitet', () => {
    expect(applyHourlyRateToDefaults(lista, null)).toEqual(lista)
    expect(applyHourlyRateToDefaults(lista, 0)).toEqual(lista)
  })
})
