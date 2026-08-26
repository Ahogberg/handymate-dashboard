/**
 * Enhetstest — classifyFortnoxPayment (lib/fortnox/classify-payment.ts).
 * Ren funktion — stegen bakom 2h-cronens betalstatus-synk.
 *   npx playwright test tests/fortnox-classify-payment.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import { classifyFortnoxPayment, paidSoFarFromFortnox } from '../lib/fortnox/classify-payment'

const TODAY = '2026-08-26'
const ROT_LOCAL = { status: 'sent', total: 100000, rot_rut_type: 'rot', rot_rut_deduction: 30000, customer_pays: 70000 }
const PLAIN_LOCAL = { status: 'sent', total: 100000, rot_rut_type: null, rot_rut_deduction: null, customer_pays: null }

test.describe('classifyFortnoxPayment — stegen i ordning', () => {
  test('1. Cancelled vinner även med Balance 0', () => {
    expect(classifyFortnoxPayment({ Cancelled: true, Balance: 0, FullyPaid: true }, ROT_LOCAL, TODAY)).toBe('cancelled')
  })

  test('2. FullyPaid → paid; Balance ≤ 0 → paid', () => {
    expect(classifyFortnoxPayment({ FullyPaid: true, Balance: 0 }, PLAIN_LOCAL, TODAY)).toBe('paid')
    expect(classifyFortnoxPayment({ Balance: -0.5 }, PLAIN_LOCAL, TODAY)).toBe('paid')
  })

  test('2b. customer_paid lokalt + Balance 0 → paid (slutreglering, Skatteverket betalade)', () => {
    expect(classifyFortnoxPayment({ Balance: 0 }, { ...ROT_LOCAL, status: 'customer_paid' }, TODAY)).toBe('paid')
  })

  test('3. customer_paid lokalt + Balance > 0 + förfallen → unchanged (aldrig nedgradera till overdue)', () => {
    expect(classifyFortnoxPayment({ Balance: 30000, DueDate: '2026-01-01', Total: 100000 }, { ...ROT_LOCAL, status: 'customer_paid' }, TODAY)).toBe('unchanged')
  })

  test('4a. ROT: Total 100 000 / Balance 30 000 / TotalToPay 70 000 → customer_paid', () => {
    expect(classifyFortnoxPayment({ Total: 100000, Balance: 30000, TotalToPay: 70000, DueDate: '2026-01-01' }, ROT_LOCAL, TODAY)).toBe('customer_paid')
  })

  test('4a. tolerans ±1 kr på kundens andel', () => {
    expect(classifyFortnoxPayment({ Total: 100000, Balance: 30000.8, TotalToPay: 70000 }, ROT_LOCAL, TODAY)).toBe('customer_paid')
    expect(classifyFortnoxPayment({ Total: 100000, Balance: 30002, TotalToPay: 70000, DueDate: '2026-01-01' }, ROT_LOCAL, TODAY)).toBe('overdue')
  })

  test('4a. TotalToPay saknas → lokal kundandel används', () => {
    expect(classifyFortnoxPayment({ Total: 100000, Balance: 30000 }, ROT_LOCAL, TODAY)).toBe('customer_paid')
  })

  test('4b. byRemaining: Balance ≤ TaxReduction utan Total → customer_paid', () => {
    expect(classifyFortnoxPayment({ Balance: 30000, TaxReduction: 30000 }, ROT_LOCAL, TODAY)).toBe('customer_paid')
  })

  test('4. ROT obetald (Balance = Total) → INTE customer_paid; förfallen → overdue', () => {
    expect(classifyFortnoxPayment({ Total: 100000, Balance: 100000, TaxReduction: 30000, DueDate: '2026-01-01' }, ROT_LOCAL, TODAY)).toBe('overdue')
    expect(classifyFortnoxPayment({ Total: 100000, Balance: 100000, TaxReduction: 30000, DueDate: '2026-12-01' }, ROT_LOCAL, TODAY)).toBe('unchanged')
  })

  test('4. ROT: kunden har bara betalat en del av SIN del → inte customer_paid', () => {
    expect(classifyFortnoxPayment({ Total: 100000, Balance: 60000, TotalToPay: 70000, TaxReduction: 30000 }, ROT_LOCAL, TODAY)).toBe('unchanged')
  })

  test('4. ej ROT: delbetalning blir ALDRIG customer_paid', () => {
    expect(classifyFortnoxPayment({ Total: 100000, Balance: 30000, DueDate: '2026-01-01' }, PLAIN_LOCAL, TODAY)).toBe('overdue')
  })

  test('5. förfallen utan betalning → overdue; ej förfallen → unchanged', () => {
    expect(classifyFortnoxPayment({ Balance: 100000, DueDate: '2026-08-25' }, PLAIN_LOCAL, TODAY)).toBe('overdue')
    expect(classifyFortnoxPayment({ Balance: 100000, DueDate: '2026-08-26' }, PLAIN_LOCAL, TODAY)).toBe('unchanged')
  })

  test('paidSoFarFromFortnox = Total − Balance, null utan Total', () => {
    expect(paidSoFarFromFortnox({ Total: 100000, Balance: 30000 })).toBe(70000)
    expect(paidSoFarFromFortnox({ Balance: 30000 })).toBeNull()
  })
})
