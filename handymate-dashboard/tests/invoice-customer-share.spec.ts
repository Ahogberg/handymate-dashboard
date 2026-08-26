/**
 * Enhetstest — getCustomerShare (lib/invoices/customer-share.ts). Ren funktion.
 *   npx playwright test tests/invoice-customer-share.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import { getCustomerShare, getTaxReductionShare, hasTaxReduction } from '../lib/invoices/customer-share'

test.describe('getCustomerShare', () => {
  test('utan ROT/RUT är kundens andel hela totalen', () => {
    expect(getCustomerShare({ total: 12500, rot_rut_type: null, customer_pays: 8000 })).toBe(12500)
    expect(hasTaxReduction({ rot_rut_type: null })).toBe(false)
  })

  test('ROT med customer_pays satt och < total → customer_pays', () => {
    expect(getCustomerShare({ total: 100000, rot_rut_type: 'rot', rot_rut_deduction: 30000, customer_pays: 70000 })).toBe(70000)
  })

  test('ROT där customer_pays defaultats till total → total − rot_rut_deduction', () => {
    expect(getCustomerShare({ total: 100000, rot_rut_type: 'rot', rot_rut_deduction: 30000, customer_pays: 100000 })).toBe(70000)
  })

  test('ROT utan customer_pays → total − rot_rut_deduction', () => {
    expect(getCustomerShare({ total: 100000, rot_rut_type: 'rut', rot_rut_deduction: 50000, customer_pays: null })).toBe(50000)
  })

  test('ROT-typ men ingen registrerad reduktion → totalen (ingen delning finns)', () => {
    expect(getCustomerShare({ total: 100000, rot_rut_type: 'rot', rot_rut_deduction: 0, customer_pays: null })).toBe(100000)
  })

  test('getTaxReductionShare = total − kundens andel, aldrig negativ', () => {
    expect(getTaxReductionShare({ total: 100000, rot_rut_type: 'rot', rot_rut_deduction: 30000 })).toBe(30000)
    expect(getTaxReductionShare({ total: 5000, rot_rut_type: null })).toBe(0)
  })
})
