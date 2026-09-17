/**
 * Facit för den delade quote→invoice-mapparen (Prisslingan V2 etapp A1).
 *
 * Låser reglerna som tidigare drev isär i tre parallella mappare:
 * tillvalsfiltret, ??-semantiken för labor_amount, bevarad produktkoppling
 * och att bara 'item'-rader får sin total omräknad.
 */
import { test, expect } from '@playwright/test'
import {
  mapQuoteItemsToInvoiceItems,
  rotRutLaborBasis,
} from '../lib/invoices/quote-to-invoice-items'

test.describe('mapQuoteItemsToInvoiceItems', () => {
  test('ovalda tillval exkluderas, valda blir item', () => {
    const rows = mapQuoteItemsToInvoiceItems([
      { item_type: 'option', option_selected: false, description: 'Bortvalt', quantity: 1, unit_price: 100 },
      { item_type: 'option', option_selected: true, description: 'Valt', quantity: 2, unit_price: 500 },
      { item_type: 'item', description: 'Vanlig', quantity: 1, unit_price: 100 },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].description).toBe('Valt')
    expect(rows[0].item_type).toBe('item')
    expect(rows[0].total).toBe(1000)
  })

  test('labor_amount 0 bevaras som 0 (?? — aldrig ||)', () => {
    const rows = mapQuoteItemsToInvoiceItems([
      { item_type: 'item', description: 'Material', quantity: 1, unit_price: 8000, labor_amount: 0, is_rot_eligible: true },
    ])
    expect(rows[0].labor_amount).toBe(0)
  })

  test('labor_amount saknas → null (inte radtotal, inte undefined)', () => {
    const rows = mapQuoteItemsToInvoiceItems([
      { item_type: 'item', description: 'Gammal rad', quantity: 2, unit_price: 100 },
    ])
    expect(rows[0].labor_amount).toBeNull()
  })

  test('linked_product_id + article_number + cost_price + group_name följer med', () => {
    const rows = mapQuoteItemsToInvoiceItems([
      {
        item_type: 'item', description: 'Eluttag', quantity: 3, unit_price: 850,
        linked_product_id: 'prod_x_1', article_number: 'HM-EL-001',
        cost_price: 400, group_name: 'El', labor_amount: 1200,
      },
    ])
    expect(rows[0].linked_product_id).toBe('prod_x_1')
    expect(rows[0].article_number).toBe('HM-EL-001')
    expect(rows[0].cost_price).toBe(400)
    expect(rows[0].group_name).toBe('El')
    expect(rows[0].labor_amount).toBe(1200)
  })

  test('bara item-rader räknas om — delsumma och rabatt behåller lagrad total', () => {
    const rows = mapQuoteItemsToInvoiceItems([
      { item_type: 'subtotal', description: 'Delsumma', quantity: 0, unit_price: 0, total: 5000 },
      { item_type: 'discount', description: 'Rabatt', quantity: 1, unit_price: 500, total: -500 },
      { item_type: 'item', description: 'Rad', quantity: 4, unit_price: 250, total: 999 },
    ])
    expect(rows[0].total).toBe(5000)
    expect(rows[1].total).toBe(-500)
    expect(rows[2].total).toBe(1000) // omräknad, litar inte på lagrad
  })

  test('legacy-JSONB (name/price) mappas', () => {
    const rows = mapQuoteItemsToInvoiceItems([
      { name: 'Gammalt namn', price: 300, quantity: 2 },
    ])
    expect(rows[0].description).toBe('Gammalt namn')
    expect(rows[0].unit_price).toBe(300)
    expect(rows[0].total).toBe(600)
  })
})

