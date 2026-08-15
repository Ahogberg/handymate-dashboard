/**
 * Facit — mergeFortnoxInvoiceLists (lib/fortnox.ts, 2026-08-15).
 *
 * Historik-widening: getFortnoxInvoices gör nu TVÅ Fortnox-anrop (öppna
 * fakturor utan tidsgräns + betalda/alla senaste 12 månaderna) och slår
 * ihop dem. Den här funktionen är den rena deduperingslogiken.
 *
 *   npx playwright test tests/fortnox-invoice-merge.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { mergeFortnoxInvoiceLists } from '../lib/fortnox'

test.describe('mergeFortnoxInvoiceLists — dedup på DocumentNumber/InvoiceNumber', () => {
  test('ingen krock: båda listornas rader finns med', () => {
    const merged = mergeFortnoxInvoiceLists(
      [{ DocumentNumber: 'A', Total: 100 }],
      [{ DocumentNumber: 'B', Total: 200 }],
    )
    expect(merged).toHaveLength(2)
  })

  test('krock: den FÖRSTA listan (primary) vinner', () => {
    const merged = mergeFortnoxInvoiceLists(
      [{ DocumentNumber: 'A', Total: 100, FullyPaid: false }],
      [{ DocumentNumber: 'A', Total: 100, FullyPaid: true }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].FullyPaid).toBe(false)
  })

  test('faller tillbaka på InvoiceNumber när DocumentNumber saknas, samma som mapFortnoxInvoice', () => {
    const merged = mergeFortnoxInvoiceLists(
      [{ InvoiceNumber: 'INV-1', Total: 100 }],
      [{ InvoiceNumber: 'INV-1', Total: 999 }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].Total).toBe(100)
  })

  test('rader helt utan identitet (varken DocumentNumber eller InvoiceNumber) hoppas över tyst — samma som mapFortnoxInvoice gör senare ändå', () => {
    const merged = mergeFortnoxInvoiceLists(
      [{ Total: 100 }],
      [{ DocumentNumber: 'B', Total: 200 }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].DocumentNumber).toBe('B')
  })

  test('tomma listor ger tom lista, kraschar aldrig', () => {
    expect(mergeFortnoxInvoiceLists([], [])).toEqual([])
  })
})
