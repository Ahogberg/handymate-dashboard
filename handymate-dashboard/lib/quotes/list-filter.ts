export type QuoteListFilter = 'all' | 'draft' | 'sent' | 'accepted'

/**
 * Offertlistans delbara filterkontrakt. `opened` hör till samma arbetskö
 * som `sent`: båda väntar fortfarande på kundbeslut.
 */
export function readQuoteListFilter(searchParams: Pick<URLSearchParams, 'get'>): QuoteListFilter {
  const status = searchParams.get('status')
  if (status === 'draft' || status === 'sent' || status === 'accepted') return status
  if (status === 'opened') return 'sent'
  return 'all'
}

export function quoteListHref(filter: QuoteListFilter, currentQuery = ''): string {
  const params = new URLSearchParams(currentQuery)
  if (filter === 'all') params.delete('status')
  else params.set('status', filter)
  const query = params.toString()
  return query ? `/dashboard/quotes?${query}` : '/dashboard/quotes'
}
