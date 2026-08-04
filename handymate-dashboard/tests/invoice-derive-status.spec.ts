/**
 * FACIT — deriveStatus (lib/invoice-templates/data-builder.ts). ETAPP 6d
 * (offert-masterplan.md, faktura-sprinten), "6b-flaggan": innan denna fix
 * kortslöt funktionen till { status: 'reminder', daysOverdue: 0 } för
 * invoice_type==='reminder' UTAN att titta på due_date — en förfallen
 * påminnelsefaktura fick alltså alltid daysOverdue=0, vilket i sin tur
 * nollade lateInterest (buildInvoiceTemplateData) trots att fakturan
 * faktiskt var sen. Ren funktion, ingen DOM.
 *
 * Körs: npx playwright test tests/invoice-derive-status.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { deriveStatus } from '../lib/invoice-templates/data-builder'

const DAY_MS = 24 * 60 * 60 * 1000
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()
const isoDaysAhead = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString()

test.describe('deriveStatus — status + förfallodagar', () => {
  test('(a) betald faktura → paid, daysOverdue=0 oavsett due_date', () => {
    expect(deriveStatus({ status: 'paid', due_date: isoDaysAgo(30) })).toEqual({ status: 'paid', daysOverdue: 0 })
  })

  test('(b) paid_at satt (även om status-fältet inte hunnit uppdateras) → paid', () => {
    expect(deriveStatus({ status: 'sent', paid_at: isoDaysAgo(1), due_date: isoDaysAgo(30) }))
      .toEqual({ status: 'paid', daysOverdue: 0 })
  })

  test('(c) normal faktura, ej förfallen → unpaid, daysOverdue=0', () => {
    expect(deriveStatus({ status: 'sent', due_date: isoDaysAhead(10) })).toEqual({ status: 'unpaid', daysOverdue: 0 })
  })

  test('(d) normal faktura, förfallen 5 dagar → overdue, daysOverdue=5', () => {
    const result = deriveStatus({ status: 'sent', due_date: isoDaysAgo(5) })
    expect(result.status).toBe('overdue')
    expect(result.daysOverdue).toBeGreaterThanOrEqual(4)
    expect(result.daysOverdue).toBeLessThanOrEqual(5)
  })

  test('(e) FACIT-BUGGEN: invoice_type=reminder OCH förfallen → status "reminder" men daysOverdue måste vara RÄKNAT (inte tvingat till 0)', () => {
    const result = deriveStatus({ status: 'sent', invoice_type: 'reminder', due_date: isoDaysAgo(20) })
    expect(result.status).toBe('reminder')
    expect(result.daysOverdue).toBeGreaterThanOrEqual(19)
    expect(result.daysOverdue).toBeLessThanOrEqual(20)
  })

  test('(f) invoice_type=reminder men INTE förfallen → status "reminder", daysOverdue=0 (korrekt, inte buggen — bara sant att den inte är sen)', () => {
    const result = deriveStatus({ status: 'sent', invoice_type: 'reminder', due_date: isoDaysAhead(5) })
    expect(result).toEqual({ status: 'reminder', daysOverdue: 0 })
  })

  test('(g) invoice_type=reminder men betald → paid vinner (paid-kollen körs alltid först)', () => {
    const result = deriveStatus({ status: 'paid', invoice_type: 'reminder', due_date: isoDaysAgo(20) })
    expect(result).toEqual({ status: 'paid', daysOverdue: 0 })
  })

  test('(h) saknar due_date helt → unpaid, daysOverdue=0 (ingen krasch)', () => {
    expect(deriveStatus({ status: 'draft' })).toEqual({ status: 'unpaid', daysOverdue: 0 })
  })
})
