/**
 * Facit: Handymates frivilliga artikelbibliotek kontra företagets egna bank.
 * Körs browserlöst:
 *   npx playwright test tests/product-catalog.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  getProductCatalog,
  getSeededBranches,
  getStarterProducts,
} from '../lib/product-defaults'

const ROOT = path.resolve(__dirname, '..')
const source = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test.describe('kompakt startbank — automatiken skapar aldrig katalogbrus', () => {
  test('varje bransch får exakt en egen timartikel plus tre prislösa allmänna rader', () => {
    for (const branch of getSeededBranches()) {
      const starter = getStarterProducts(branch)
      expect(starter, branch).toHaveLength(4)
      expect(starter.filter(product => product.sku.startsWith('HM-GEN-'))).toHaveLength(3)
      expect(starter.filter(product => product.unit_price > 0), branch).toHaveLength(0)
      expect(starter.filter(product => product.sku.startsWith('HM-GEN-')).every(product => product.unit_price === 0)).toBe(true)
    }
  })

  test('långsvansen finns kvar i biblioteket men aldrig i automatisk seed', () => {
    const catalog = getProductCatalog('electrician')
    const starter = getStarterProducts('electrician')
    expect(catalog.length).toBeGreaterThan(starter.length)
    expect(catalog.some(product => product.name === 'Drivdon för LED')).toBe(true)
    expect(starter.some(product => product.name === 'Drivdon för LED')).toBe(false)
  })

  test('flera branscher ger en timartikel per bransch men bara en uppsättning allmänna rader', () => {
    const starter = getStarterProducts(['electrician', 'plumber'])
    expect(starter.some(product => product.sku === 'HM-EL-001')).toBe(true)
    expect(starter.some(product => product.sku === 'HM-VVS-001')).toBe(true)
    expect(starter.filter(product => product.sku === 'HM-GEN-901')).toHaveLength(1)
    expect(starter).toHaveLength(5)
  })
})

test.describe('katalog-API — tenant-säkert och utan gissade priser', () => {
  const route = source('app/api/product-catalog/route.ts')

  test('GET är dynamisk och autentiserad', () => {
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('getAuthenticatedBusiness(request)')
    expect(route).toContain(".eq('business_id', businessId)")
  })

  test('biblioteket begränsas till företagets branscher och okända sku avvisas', () => {
    expect(route).toContain('resolveBranches(config || {})')
    expect(route).toContain('getProductCatalog(branches)')
    expect(route).toContain('!allowedBySku.has(sku)')
    expect(route).toContain('{ status: 400 }')
  })

  test('importen skriver alltid osatt pris — aldrig katalogens historiska pris', () => {
    expect(route).toContain('sales_price: 0')
    expect(route).not.toMatch(/sales_price:\s*product\.unit_price/)
    const publicRow = route.slice(route.indexOf('function publicCatalogRow'), route.indexOf('/**\n * GET'))
    expect(publicRow).not.toContain('unit_price:')
  })

  test('befintlig artikel känns igen på både sku och namn+enhet', () => {
    expect(route).toContain('importedSkus.has(product.sku)')
    expect(route).toContain('importedNames.has')
  })
})

test('produktbanken visar biblioteket som ett frivilligt val', () => {
  const page = source('app/dashboard/settings/products/page.tsx')
  const modal = source('app/dashboard/settings/products/components/ProductCatalogModal.tsx')
  expect(page).toContain('Handymate-biblioteket')
  expect(page).toContain('<ProductCatalogModal')
  expect(modal).toContain('Välj bara det ni använder')
  expect(modal).toContain('utan pris')
  expect(modal).toContain('Lägg till i min artikelbank')
})
