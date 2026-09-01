import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildJobTypeQuotePreview } from '../lib/quotes/job-type-preview'
import { toSetupTemplate } from '../lib/quotes/job-type-setup'

const ROOT = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

const template = toSetupTemplate({
  id: 'tpl_service', name: 'Standardservice', category: 'service', job_type_slug: 'service',
  default_items: [
    { item_type: 'item', description: 'Arbetstid', unit: 'tim', quantity: 4, unit_price: 650, linked_product_id: 'work' },
    { item_type: 'item', description: 'Framkörning', unit: 'st', quantity: 1, unit_price: 9999, linked_product_id: 'trip' },
    { item_type: 'option', description: 'Extra filter', unit: 'st', quantity: 1, unit_price: 9999, linked_product_id: 'filter' },
    { item_type: 'item', description: 'Dokumentation', unit: 'st', quantity: 1, unit_price: 700 },
  ],
})

const products = [
  { id: 'work', name: 'Servicearbete', unit: 'tim', salesPrice: 950 },
  { id: 'trip', name: 'Framkörning', unit: 'st', salesPrice: 495 },
  { id: 'filter', name: 'Filter', unit: 'st', salesPrice: null },
]

const reservations = [{
  id: 'res_access', title: 'Fri väg till arbetsplatsen', content: 'Fri väg förutsätts.',
  suggest_enabled: true, is_active: true, sort_order: 1,
  triggers: [
    { trigger_type: 'product' as const, product_id: 'trip' },
    { trigger_type: 'keyword' as const, keyword: 'framkörning' },
  ],
}]

test('previewn visar företagets riktiga priser och aldrig mallens gamla fröpriser eller totalsumma', () => {
  const preview = buildJobTypeQuotePreview(template, products, reservations)
  expect(preview.rows.map(row => row.unitPrice)).toEqual([950, 495, null, null])
  expect(JSON.stringify(preview)).not.toContain('9999')
  expect(preview).not.toHaveProperty('total')
  expect(preview.rows.every(row => !Object.prototype.hasOwnProperty.call(row, 'quantity'))).toBe(true)
})

test('previewn skiljer prislöst från okopplat och bevarar tillval', () => {
  const preview = buildJobTypeQuotePreview(template, products, reservations)
  expect(preview.rows[2]).toMatchObject({ itemType: 'option', status: 'price_missing', productName: 'Filter' })
  expect(preview.rows[3]).toMatchObject({ itemType: 'item', status: 'product_missing', productName: null })
})

test('previewn återanvänder reservationsmotorns dedupe och visar bara verkliga träffar', () => {
  const preview = buildJobTypeQuotePreview(template, products, reservations)
  expect(preview.reservations).toEqual([{
    id: 'res_access', title: 'Fri väg till arbetsplatsen', triggeredBy: ['Framkörning'],
  }])
})

test('aktiveringsytan är read-only bevis, inte en ny offertskrivare eller grind', () => {
  const setup = read('components/onboarding/JobTypeQuoteSetup.tsx')
  const preview = read('components/onboarding/JobTypeQuotePreview.tsx')
  expect(setup).toContain("'/api/reservations?include=triggers'")
  expect(setup).toContain('<JobTypeQuotePreview')
  expect(setup).toContain('3–5 återkommande nyckelartiklar')
  expect(preview).toContain('Inget skickas')
  expect(preview).toContain('Mängder och villkor granskar du i offerten')
  expect(preview).not.toMatch(/fetch\s*\(|\/api\/quotes|router\.|reduce\s*\(|total/i)
})

