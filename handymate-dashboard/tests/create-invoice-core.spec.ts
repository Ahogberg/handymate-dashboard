/**
 * Facit-tester för lib/invoices/create-invoice.ts:s REN-funktioner —
 * ETAPP 6a (offert-masterplan.md, faktura-sprinten). Mockar INTE Supabase
 * (per instruktion) — testar bara det som är rent: nummerformat,
 * dueDate-beräkning, OCR-koppling. Den async createInvoice()-funktionen
 * (RPC + fallback + insert) verifieras istället manuellt av Andreas mot
 * en riktig faktura, samma disciplin som resten av fakturaflödet.
 *
 * Körs: npx playwright test tests/create-invoice-core.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { formatInvoiceNumber, computeInvoiceOcr, computeDueDate } from '../lib/invoices/create-invoice'
import { generateOCR, validateOCR } from '../lib/ocr'

test.describe('formatInvoiceNumber — samma format som alla åtta vägarna byggde för hand', () => {
  test('prefix-år-löpnummer, 3-siffrigt zero-padded', () => {
    expect(formatInvoiceNumber('FV', 2026, 42)).toBe('FV-2026-042')
  })
  test('löpnummer under 100 paddas till 3 siffror', () => {
    expect(formatInvoiceNumber('FV', 2026, 1)).toBe('FV-2026-001')
  })
  test('löpnummer över 999 utökar bredden istället för att klippa (padStart, inte substr)', () => {
    expect(formatInvoiceNumber('FV', 2026, 1234)).toBe('FV-2026-1234')
  })
  test('annat prefix (business-specifikt) respekteras rakt av', () => {
    expect(formatInvoiceNumber('SIXSAX', 2026, 7)).toBe('SIXSAX-2026-007')
  })
})

test.describe('computeInvoiceOcr — OCR länkas till LÖPNUMRET, inte hela invoice_number-strängen', () => {
  test('samma resultat som generateOCR(String(num)) — den etablerade konventionen', () => {
    expect(computeInvoiceOcr(42)).toBe(generateOCR('42'))
  })
  test('producerar en giltig Luhn mod 10-checksumma (svensk OCR-standard)', () => {
    expect(validateOCR(computeInvoiceOcr(42))).toBe(true)
    expect(validateOCR(computeInvoiceOcr(1))).toBe(true)
    expect(validateOCR(computeInvoiceOcr(999999))).toBe(true)
  })
})

test.describe('computeDueDate — ren datumaritmetik, samma mönster som alla åtta vägarna', () => {
  test('30 dagar netto (standardvillkor)', () => {
    const invoiceDate = new Date('2026-08-04T00:00:00.000Z')
    const due = computeDueDate(invoiceDate, 30)
    expect(due.toISOString().split('T')[0]).toBe('2026-09-03')
  })
  test('0 dagar (kreditfaktura — förfaller samma dag som den skapas)', () => {
    const invoiceDate = new Date('2026-08-04T00:00:00.000Z')
    const due = computeDueDate(invoiceDate, 0)
    expect(due.toISOString().split('T')[0]).toBe('2026-08-04')
  })
  test('månadsskifte hanteras korrekt (inte "31 februari")', () => {
    const invoiceDate = new Date('2026-01-20T00:00:00.000Z')
    const due = computeDueDate(invoiceDate, 15)
    expect(due.toISOString().split('T')[0]).toBe('2026-02-04')
  })
  test('mutation-fri — den ursprungliga invoiceDate-instansen rörs inte', () => {
    const invoiceDate = new Date('2026-08-04T00:00:00.000Z')
    const before = invoiceDate.toISOString()
    computeDueDate(invoiceDate, 30)
    expect(invoiceDate.toISOString()).toBe(before)
  })
})
