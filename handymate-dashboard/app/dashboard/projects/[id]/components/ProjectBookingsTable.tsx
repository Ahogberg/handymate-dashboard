'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus } from 'lucide-react'
import { differenceInMinutes, format, getISOWeek, isSameDay, isSameWeek, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'

interface BookingRow {
  booking_id: string
  scheduled_start: string
  scheduled_end: string | null
  notes: string | null
  job_status: string | null
  customer?: { name: string } | null
  is_final_day?: boolean
  project_day?: { current: number; total: number } | null
}

interface ProjectBookingsTableProps {
  projectId: string
  /** Frontend-länk för "Lägg till bokning"-knapp — leder till boknings-modal */
  addBookingHref: string
}

/**
 * Bokningstabell för projekt-detaljsidan (mockup-skärm 5 i
 * handoff/booking-types/). Hämtar bokningar via /api/bookings?project_id=X
 * och grupperar per ISO-vecka. "Idag"-raden highlightas.
 *
 * Skiljer sig från projektets schedule-sektion (team-planering via
 * schedule_entry-tabellen). Dessa två lever parallellt — TD-19 dokumenterar
 * domän-skillnaden.
 */
export function ProjectBookingsTable({ projectId, addBookingHref }: ProjectBookingsTableProps) {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/bookings?project_id=${projectId}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || 'Kunde inte hämta bokningar')
        } else {
          setBookings(data.bookings || [])
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Nätverksfel')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  const grouped = useMemo(() => {
    const today = new Date()
    const map = new Map<string, { weekNum: number; weekLabel: string; rows: BookingRow[] }>()
    for (const b of bookings) {
      const start = parseISO(b.scheduled_start)
      const weekNum = getISOWeek(start)
      const key = `${start.getFullYear()}-W${weekNum}`
      const existing = map.get(key)
      if (existing) {
        existing.rows.push(b)
      } else {
        let weekLabel = `Vecka ${weekNum}`
        if (isSameWeek(start, today, { weekStartsOn: 1 })) {
          weekLabel += ' — denna vecka'
        } else if (start < today) {
          weekLabel += ' — föregående'
        }
        map.set(key, { weekNum, weekLabel, rows: [b] })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.weekNum - b.weekNum)
  }, [bookings])

  function rowStatus(b: BookingRow): { label: string; cls: string } {
    if (b.job_status === 'completed') {
      return { label: 'Klar', cls: 'bg-green-50 text-green-700' }
    }
    if (b.job_status === 'in_progress') {
      return { label: 'Pågår', cls: 'bg-teal-50 text-teal-700' }
    }
    const today = new Date()
    const start = parseISO(b.scheduled_start)
    if (isSameDay(start, today)) {
      return { label: 'Pågår', cls: 'bg-teal-50 text-teal-700' }
    }
    return { label: 'Planerad', cls: 'bg-slate-50 text-slate-500 border border-slate-200' }
  }

  function durationHours(b: BookingRow): string {
    if (!b.scheduled_end) return '—'
    const minutes = differenceInMinutes(parseISO(b.scheduled_end), parseISO(b.scheduled_start))
    if (minutes <= 0) return '—'
    const hours = minutes / 60
    return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
  }

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Laddar bokningar…
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        Kunde inte hämta bokningar: {error}
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-8 text-center text-sm text-slate-500 italic">
          Inga bokningar kopplade till detta projekt än.
        </div>
        <Link
          href={addBookingHref}
          className="flex items-center justify-center gap-1.5 py-3 bg-slate-50 border-t border-dashed border-slate-300 text-sm font-semibold text-teal-700 hover:bg-slate-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Lägg till bokning
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {grouped.map((week, idx) => (
        <div key={`${week.weekNum}-${idx}`}>
          <div className="bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
            {week.weekLabel}
          </div>
          {week.rows.map(b => {
            const start = parseISO(b.scheduled_start)
            const isToday = isSameDay(start, new Date())
            const status = rowStatus(b)
            return (
              <div
                key={b.booking_id}
                className={`grid grid-cols-[110px_1fr_auto_auto] gap-3.5 items-center px-4 py-3 border-b border-slate-100 last:border-b-0 ${
                  isToday ? 'bg-teal-50' : ''
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-bold text-[13px] text-slate-900 capitalize">
                    {format(start, 'EEE', { locale: sv })}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {format(start, 'd MMM', { locale: sv })}
                    {isToday && ' · idag'}
                  </span>
                </div>
                <div className="text-sm text-slate-700">
                  {b.notes || (b.customer?.name ? `Bokning · ${b.customer.name}` : 'Bokning')}
                  {b.is_final_day && (
                    <span className="ml-2 text-[10px] font-bold text-amber-600 uppercase">
                      Sista dagen
                    </span>
                  )}
                </div>
                <div className="font-bold text-[13px] text-slate-500 tabular-nums">
                  {durationHours(b)}
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${status.cls}`}
                >
                  {status.label === 'Pågår' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  )}
                  {status.label}
                </div>
              </div>
            )
          })}
        </div>
      ))}
      <Link
        href={addBookingHref}
        className="flex items-center justify-center gap-1.5 py-3 bg-slate-50 border-t border-dashed border-slate-300 text-sm font-semibold text-teal-700 hover:bg-slate-100 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Lägg till bokning
      </Link>
    </div>
  )
}
