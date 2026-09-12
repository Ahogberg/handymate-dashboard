export interface CustomerMemoryFact {
  id: string
  fact_type: 'preference' | 'constraint' | 'commitment' | 'contact'
  content: string
  evidence_quote: string | null
  source_type: string
  source_id: string | null
  created_at: string
  confirmed_at: string
  due_at: string | null
  promise_status: 'open' | 'fulfilled' | 'broken' | null
  fulfilled_at: string | null
}

export async function loadCustomerMemory(customerId: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/customers/${encodeURIComponent(customerId)}/facts`, { signal })
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!response.ok) throw new Error('read-failed')
  const body = await response.json().catch(() => null)
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!body || !Array.isArray(body.facts) || body.limited_to !== 20 || body.facts.some((fact: unknown) => {
    if (!fact || typeof fact !== 'object') return true
    const row = fact as Record<string, unknown>
    return typeof row.id !== 'string' || !row.id || typeof row.content !== 'string'
      || !['preference', 'constraint', 'commitment', 'contact'].includes(String(row.fact_type))
      || typeof row.confirmed_at !== 'string' || !row.confirmed_at || Number.isNaN(Date.parse(row.confirmed_at))
  })) throw new Error('malformed')
  return { facts: body.facts as CustomerMemoryFact[], limit: 20 }
}

export function customerFactSourceText(sourceType: string): string {
  return ({ conversation: 'Samtal', call: 'Samtal', email: 'E-post', sms: 'SMS', manual: 'Manuellt sparat' } as Record<string, string>)[sourceType] || 'Sparat underlag'
}

export function promiseStatusText(fact: CustomerMemoryFact): string | null {
  if (fact.fact_type !== 'commitment') return null
  const date = fact.due_at ? new Date(fact.due_at).toLocaleDateString('sv-SE') : null
  if (fact.promise_status === 'fulfilled') return `Uppfyllt${fact.fulfilled_at ? ` ${new Date(fact.fulfilled_at).toLocaleDateString('sv-SE')}` : ''}`
  if (fact.promise_status === 'open') return date ? `Öppet · senast ${date}` : 'Öppet · datum saknas'
  if (fact.promise_status === 'broken') return date ? `Markerat som brutet · datum ${date}` : 'Markerat som brutet'
  return date ? `Status saknas · datum ${date}` : 'Status och datum saknas'
}
