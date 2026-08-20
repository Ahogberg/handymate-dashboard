import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/invoices/send-invoice.ts'),
  'utf8',
)

test.describe('sendInvoice — Fortnox fore kund', () => {
  test('importerar syncInvoiceToFortnox', () => {
    expect(FILE).toContain("from '@/lib/invoices/sync-to-fortnox'")
  })

  test('Fortnox-synken anropas FORE email-forsoket', () => {
    const fortnoxIdx = FILE.indexOf('syncInvoiceToFortnox(')
    const emailIdx = FILE.indexOf('resend.emails.send')
    expect(fortnoxIdx).toBeGreaterThan(-1)
    expect(emailIdx).toBeGreaterThan(-1)
    expect(fortnoxIdx).toBeLessThan(emailIdx)
  })

  test('Fortnox-fel blockerar kundutskick helt (return innan email/sms-blocket)', () => {
    const fortnoxIdx = FILE.indexOf('syncInvoiceToFortnox(')
    const block = FILE.slice(fortnoxIdx, fortnoxIdx + 800)
    expect(block).toMatch(/return\s*\{\s*found:\s*true/)
  })

  test('delivery_status satts till delivery_failed vid misslyckad kundleverans efter lyckad Fortnox-synk', () => {
    expect(FILE).toContain("delivery_status: 'delivery_failed'")
  })

  test('delivery_status satts till delivered vid lyckad leverans', () => {
    expect(FILE).toContain("delivery_status: 'delivered'")
  })

  test('nummer-unifiering: patchar den redan hamtade in-memory-fakturan med Fortnox nya nummer INNAN PDF/mejl/SMS byggs', () => {
    const fortnoxIdx = FILE.indexOf('syncInvoiceToFortnox(')
    const patchIdx = FILE.indexOf('invoice.invoice_number = fortnoxResult.newInvoiceNumber', fortnoxIdx)
    const pdfBuildIdx = FILE.indexOf('buildInvoicePdfBuffer', fortnoxIdx)
    expect(patchIdx).toBeGreaterThan(fortnoxIdx)
    expect(patchIdx).toBeLessThan(pdfBuildIdx)
  })

  test('patchen ar villkorad pa newInvoiceNumber — paverkar inte foretag utan Fortnox', () => {
    const idx = FILE.indexOf('invoice.invoice_number = fortnoxResult.newInvoiceNumber')
    const before = FILE.slice(Math.max(0, idx - 100), idx)
    expect(before).toMatch(/if\s*\(fortnoxResult\.newInvoiceNumber\)/)
  })
})
