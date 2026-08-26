/**
 * Enhetstest — decidePaymentOutcome (lib/invoices/payment-decision.ts).
 * Ren funktion — beslutet bakom applyInvoicePayment.
 *   npx playwright test tests/apply-payment-decision.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import { decidePaymentOutcome } from '../lib/invoices/payment-decision'

const ROT = { status: 'sent', total: 100000, rot_rut_type: 'rot', rot_rut_deduction: 30000, customer_pays: 70000, paid_amount: null }
const PLAIN = { status: 'sent', total: 12500, rot_rut_type: null, rot_rut_deduction: null, customer_pays: null, paid_amount: null }

test.describe('decidePaymentOutcome', () => {
  test('ej ROT, inget belopp → to_paid med hela totalen', () => {
    const d = decidePaymentOutcome(PLAIN)
    expect(d.transition).toBe('to_paid')
    expect(d.status).toBe('paid')
    expect(d.paid_amount).toBe(12500)
    expect(d.remaining_rot_kr).toBe(0)
  })

  test('ej ROT, delbelopp → ändå to_paid (delbetalning utan ROT är inget eget tillstånd)', () => {
    const d = decidePaymentOutcome(PLAIN, 5000)
    expect(d.transition).toBe('to_paid')
    expect(d.paid_amount).toBe(5000)
  })

  test('ROT, inget belopp → to_customer_paid med kundens andel, rest = ROT-delen', () => {
    const d = decidePaymentOutcome(ROT)
    expect(d.transition).toBe('to_customer_paid')
    expect(d.status).toBe('customer_paid')
    expect(d.paid_amount).toBe(70000)
    expect(d.remaining_rot_kr).toBe(30000)
  })

  test('ROT, kunden betalade allt → to_paid', () => {
    const d = decidePaymentOutcome(ROT, 100000)
    expect(d.transition).toBe('to_paid')
    expect(d.remaining_rot_kr).toBe(0)
  })

  test('ROT, belopp inom 1 kr från totalen → to_paid (öresavrundning)', () => {
    expect(decidePaymentOutcome(ROT, 99999.5).transition).toBe('to_paid')
  })

  test('customer_paid + Skatteverkets del → settled', () => {
    const d = decidePaymentOutcome({ ...ROT, status: 'customer_paid', paid_amount: 70000 }, 30000)
    expect(d.transition).toBe('settled')
    expect(d.status).toBe('paid')
    expect(d.paid_amount).toBe(100000)
  })

  test('customer_paid utan belopp → settled med återstoden', () => {
    const d = decidePaymentOutcome({ ...ROT, status: 'customer_paid', paid_amount: 70000 })
    expect(d.transition).toBe('settled')
    expect(d.paid_amount).toBe(100000)
  })

  test('customer_paid med okänt paid_amount (äldre rad) räknar från kundens andel', () => {
    const d = decidePaymentOutcome({ ...ROT, status: 'customer_paid', paid_amount: null })
    expect(d.transition).toBe('settled')
    expect(d.paid_amount).toBe(100000)
  })

  test('customer_paid + för lite → none, paid_amount räknas upp, status kvar', () => {
    const d = decidePaymentOutcome({ ...ROT, status: 'customer_paid', paid_amount: 70000 }, 10000)
    expect(d.transition).toBe('none')
    expect(d.status).toBe('customer_paid')
    expect(d.paid_amount).toBe(80000)
    expect(d.remaining_rot_kr).toBe(20000)
  })

  test('redan paid → none + already_settled', () => {
    const d = decidePaymentOutcome({ ...PLAIN, status: 'paid', paid_amount: 12500 }, 12500)
    expect(d.transition).toBe('none')
    expect(d.already_settled).toBe(true)
  })

  test('overdue ROT-faktura beter sig som sent', () => {
    expect(decidePaymentOutcome({ ...ROT, status: 'overdue' }).transition).toBe('to_customer_paid')
  })
})
