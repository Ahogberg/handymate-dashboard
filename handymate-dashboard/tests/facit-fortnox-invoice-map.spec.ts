/**
 * Facit — Fortnox-fakturamappning (lib/fortnox/map-invoice.ts).
 * Kör: npx playwright test tests/facit-fortnox-invoice-map.spec.ts --no-deps --workers=1
 *
 * Låser SÄKERHETSINVARIANTEN: importerade (historiska) fakturor får ALDRIG
 * trigga automatiska utskick → reminder_count = 0 och next_reminder_at
 * förekommer aldrig i payloaden. Plus status-/belopps-mappningen.
 */
import { test, expect } from '@playwright/test'
import { mapFortnoxInvoice, resolveDocNumber } from '../lib/fortnox/map-invoice'

const TODAY = '2026-07-09'

test.describe('mapFortnoxInvoice — säkerhet (aldrig auto-utskick)', () => {
  test('reminder_count är alltid 0', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '100', Total: 5000, DueDate: '2026-08-01' }, TODAY)
    expect(m?.row.reminder_count).toBe(0)
  })

  test('next_reminder_at förekommer ALDRIG i payloaden', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '100', Total: 5000, DueDate: '2026-05-01' }, TODAY)
    expect(m).not.toBeNull()
    expect(Object.keys(m!.row)).not.toContain('next_reminder_at')
  })
})

test.describe('mapFortnoxInvoice — status', () => {
  test('förfallen när due_date < today', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '1', Total: 1000, DueDate: '2026-06-01' }, TODAY)
    expect(m?.row.status).toBe('overdue')
  })

  test('skickad när due_date >= today', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '1', Total: 1000, DueDate: '2026-08-01' }, TODAY)
    expect(m?.row.status).toBe('sent')
  })

  test('skickad när due_date saknas', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '1', Total: 1000 }, TODAY)
    expect(m?.row.status).toBe('sent')
    expect(m?.row.due_date).toBeNull()
  })
})

test.describe('mapFortnoxInvoice — belopp & utestående', () => {
  test('outstanding = Balance när det finns', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '1', Total: 10000, Balance: 4000, DueDate: TODAY }, TODAY)
    expect(m?.row.total).toBe(10000)
    expect(m?.outstanding).toBe(4000)
  })

  test('outstanding faller tillbaka på Total när Balance saknas', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '1', Total: 10000, DueDate: TODAY }, TODAY)
    expect(m?.outstanding).toBe(10000)
  })

  test('Balance 0 respekteras (ej fallback till Total)', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '1', Total: 10000, Balance: 0, DueDate: TODAY }, TODAY)
    expect(m?.outstanding).toBe(0)
  })

  test('saknad Total → 0', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: '1', DueDate: TODAY }, TODAY)
    expect(m?.row.total).toBe(0)
  })
})

test.describe('mapFortnoxInvoice — identitet & dedup', () => {
  test('docNumber från DocumentNumber i första hand', () => {
    const m = mapFortnoxInvoice({ DocumentNumber: 'DOC-1', InvoiceNumber: 'INV-9', Total: 1 }, TODAY)
    expect(m?.docNumber).toBe('DOC-1')
    expect(m?.row.fortnox_document_number).toBe('DOC-1')
    expect(m?.row.fortnox_invoice_number).toBe('INV-9')
    expect(m?.row.invoice_number).toBe('INV-9')
  })

  test('faller tillbaka på InvoiceNumber när DocumentNumber saknas', () => {
    const m = mapFortnoxInvoice({ InvoiceNumber: 'INV-9', Total: 1 }, TODAY)
    expect(m?.docNumber).toBe('INV-9')
    expect(m?.row.invoice_number).toBe('INV-9')
  })

  test('utan doc/invoice-nummer → null (hoppas över)', () => {
    expect(mapFortnoxInvoice({ Total: 5000 }, TODAY)).toBeNull()
    expect(resolveDocNumber({ Total: 5000 })).toBeNull()
  })
})
