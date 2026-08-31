/**
 * Facit för Fortnox-radbyggaren (Prisslingan V2 etapp A3).
 * Låser: VAT-arv per rad, negativa rabattrader, delsummor bort,
 * rubrik/text som textrader, ArticleNumber utelämnad (fasad), husarbetsfält.
 */
import { test, expect } from '@playwright/test'
import { buildFortnoxInvoiceRows, mapFortnoxUnit } from '../lib/invoices/fortnox-rows'

test.describe('buildFortnoxInvoiceRows', () => {
  test('rabattrad får NEGATIVT pris', () => {
    const rows = buildFortnoxInvoiceRows([
      { item_type: 'discount', description: 'Rabatt', quantity: 1, unit_price: 500 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].Price).toBe(-500)
  })

  test('VAT: radens vat_rate vinner, sedan fakturans, sist 25', () => {
    const rows = buildFortnoxInvoiceRows(
      [
        { item_type: 'item', description: 'Avgift', quantity: 1, unit_price: 60, vat_rate: 0 },
        { item_type: 'item', description: 'Arbete', quantity: 1, unit_price: 1000 },
      ],
      { invoiceVatRate: 12 },
    )
    expect(rows[0].VAT).toBe(0)
    expect(rows[1].VAT).toBe(12)

    const utanFaktura = buildFortnoxInvoiceRows([
      { item_type: 'item', description: 'X', quantity: 1, unit_price: 1 },
    ])
    expect(utanFaktura[0].VAT).toBe(25)
  })

  test('delsummor skickas ALDRIG; rubrik blir textrad utan pris', () => {
    const rows = buildFortnoxInvoiceRows([
      { item_type: 'heading', description: 'El-arbeten' },
      { item_type: 'subtotal', description: 'Delsumma', unit_price: 0 },
      { item_type: 'item', description: 'Uttag', quantity: 2, unit_price: 850 },
      { item_type: 'text', description: '' },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].Description).toBe('El-arbeten')
    expect(rows[0].Price).toBeUndefined()
    expect(rows[0].DeliveredQuantity).toBeUndefined()
    expect(rows[1].Price).toBe(850)
  })

  test('ArticleNumber sätts aldrig (fasad utrullning)', () => {
    const rows = buildFortnoxInvoiceRows([
      { item_type: 'item', description: 'Uttag', quantity: 1, unit_price: 850, ...( { article_number: 'HM-EL-001' } as any) },
    ])
    expect(rows[0].ArticleNumber).toBeUndefined()
  })

  test('påminnelserad utan description använder name', () => {
    const rows = buildFortnoxInvoiceRows([
      { item_type: 'item', name: 'Påminnelseavgift (påminnelse 2)', quantity: 1, unit_price: 60, vat_rate: 0 } as any,
    ])
    expect(rows[0].Description).toBe('Påminnelseavgift (påminnelse 2)')
    expect(rows[0].VAT).toBe(0)
  })

  test('husarbete: fält på varje rad, HouseWork=true bara på berättigat arbete', () => {
    const rows = buildFortnoxInvoiceRows(
      [
        { item_type: 'item', description: 'Arbete', quantity: 4, unit: 'tim', unit_price: 850, is_rot_eligible: true },
        { item_type: 'item', description: 'Material', quantity: 1, unit_price: 2000, is_rot_eligible: false },
      ],
      { houseWork: { rotType: 'rot', houseWorkType: 'ELECTRICITY' } },
    )
    expect(rows[0].HouseWork).toBe(true)
    expect(rows[0].HouseWorkType).toBe('ELECTRICITY')
    expect(rows[0].HouseWorkHoursToReport).toBe(4)
    expect(rows[1].HouseWork).toBe(false)
    expect(rows[1].HouseWorkType).toBe('ELECTRICITY')
  })
})

test.describe('mapFortnoxUnit', () => {
  test('kända enheter mappas, okända utelämnas', () => {
    expect(mapFortnoxUnit('tim')).toBe('h')
    expect(mapFortnoxUnit('kvm')).toBe('m2')
    expect(mapFortnoxUnit('paket')).toBeUndefined()
    expect(mapFortnoxUnit(undefined)).toBeUndefined()
  })
})