test.describe('rotRutLaborBasis', () => {
  test('labor_amount ?? radtotal per berättigad rad', () => {
    const items = [
      // labor_amount satt: 40% av 10 000
      { item_type: 'item', quantity: 1, unit_price: 10000, labor_amount: 4000, is_rot_eligible: true },
      // labor_amount saknas: hela radtotalen
      { item_type: 'item', quantity: 2, unit_price: 500, labor_amount: null, is_rot_eligible: true },
      // labor_amount 0: ren material, bas 0
      { item_type: 'item', quantity: 1, unit_price: 8000, labor_amount: 0, is_rot_eligible: true },
      // ej berättigad: räknas inte
      { item_type: 'item', quantity: 1, unit_price: 9999, labor_amount: null, is_rot_eligible: false },
    ]
    expect(rotRutLaborBasis(items as any, 'rot')).toBe(5000)
  })

  test('rut använder is_rut_eligible, inte is_rot_eligible', () => {
    const items = [
      { item_type: 'item', quantity: 1, unit_price: 1000, labor_amount: null, is_rot_eligible: true, is_rut_eligible: false },
      { item_type: 'item', quantity: 1, unit_price: 2000, labor_amount: null, is_rot_eligible: false, is_rut_eligible: true },
    ]
    expect(rotRutLaborBasis(items as any, 'rut')).toBe(2000)
  })

  test('rabatt-/rubrik-/delsummerader räknas aldrig', () => {
    const items = [
      { item_type: 'discount', quantity: 1, unit_price: 500, labor_amount: null, is_rot_eligible: true },
      { item_type: 'heading', quantity: 0, unit_price: 0, labor_amount: null, is_rot_eligible: true },
      { item_type: 'subtotal', quantity: 0, unit_price: 0, labor_amount: 4000, is_rot_eligible: true },
    ]
    expect(rotRutLaborBasis(items as any, 'rot')).toBe(0)
  })

  test('tom lista → 0', () => {
    expect(rotRutLaborBasis([], 'rot')).toBe(0)
  })
})

/**
 * Dolda rader (2026-09-17). `is_hidden` betyder "kunden ser inte raden, men
 * priset ingår i summan oförändrat" (lib/types/quote.ts, beslut Andreas
 * 2026-08-05). Raden SKA alltså faktureras — men den ska inte plötsligt bli
 * synlig för kunden på fakturan. Mapparen tappade flaggan helt, så en rad
 * hantverkaren dolt i offerten dök upp som en vanlig rad på fakturan.
 */
test.describe('dolda rader behåller sin doldhet hela vägen', () => {
  const rader = () => [
    { item_type: 'item', description: 'Kakel', quantity: 10, unit_price: 400 },
    { item_type: 'item', description: 'Marginal', quantity: 1, unit_price: 5000, is_hidden: true },
  ]

  test('raden följer med till fakturan — den ska betalas', () => {
    const faktura = mapQuoteItemsToInvoiceItems(rader())
    expect(faktura.map(r => r.description), 'båda raderna faktureras').toEqual(['Kakel', 'Marginal'])
    expect(faktura.reduce((s, r) => s + r.total, 0), 'summan är oförändrad').toBe(9000)
  })

  test('men den bär sin doldhet, så kundens fakturadokument kan utelämna den', () => {
    const faktura = mapQuoteItemsToInvoiceItems(rader())
    expect(faktura[0].is_hidden).toBe(false)
    expect(faktura[1].is_hidden).toBe(true)
  })

  test('mallarna filtrerar på flaggan, precis som offertmallarna gör', () => {
    const fs = require('fs'), path = require('path')
    const ROOT = path.resolve(__dirname, '..')
    for (const fil of ['lib/invoice-templates/friendly.ts', 'lib/invoice-templates/premium.ts']) {
      expect(fs.readFileSync(path.join(ROOT, fil), 'utf8'), `${fil} ska utelämna dolda rader`)
        .toContain('data.invoice.items.filter(item => !item.isHidden)')
    }
    expect(fs.readFileSync(path.join(ROOT, 'lib/invoice-templates/data-builder.ts'), 'utf8'))
      .toContain('isHidden: i.is_hidden === true,')
  })
})

/**
 * Jobbtypen på fakturan (2026-09-17, sql/v255). Härledningen bor i kärnan,
 * inte i de åtta vägar som skapar fakturor — åtta kopior driftar isär.
 */
test.describe('jobbtypen når fakturan', () => {
  test('kärnan härleder den ur offerten först, projektet sedan', () => {
    const fs = require('fs'), path = require('path')
    const kod = fs.readFileSync(path.resolve(__dirname, '..', 'lib/invoices/create-invoice.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(kod).toContain('async function resolveJobType')
    expect(kod).toContain('job_type: jobType,')
    const kropp = kod.slice(kod.indexOf('async function resolveJobType'), kod.indexOf('export interface CreateInvoiceInput'))
    expect(kropp.indexOf("from('quotes')"), 'offerten läses').toBeGreaterThan(-1)
    expect(kropp.indexOf("from('project')"), 'projektet läses efter offerten').toBeGreaterThan(kropp.indexOf("from('quotes')"))
    // Uppföljning får aldrig fälla en faktura.
    expect(kropp).toContain('catch (error)')
    expect(fs.readFileSync(path.resolve(__dirname, '..', 'sql/v255_invoice_job_type.sql'), 'utf8'))
      .toContain('ADD COLUMN IF NOT EXISTS job_type TEXT')
  })
})
