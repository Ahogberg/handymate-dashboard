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

export interface QuoteRecency {
  updated_at?: string | null
  created_at: string
}

/**
 * RIVNING PAKET D (2026-09-17, rad 3.4): listan visade ingen sortering alls
 * (serverns svarsordning, `created_at desc`, gällde av en tillfällighet).
 * Senast ÄNDRAD offert (skickad, öppnad, accepterad) ska ligga överst —
 * `updated_at` när den finns, annars `created_at` för äldre rader utan den.
 */
export function sortQuotesByRecency<T extends QuoteRecency>(quotes: T[]): T[] {
  return [...quotes].sort((a, b) => {
    const at = new Date(a.updated_at || a.created_at).getTime()
    const bt = new Date(b.updated_at || b.created_at).getTime()
    return bt - at
  })
}
