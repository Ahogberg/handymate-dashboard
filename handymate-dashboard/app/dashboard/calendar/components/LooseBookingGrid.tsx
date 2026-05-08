'use client'

import { format, isSameDay, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { LaneBooking } from './ProjectLane'

const KIND_LABEL: Record<string, string> = {
  service: 'Service',
  offer: 'Offertbesök',
  emergency: 'Felanmälan',
  standard: '',
}

interface LooseBookingGridProps {
  bookings: Array<LaneBooking & { kind?: string | null }>
  weekDays: Date[]
  today: Date
}

/**
 * Grid för "lösa pass" — bokningar utan project_id. En kolumn per dag,
 * stack av bokningar per dag. Layout matchar mockupens .ip-loose-grid
 * från handoff/booking-types/idag-projekt.css.
 *
 * Skiljer sig från ProjectLane: ingen färgkodning per booking, ingen
 * progress-bar, men kategori-pill (kind) på varje rad om != standard.
 */
export function LooseBookingGrid({ bookings, weekDays, today }: LooseBookingGridProps) {
  const bookingsByDayIdx = new Map<number, Array<LaneBooking & { kind?: string | null }>>()
  for (const b of bookings) {
    const startDate = parseISO(b.scheduled_start)
    const idx = weekDays.findIndex(d => isSameDay(d, startDate))
    if (idx === -1) continue
    const arr = bookingsByDayIdx.get(idx) || []
    arr.push(b)
    bookingsByDayIdx.set(idx, arr)
  }

  return (
    <div
      className="grid gap-2 mt-2"
      style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}
    >
      {weekDays.map((day, i) => {
        const dayBookings = bookingsByDayIdx.get(i) || []
        const isToday = isSameDay(day, today)

        return (
          <div
            key={i}
            className={`bg-white border rounded-[10px] p-3 min-h-[72px] flex flex-col gap-1.5 ${
              isToday ? 'bg-teal-50 border-teal-200' : 'border-slate-200'
            }`}
          >
            <div
              className={`text-[10px] font-bold uppercase tracking-wider ${
                isToday ? 'text-teal-700' : 'text-slate-400'
              }`}
            >
              {format(day, 'EEE d', { locale: sv })}
            </div>

            {dayBookings.length === 0 ? (
              <div className="text-[11px] text-slate-400 italic">Inga lösa pass</div>
            ) : (
              dayBookings.map(b => {
                const kindLabel = b.kind && b.kind !== 'standard' ? KIND_LABEL[b.kind] : ''
                return (
                  <div key={b.booking_id} className="text-[11px] text-slate-700 leading-tight">
                    <span className="font-bold tabular-nums text-[11px] text-slate-500 block">
                      {format(parseISO(b.scheduled_start), 'HH:mm')}
                    </span>
                    <span>{b.customer?.name || 'Okänd'}</span>
                    {kindLabel && (
                      <span className="text-[10px] text-slate-500 ml-1">· {kindLabel}</span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )
      })}
    </div>
  )
}
