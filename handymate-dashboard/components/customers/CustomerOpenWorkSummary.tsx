'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, CheckSquare, Loader2 } from 'lucide-react'
import { loadCustomerNextBooking, loadCustomerRelationship, loadCustomerTasks, nextAdministrativeStep, type CustomerBookingSummary, type CustomerRelationshipSummary, type CustomerTaskSummary } from '@/lib/customers/customer-open-work'

type Read<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: T }

export default function CustomerOpenWorkSummary({ customerId }: { customerId: string }) {
  const [tasks, setTasks] = useState<Read<{ tasks: CustomerTaskSummary[]; hasMore: boolean }>>({ status: 'loading' })
  const [booking, setBooking] = useState<Read<CustomerBookingSummary | null>>({ status: 'loading' })
  const [relationship, setRelationship] = useState<Read<CustomerRelationshipSummary>>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setTasks({ status: 'loading' }); setBooking({ status: 'loading' }); setRelationship({ status: 'loading' })
    void loadCustomerTasks(customerId, controller.signal).then(value => { if (!controller.signal.aborted) setTasks({ status: 'ready', value }) }).catch(error => { if (!controller.signal.aborted && error?.name !== 'AbortError') setTasks({ status: 'error' }) })
    void loadCustomerNextBooking(customerId, new Date(), controller.signal).then(value => { if (!controller.signal.aborted) setBooking({ status: 'ready', value }) }).catch(error => { if (!controller.signal.aborted && error?.name !== 'AbortError') setBooking({ status: 'error' }) })
    void loadCustomerRelationship(customerId, controller.signal).then(value => { if (!controller.signal.aborted) setRelationship({ status: 'ready', value }) }).catch(error => { if (!controller.signal.aborted && error?.name !== 'AbortError') setRelationship({ status: 'error' }) })
    return () => controller.abort()
  }, [customerId, retry])
  const retryButton = <button onClick={() => setRetry(value => value + 1)} className="min-h-11 px-3 text-sm font-semibold text-primary-700">Försök igen</button>
  return <section className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6" aria-labelledby="open-work-title">
    <h2 id="open-work-title" className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Öppet och nästa</h2>
    <div className="mb-4 rounded-lg bg-primary-50 p-3">
      <h3 className="text-sm font-semibold text-gray-900">Nästa administrativa steg</h3>
      {(tasks.status === 'loading' || booking.status === 'loading' || relationship.status === 'loading') && <p role="status" className="mt-1 text-sm text-gray-500">Kontrollerar nästa steg…</p>}
      {(tasks.status === 'error' || booking.status === 'error' || relationship.status === 'error') && <p className="mt-1 text-sm text-amber-800">Nästa steg kan inte bekräftas eftersom allt underlag inte kunde läsas.</p>}
      {tasks.status === 'ready' && booking.status === 'ready' && relationship.status === 'ready' && <p className="mt-1 text-sm text-gray-700">{nextAdministrativeStep(relationship.value, tasks.value.tasks, booking.value)}</p>}
    </div>
    <div className="mb-4 grid gap-4 sm:grid-cols-2">
      <div><h3 className="text-sm font-semibold text-gray-900">Kundkopplade ärenden</h3>
        {relationship.status === 'loading' && <p className="mt-2 text-sm text-gray-500">Läser beslut…</p>}
        {(relationship.status === 'error' || (relationship.status === 'ready' && relationship.value.decisionsError)) && <p className="mt-2 text-sm text-amber-800">Besluten kunde inte läsas.</p>}
        {relationship.status === 'ready' && !relationship.value.decisionsError && relationship.value.decisions.length === 0 && <p className="mt-2 text-sm text-gray-500">Inga synliga kundkopplade ärenden.</p>}
        {relationship.status === 'ready' && relationship.value.decisions.length > 0 && <><ul className="mt-2 space-y-1">{relationship.value.decisions.map(item => <li className="text-sm text-gray-900" key={item.id}>{item.title}</li>)}</ul><Link href="/dashboard/approvals" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700">Öppna besluts­kön</Link>{relationship.value.decisionsHaveMore && <p className="text-xs text-gray-400">Fler beslut finns i kön.</p>}</>}
      </div>
      <div><h3 className="text-sm font-semibold text-gray-900">Senaste offert</h3>
        {relationship.status === 'loading' && <p className="mt-2 text-sm text-gray-500">Läser offert…</p>}
        {(relationship.status === 'error' || (relationship.status === 'ready' && relationship.value.quoteError)) && <p className="mt-2 text-sm text-amber-800">Offerten kunde inte läsas.</p>}
        {relationship.status === 'ready' && !relationship.value.quoteError && !relationship.value.quote && <p className="mt-2 text-sm text-gray-500">Ingen offert hittades.</p>}
        {relationship.status === 'ready' && relationship.value.quote && <div className="mt-2"><p className="text-sm text-gray-900">{relationship.value.quote.title || relationship.value.quote.quote_number || 'Offert'} · {quoteStatusLabel(relationship.value.quote.status)}</p>{relationship.value.handoff && <><p className="mt-1 text-sm text-gray-500">{relationship.value.handoff.next}</p>{relationship.value.handoff.needsYou && <p className="mt-1 text-sm font-medium text-gray-700">Behöver dig: {relationship.value.handoff.needsYou}</p>}</>}{relationship.value.handoffError && <p className="mt-1 text-sm text-amber-800">Offertens nästa steg kunde inte bekräftas.</p>}{relationship.value.handoffUnavailable && <p className="mt-1 text-sm text-gray-500">Överlämningen är inte tillgänglig för din roll.</p>}<Link href={`/dashboard/quotes/${encodeURIComponent(relationship.value.quote.quote_id)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700">Öppna offerten</Link></div>}
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><CheckSquare className="w-4 h-4" />Öppna uppgifter</h3>
        {tasks.status === 'loading' && <p role="status" className="mt-2 text-sm text-gray-500"><Loader2 className="inline w-4 h-4 animate-spin mr-1" />Läser uppgifter…</p>}
        {tasks.status === 'error' && <div role="alert" className="mt-2 text-sm text-amber-800">Uppgifterna kunde inte läsas.{retryButton}</div>}
        {tasks.status === 'ready' && tasks.value.tasks.length === 0 && <p className="mt-2 text-sm text-gray-500">Inga synliga öppna uppgifter.</p>}
        {tasks.status === 'ready' && tasks.value.tasks.length > 0 && <><ul className="mt-2 space-y-2">{tasks.value.tasks.map(task => <li key={task.id}><p className="text-sm text-gray-900">{task.title}</p>{task.due_date && <p className="text-xs text-gray-500">Datum {new Date(`${task.due_date}T12:00:00`).toLocaleDateString('sv-SE')}{task.due_time ? ` kl ${task.due_time.slice(0, 5)}` : ''}</p>}</li>)}</ul><p className="mt-2 text-xs text-gray-400">Visar upp till 3 öppna uppgifter{tasks.value.hasMore ? ' · fler finns i Uppgifter' : ''}.</p><Link href="/dashboard/tasks" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700">Öppna Uppgifter</Link></>}
      </div>
      <div><h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><CalendarClock className="w-4 h-4" />Nästa bokning</h3>
        {booking.status === 'loading' && <p role="status" className="mt-2 text-sm text-gray-500"><Loader2 className="inline w-4 h-4 animate-spin mr-1" />Läser bokningar…</p>}
        {booking.status === 'error' && <div role="alert" className="mt-2 text-sm text-amber-800">Bokningarna kunde inte läsas.{retryButton}</div>}
        {booking.status === 'ready' && !booking.value && <p className="mt-2 text-sm text-gray-500">Ingen aktiv framtida bokning hittades.</p>}
        {booking.status === 'ready' && booking.value && <div className="mt-2"><p className="text-sm text-gray-900">{new Date(booking.value.scheduled_start).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</p>{booking.value.notes && <p className="text-sm text-gray-500">{booking.value.notes}</p>}<Link href={`/dashboard/bookings/${encodeURIComponent(booking.value.booking_id)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700">Öppna bokningen</Link></div>}
      </div>
    </div>
  </section>
}

function quoteStatusLabel(status: string) {
  return ({ draft: 'Utkast', sent: 'Skickad', opened: 'Öppnad', accepted: 'Accepterad', signed: 'Signerad', declined: 'Avböjd', expired: 'Utgången' } as Record<string, string>)[status] || 'Okänd status'
}
