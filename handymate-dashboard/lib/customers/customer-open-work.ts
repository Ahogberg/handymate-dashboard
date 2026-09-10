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
