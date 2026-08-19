// tests/facit-fortnox-supplier-invoice-fetch.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/fortnox.ts'),
  'utf8',
)

test.describe('getFortnoxSupplierInvoices', () => {
  test('funktionen finns och exporteras', () => {
    expect(FILE).toMatch(/export async function getFortnoxSupplierInvoices/)
  })

  test('anropar /supplierinvoices, inte /invoices', () => {
    const idx = FILE.indexOf('export async function getFortnoxSupplierInvoices')
    const block = FILE.slice(idx, idx + 1500)
    expect(block).toMatch(/\/supplierinvoices/)
    expect(block).not.toMatch(/'\/invoices/)
  })

  test('återanvänder fortnoxRequest (token-refresh + audit-logg), skriver inte ett eget fetch-anrop', () => {
    const idx = FILE.indexOf('export async function getFortnoxSupplierInvoices')
    const block = FILE.slice(idx, idx + 1500)
    expect(block).toContain('fortnoxRequest')
  })
})
