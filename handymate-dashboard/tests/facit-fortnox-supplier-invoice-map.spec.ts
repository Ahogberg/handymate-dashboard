// tests/facit-fortnox-supplier-invoice-map.spec.ts
import { test, expect } from '@playwright/test'
import { mapFortnoxSupplierInvoice, resolveSupplierDocNumber } from '../lib/fortnox/map-supplier-invoice'
import type { FortnoxSupplierInvoiceListItem } from '../lib/fortnox'

const TODAY = '2026-08-20'

test.describe('mapFortnoxSupplierInvoice', () => {
  test('saknat dokumentnummer → null (skip)', () => {
    const fi: FortnoxSupplierInvoiceListItem = { Total: 1000 }
    expect(mapFortnoxSupplierInvoice(fi, TODAY)).toBeNull()
    expect(resolveSupplierDocNumber(fi)).toBeNull()
  })

  test('obetald, ej förfallen → status sent', () => {
    const fi: FortnoxSupplierInvoiceListItem = {
      GivenNumber: 'SI-1', Total: 5000, Balance: 5000, DueDate: '2026-09-01',
    }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.status).toBe('unpaid')
  })

  test('förfallodatum passerat, obetald → status overdue', () => {
    const fi: FortnoxSupplierInvoiceListItem = {
      GivenNumber: 'SI-2', Total: 5000, Balance: 5000, DueDate: '2026-08-01',
    }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.status).toBe('overdue')
  })

  test('Balance 0 → status paid oavsett förfallodatum', () => {
    const fi: FortnoxSupplierInvoiceListItem = {
      GivenNumber: 'SI-3', Total: 5000, Balance: 0, DueDate: '2026-01-01',
    }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.status).toBe('paid')
  })

  test('dokumentnumret hamnar i fortnox_supplier_invoice_number', () => {
    const fi: FortnoxSupplierInvoiceListItem = { GivenNumber: 'SI-4', Total: 100, Balance: 100 }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.fortnox_supplier_invoice_number).toBe('SI-4')
  })

  test('SupplierNumber hamnar i fortnox_supplier_number, SupplierName i supplier_name', () => {
    const fi: FortnoxSupplierInvoiceListItem = {
      GivenNumber: 'SI-5', Total: 100, Balance: 100,
      SupplierNumber: '42', SupplierName: 'Bauhaus AB',
    }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.fortnox_supplier_number).toBe('42')
    expect(mapped?.row.supplier_name).toBe('Bauhaus AB')
  })

  test('saknat SupplierName → fallback "Okänd leverantör" (aldrig tom sträng i UI)', () => {
    const fi: FortnoxSupplierInvoiceListItem = { GivenNumber: 'SI-6', Total: 100, Balance: 100 }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.supplier_name).toBe('Okänd leverantör')
  })
})
