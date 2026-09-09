import { expect, test } from '@playwright/test'
import { quoteListHref, readQuoteListFilter } from '../lib/quotes/list-filter'

test.describe('offertlistans delbara arbetskö', () => {
  test('Pengar just nu-länken landar direkt bland offerter som väntar på beslut', () => {
    expect(readQuoteListFilter(new URLSearchParams('status=sent'))).toBe('sent')
    expect(readQuoteListFilter(new URLSearchParams('status=opened'))).toBe('sent')
  })

  test('okända filter visar den säkra fullständiga listan', () => {
    expect(readQuoteListFilter(new URLSearchParams('status=declined'))).toBe('all')
    expect(readQuoteListFilter(new URLSearchParams())).toBe('all')
  })

  test('flikval blir delbara utan att andra query-parametrar tappas', () => {
    expect(quoteListHref('sent', 'source=money')).toBe('/dashboard/quotes?source=money&status=sent')
    expect(quoteListHref('all', 'source=money&status=accepted')).toBe('/dashboard/quotes?source=money')
  })
})
