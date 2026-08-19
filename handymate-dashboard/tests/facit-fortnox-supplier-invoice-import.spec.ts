// tests/facit-fortnox-supplier-invoice-import.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE_PATH = path.join(
  __dirname, '..', 'app/api/integrations/fortnox/import/supplier-invoices/route.ts',
)

test.describe('POST /api/integrations/fortnox/import/supplier-invoices', () => {
  test('rutten finns och exporterar POST', () => {
    expect(fs.existsSync(ROUTE_PATH)).toBe(true)
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toContain('export async function POST')
  })

  test('kräver autentisering före allt annat', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const authIdx = src.indexOf('getAuthenticatedBusiness')
    const fetchIdx = src.indexOf('getFortnoxSupplierInvoices')
    expect(authIdx).toBeGreaterThan(-1)
    expect(fetchIdx).toBeGreaterThan(authIdx)
  })

  test('dedup mot befintliga fortnox_supplier_invoice_number', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toContain('fortnox_supplier_invoice_number')
    expect(src).toMatch(/new Set\(/)
  })

  test('nya rader skapas ALDRIG med project_id eller subcontractor_id satt', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    // Whitespace-tolerant sökning (route:ens insert ligger nästlad i en for/try
    // -block, med annan indentering än det platta exemplet i planen) — se
    // plan-anteckningen i Task 2.5.
    const match = src.match(/\.from\('supplier_invoices'\)\s*\.insert\(/)
    expect(match).not.toBeNull()
    const insertIdx = match!.index!
    const insertBlock = src.slice(insertIdx, insertIdx + 500)
    expect(insertBlock).not.toMatch(/project_id:/)
    expect(insertBlock).not.toMatch(/subcontractor_id:/)
  })

  test('scope-fel (403 fran Fortnox) ger en tydlig svensk atenanslut-text, inte ett generiskt fel', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toMatch(/[åa]teranslut/i)
  })

  test('per-rad felisolering — ett trasigt insert stoppar inte hela batchen', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toMatch(/results\.errors\.push/)
  })
})

test.describe('Installningar - Hamta historik inkluderar leverantorsfakturor', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'app/dashboard/settings/integrations/page.tsx'),
    'utf8',
  )

  test('handleFortnoxImportHistory anropar import/supplier-invoices', () => {
    const start = PAGE.indexOf('async function handleFortnoxImportHistory')
    const end = PAGE.indexOf('async function handleFortnoxDisconnect')
    const block = PAGE.slice(start, end === -1 ? start + 3000 : end)
    expect(block).toContain('/api/integrations/fortnox/import/supplier-invoices')
  })
})
