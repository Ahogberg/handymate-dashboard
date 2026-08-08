/**
 * Facit för Mattes sidkontext (2026-08-08).
 *
 * Kopplingen pathname → entitets-id är det som gör chatten medveten om var
 * hantverkaren står. Ett fel här skickar FEL kunds id till API:et — chatten
 * svarar då självsäkert om fel person, vilket är värre än att inte veta.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/matte-page-context.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { pageContextFromPathname } from '../lib/matte/page-context'

test.describe('entitets-id plockas rätt', () => {
  test('offert, projekt, kund och faktura', () => {
    expect(pageContextFromPathname('/dashboard/quotes/q_123')).toMatchObject({ page: 'quote', quoteId: 'q_123' })
    expect(pageContextFromPathname('/dashboard/projects/p_9')).toMatchObject({ page: 'project', projectId: 'p_9' })
    expect(pageContextFromPathname('/dashboard/customers/c_5')).toMatchObject({ page: 'customer', customerId: 'c_5' })
    expect(pageContextFromPathname('/dashboard/invoices/inv_2')).toMatchObject({ page: 'invoice', invoiceId: 'inv_2' })
  })

  test('undersidor är inte id:n', () => {
    // /quotes/new är en skapandesida — "new" som quoteId hade fått chatten
    // att slå upp en offert som inte finns.
    expect(pageContextFromPathname('/dashboard/quotes/new').quoteId).toBeUndefined()
    expect(pageContextFromPathname('/dashboard/quotes/new').page).toBe('quotes')
    expect(pageContextFromPathname('/dashboard/invoices/new').invoiceId).toBeUndefined()
  })

  test('edit-sidan bär fortfarande sitt id', () => {
    // /quotes/<id>/edit: id:t ligger FÖRE edit-segmentet och ska med.
    expect(pageContextFromPathname('/dashboard/quotes/q_1/edit')).toMatchObject({ page: 'quote', quoteId: 'q_1' })
  })

  test('listsidor får listfrågor, okända sidor får inga', () => {
    expect(pageContextFromPathname('/dashboard/invoices').quickActions.length).toBeGreaterThan(0)
    expect(pageContextFromPathname('/dashboard/hem').quickActions).toEqual([])
    expect(pageContextFromPathname(null).quickActions).toEqual([])
  })

  test('detaljsidor får högst tre chips', () => {
    for (const p of ['/dashboard/quotes/q1', '/dashboard/projects/p1', '/dashboard/customers/c1', '/dashboard/invoices/i1']) {
      expect(pageContextFromPathname(p).quickActions.length).toBeLessThanOrEqual(3)
    }
  })
})
