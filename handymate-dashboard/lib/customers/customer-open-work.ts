export interface CustomerTaskSummary {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'done'
  due_date: string | null
  due_time: string | null
}
export interface CustomerBookingSummary {
  booking_id: string
  scheduled_start: string
  scheduled_end?: string | null
  status: string
  job_status?: string | null
  completed_at?: string | null
  notes?: string | null
}
export interface CustomerDecisionSummary { id: string; title: string; created_at: string }
export interface CustomerQuoteSummary { quote_id: string; title: string | null; quote_number: string | null; status: string; created_at: string }
export interface CustomerRelationshipSummary { decisions: CustomerDecisionSummary[]; decisionsHaveMore: boolean; decisionsError: boolean; quote: CustomerQuoteSummary | null; quoteError: boolean; handoff: { next: string; needsYou?: string } | null; handoffUnavailable: boolean; handoffError: boolean }

function assertResponseRows(body: unknown, key: 'tasks' | 'bookings'): any[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as any)[key])) throw new Error('open-work-malformed')
  return (body as any)[key]
}

export async function loadCustomerTasks(customerId: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/tasks?customer_id=${encodeURIComponent(customerId)}&open_summary=true`, { signal })
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!response.ok) throw new Error('task-read-failed')
  const body = await response.json().catch(() => null)
  const rows = assertResponseRows(body, 'tasks')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (rows.some(row => !row || typeof row.id !== 'string' || typeof row.title !== 'string' || !['pending', 'in_progress', 'done'].includes(row.status))) throw new Error('open-work-malformed')
  const open = (rows as CustomerTaskSummary[]).filter(row => row.status !== 'done').sort((a, b) => {
    const ad = a.due_date ? `${a.due_date}T${a.due_time || '23:59:59'}` : '9999'
    const bd = b.due_date ? `${b.due_date}T${b.due_time || '23:59:59'}` : '9999'
    return ad.localeCompare(bd) || a.id.localeCompare(b.id)
  })
  if (typeof (body as any).has_more !== 'boolean') throw new Error('open-work-malformed')
  return { tasks: open.slice(0, 3), hasMore: (body as any).has_more }
}

export async function loadCustomerNextBooking(customerId: string, now: Date, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const params = new URLSearchParams({ customerId, from: now.toISOString(), next_active: 'true' })
  const response = await fetcher(`/api/bookings?${params}`, { signal })
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!response.ok) throw new Error('booking-read-failed')
  const rows = assertResponseRows(await response.json().catch(() => null), 'bookings')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (rows.some(row => !row || typeof row.booking_id !== 'string' || typeof row.scheduled_start !== 'string' || Number.isNaN(Date.parse(row.scheduled_start)) || typeof row.status !== 'string')) throw new Error('open-work-malformed')
  return (rows as CustomerBookingSummary[]).filter(row => row.status === 'confirmed' && !row.completed_at && !['cancelled', 'completed'].includes(row.job_status || '') && new Date(row.scheduled_start) >= now)
    .sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start) || a.booking_id.localeCompare(b.booking_id))[0] || null
}

export async function loadCustomerRelationship(customerId: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<CustomerRelationshipSummary> {
  const [decisionsResult, quotesResult] = await Promise.allSettled([
    fetcher(`/api/customers/${encodeURIComponent(customerId)}/decisions`, { signal }),
    fetcher(`/api/quotes?customerId=${encodeURIComponent(customerId)}`, { signal }),
  ])
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  let decisions: CustomerDecisionSummary[] = []; let decisionsHaveMore = false; let decisionsError = true
  if (decisionsResult.status === 'fulfilled' && decisionsResult.value.ok) {
    const body = await decisionsResult.value.json().catch(() => null); if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (Array.isArray(body?.approvals) && body.approvals.every((a: any) => typeof a?.id === 'string' && typeof a?.title === 'string' && typeof a?.created_at === 'string') && typeof body.has_more === 'boolean') { decisions = body.approvals; decisionsHaveMore = body.has_more; decisionsError = false }
  }
  let quoteError = true; let quotes: any[] = []
  if (quotesResult.status === 'fulfilled' && quotesResult.value.ok) {
    const body = await quotesResult.value.json().catch(() => null); if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (Array.isArray(body?.quotes) && body.quotes.every((q: any) => q && typeof q.quote_id === 'string' && typeof q.status === 'string' && typeof q.created_at === 'string')) { quotes = body.quotes; quoteError = false }
  }
  quotes = quotes
    .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at) || b.quote_id.localeCompare(a.quote_id))
  const quote = quotes[0] || null
  let handoff: CustomerRelationshipSummary['handoff'] = null
  let handoffUnavailable = false
  let handoffError = false
  if (quote && !quoteError) {
    try {
      const response = await fetcher(`/api/quotes/${encodeURIComponent(quote.quote_id)}/handoff`, { signal })
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (response.ok) {
        const body = await response.json().catch(() => null); if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (!body?.summary || typeof body.summary.next !== 'string') handoffError = true
        else handoff = body.summary
      } else if (response.status === 403) handoffUnavailable = true
      else handoffError = true
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
      handoffError = true
    }
  }
  return { decisions, decisionsHaveMore, decisionsError, quote, quoteError, handoff, handoffUnavailable, handoffError }
}

export function nextAdministrativeStep(relationship: CustomerRelationshipSummary, tasks: CustomerTaskSummary[], booking: CustomerBookingSummary | null): string {
  if (relationship.decisionsError || relationship.quoteError || relationship.handoffError) return 'Nästa steg kan inte bekräftas eftersom allt underlag inte kunde läsas.'
  if (relationship.decisions.length) return `Öppna ärendet: ${relationship.decisions[0].title}`
  if (relationship.handoff?.needsYou) return relationship.handoff.needsYou
  if (relationship.handoff?.next) return relationship.handoff.next
  if (relationship.quote && relationship.handoffUnavailable) return 'Öppna den senaste offerten och kontrollera nästa steg.'
  if (tasks.length) return `Hantera uppgiften: ${tasks[0].title}`
  if (booking) return `Förbered nästa bokning ${new Date(booking.scheduled_start).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}.`
  return 'Inget administrativt nästa steg är bekräftat just nu.'
}
