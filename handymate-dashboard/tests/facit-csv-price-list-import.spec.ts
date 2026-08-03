/**
 * FACIT — CSV-import till produktbanken (P2, UX-revision 2026-08-03).
 * Körs: npx playwright test tests/facit-csv-price-list-import.spec.ts --no-deps
 *
 * Ren logik, ingen browser — samma mönster som tests/facit-produktbank.spec.ts.
 * Kedjar de riktiga lib-funktionerna (lib/csv/parse-price-list.ts) som
 * app/dashboard/settings/products/page.tsx CSV-import-flöde använder.
 */
import { test, expect } from '@playwright/test'
import {
  detectDelimiter,
  parseCsvText,
  autoDetectPriceListColumns,
  mapCsvRowsToPriceList,
} from '../lib/csv/parse-price-list'

test.describe('FACIT CSV-import — produktbanken', () => {
  test('detectDelimiter: semikolon-fil (svensk Excel-export)', () => {
    expect(detectDelimiter('Namn;Enhet;Pris\nFasadmålning;kvm;450')).toBe(';')
  })

  test('detectDelimiter: kommaseparerad fil', () => {
    expect(detectDelimiter('Namn,Enhet,Pris\nFasadmålning,kvm,450')).toBe(',')
  })

  test('parseCsvText: headers + rader, citattecken strippas, tomrader hoppas över', () => {
    const csv = 'Namn;Enhet;Pris\n"Fasadmålning";kvm;450\n\nGrundfärg;l;89\n'
    const { headers, rows } = parseCsvText(csv)
    expect(headers).toEqual(['Namn', 'Enhet', 'Pris'])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ Namn: 'Fasadmålning', Enhet: 'kvm', Pris: '450' })
    expect(rows[1]).toEqual({ Namn: 'Grundfärg', Enhet: 'l', Pris: '89' })
  })

  test('parseCsvText: bara header (ingen datarad) → tomt resultat, inte krasch', () => {
    expect(parseCsvText('Namn;Pris\n')).toEqual({ headers: [], rows: [] })
  })

  test('autoDetectPriceListColumns: svenska rubriker mappas rätt', () => {
    const mapping = autoDetectPriceListColumns(['Artikelnamn', 'Enhet', 'Försäljningspris', 'Kategori'])
    expect(mapping).toEqual({
      name: 'Artikelnamn',
      unit: 'Enhet',
      price: 'Försäljningspris',
      category: 'Kategori',
    })
  })

  test('autoDetectPriceListColumns: engelska rubriker mappas rätt', () => {
    const mapping = autoDetectPriceListColumns(['Product Name', 'Unit', 'Price', 'Category'])
    expect(mapping.name).toBe('Product Name')
    expect(mapping.unit).toBe('Unit')
    expect(mapping.price).toBe('Price')
    expect(mapping.category).toBe('Category')
  })

  test('autoDetectPriceListColumns: okänd kolumn mappas inte (undefined, inte krasch)', () => {
    const mapping = autoDetectPriceListColumns(['Kolumn A', 'Kolumn B'])
    expect(mapping.name).toBeUndefined()
    expect(mapping.price).toBeUndefined()
  })

  test('mapCsvRowsToPriceList: giltig rad med svenskt tal-format (komma, mellanslag)', () => {
    const { valid, errors } = mapCsvRowsToPriceList(
      [{ Namn: 'Fasadmålning', Enhet: 'kvm', Pris: '1 234,50' }],
      { name: 'Namn', unit: 'Enhet', price: 'Pris' },
    )
    expect(errors).toHaveLength(0)
    expect(valid).toEqual([{ name: 'Fasadmålning', unit: 'kvm', sales_price: 1234.5, category: undefined }])
  })

  test('mapCsvRowsToPriceList: saknat namn → fel, raden hoppas över (inte en tyst 0-produkt)', () => {
    const { valid, errors } = mapCsvRowsToPriceList(
      [{ Namn: '', Pris: '100' }],
      { name: 'Namn', price: 'Pris' },
    )
    expect(valid).toHaveLength(0)
    expect(errors).toEqual([{ rowIndex: 0, message: 'Rad 2: namn saknas' }])
  })

  test('mapCsvRowsToPriceList: ogiltigt pris → fel, raden hoppas över', () => {
    const { valid, errors } = mapCsvRowsToPriceList(
      [{ Namn: 'Skruv', Pris: 'gratis' }],
      { name: 'Namn', price: 'Pris' },
    )
    expect(valid).toHaveLength(0)
    expect(errors).toEqual([{ rowIndex: 0, message: 'Rad 2: ogiltigt pris "gratis"' }])
  })

  test('mapCsvRowsToPriceList: tomt pris → 0 kr (giltigt, ingen felrad)', () => {
    const { valid, errors } = mapCsvRowsToPriceList(
      [{ Namn: 'Framkörning', Pris: '' }],
      { name: 'Namn', price: 'Pris' },
    )
    expect(errors).toHaveLength(0)
    expect(valid).toEqual([{ name: 'Framkörning', unit: 'st', sales_price: 0, category: undefined }])
  })

  test('mapCsvRowsToPriceList: enhet default "st" när ej mappad', () => {
    const { valid } = mapCsvRowsToPriceList([{ Namn: 'Skruv', Pris: '5' }], { name: 'Namn', price: 'Pris' })
    expect(valid[0].unit).toBe('st')
  })

  test('mapCsvRowsToPriceList: kategori tas med när mappad', () => {
    const { valid } = mapCsvRowsToPriceList(
      [{ Namn: 'Grundfärg', Pris: '89', Kategori: 'Färg' }],
      { name: 'Namn', price: 'Pris', category: 'Kategori' },
    )
    expect(valid[0].category).toBe('Färg')
  })
})
