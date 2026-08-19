// tests/facit-supplier-invoice-subcontractor-link.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const PAGE = fs.readFileSync(
  path.join(__dirname, '..', 'app/dashboard/projects/[id]/page.tsx'),
  'utf8',
)

function modalBody(): string {
  const start = PAGE.indexOf('function SupplierInvoiceModal(')
  const end = PAGE.indexOf('\nfunction ', start + 10)
  return PAGE.slice(start, end === -1 ? undefined : end)
}

test.describe('SupplierInvoiceModal — underentreprenor-koppling', () => {
  test('modalen hämtar subcontractors och håller ett valt subcontractorId i state', () => {
    const body = modalBody()
    expect(body).toContain("useState")
    expect(body).toMatch(/subcontractorId/)
  })

  test('/api/subcontractors-anropet är fail-soft — ingen kastad throw vid 403 (feature-gated)', () => {
    const body = modalBody()
    const fetchIdx = body.indexOf("/api/subcontractors")
    expect(fetchIdx).toBeGreaterThan(-1)
    const around = body.slice(fetchIdx, fetchIdx + 400)
    expect(around).toMatch(/catch/)
  })

  test('sparningen skickar subcontractor_id i PATCH/POST-payloaden', () => {
    const body = modalBody()
    expect(body).toMatch(/subcontractor_id:\s*subcontractorId/)
  })
})
