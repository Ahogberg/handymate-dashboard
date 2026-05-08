'use client'

import { format, isSameDay, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'

export interface LaneBooking {
  booking_id: string
  scheduled_start: string
  scheduled_end: string | null
  notes: string | null
  customer?: { name: string } | null
}

export interface LaneProject {
  project_id: string
  name: string
  /** Hex-färg från project.job_type.color, fallback till current_stage.color, sen grå */
  color: string
  customer_name: string | null
  current_stage_name: string | null
  stage_progress: number
  total_stages: number
}

interface ProjectLaneProps {
  project: LaneProject
  bookings: LaneBooking[]
  /** Dagar som visas (vanligtvis 5 mån-fre, men stöder 7) */
  weekDays: Date[]
  today: Date
}

/**
 * Horisontell lane för ett projekt över en vecka. Färgkodad enligt
 * job_type/stage och visar per-dag-bokning. Tom dag = subtil streck
 * (matchar mockup-CSSen i handoff/booking-types/idag-projekt.css).
 *
 * Bookings som inte mappar mot någon weekDay ignoreras tyst (förväntas
 * inte hända — calendar-vyn anropar med matchande from/to-fönster).
 */
export function ProjectLane({ project, bookings, weekDays, today }: ProjectLaneProps) {
  const progressPercent =
    project.total_stages > 0 ? Math.round((project.stage_progress / project.total_stages) * 100) : 0

  // Mappa bookings till weekday-index
  const bookingsByDayIdx = new Map<number, LaneBooking[]>()
  for (const b of bookings) {
    const startDate = parseISO(b.scheduled_start)
    const idx = weekDays.findIndex(d => isSameDay(d, startDate))
    if (idx === -1) continue
    const arr = bookingsByDayIdx.get(idx) || []
    arr.push(b)
    bookingsByDayIdx.set(idx, arr)
  }

  return (
    <div className="mb-3.5">
      {/* Lane header */}
      <div
        className="flex items-center gap-2.5 px-3 py-2 rounded-t-xl border border-b-0"
        style={{
          background: project.color + '15',
          borderColor: project.color + '50',
          color: project.color,
        }}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: project.color }}
        />
        <span className="font-bold text-sm" style={{ color: project.color }}>
          {project.name}
        </span>
        {project.customer_name && (
          <span className="text-xs opacity-70">· {project.customer_name}</span>
        )}
        {project.current_stage_name && (
          <span className="text-xs opacity-70">· {project.current_stage_name}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs font-semibold tabular-nums" style={{ color: project.color }}>
            {progressPercent}%
          </span>
          <div
            className="w-20 h-1 rounded-full overflow-hidden"
            style={{ background: project.color + '26' }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${progressPercent}%`, background: project.color }}
            />
          </div>
        </div>
      </div>

      {/* Day grid */}
      <div
        className="grid gap-px p-px rounded-b-xl border border-t-0"
        style={{
          gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))`,
          background: '#E2E8F0',
          borderColor: project.color + '50',
        }}
      >
        {weekDays.map((day, i) => {
          const dayBookings = bookingsByDayIdx.get(i) || []
          const isToday = isSameDay(day, today)
          const isEmpty = dayBookings.length === 0

          return (
            <div
              key={i}
              className={`relative flex flex-col gap-1 px-2.5 py-2 min-h-[64px] ${
                isEmpty ? 'bg-[#FAFAFB]' : 'bg-white'
              }`}
              style={
                isToday
                  ? {
                      background: project.color + '15',
                      outline: `2px solid ${project.color}`,
                      outlineOffset: '-2px',
                      zIndex: 2,
                    }
                  : undefined
              }
            >
              <div
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: isToday ? project.color : '#94A3B8' }}
              >
                {format(day, 'EEE d', { locale: sv })}
              </div>

              {dayBookings.map(b => (
                <div
                  key={b.booking_id}
                  className="text-[11px] text-slate-700 leading-tight pl-1.5 relative"
                >
                  <span
                    className="absolute left-0 top-0.5 bottom-0.5 w-0.5 rounded-full"
                    style={{ background: project.color }}
                  />
                  <span
                    className="font-bold tabular-nums text-[11px] text-slate-500 mr-1"
                  >
                    {format(parseISO(b.scheduled_start), 'HH:mm')}
                  </span>
                  <span className="line-clamp-2">{b.notes || b.customer?.name || 'Bokning'}</span>
                </div>
              ))}

              {/* Tom dag = streck genom mitten */}
              {isEmpty && (
                <div
                  className="absolute left-1/2 top-1/2 w-4 h-px bg-[#CBD5E1]"
                  style={{ transform: 'translate(-50%, -50%)' }}
                  aria-hidden
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
