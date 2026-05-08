'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { ProjectLane, type LaneBooking, type LaneProject } from './ProjectLane'
import { LooseBookingGrid } from './LooseBookingGrid'

interface LaneViewProps {
  /** Måndagen i veckan som ska visas (mån-sön i calendar-vyn) */
  monday: Date
  /** Array av 7 dagar mån-sön */
  weekDays: Date[]
  /** Idag — för highlight i lane + loose-grid */
  today: Date
}

interface BookingApiRow {
  booking_id: string
  scheduled_start: string
  scheduled_end: string | null
  notes: string | null
  kind?: string | null
  project_id: string | null
  customer?: { name: string } | null
  project?: {
    project_id: string
    name: string
    current_stage_name: string | null
    current_stage_color: string | null
    stage_progress: number
    total_stages: number
  } | null
}

const DEFAULT_LANE_COLOR = '#0F766E'

function formatDateISO(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/**
 * Lane-mode för calendar-vyn (mockup-skärm 4 i handoff/booking-types/).
 * Hämtar veckans bookings från /api/bookings, grupperar per project_id
 * → projekt-lanes, och bookings utan project_id → loose-grid nedan.
 *
 * Färgkodning: project.current_stage_color är primary, fallback till
 * teal-default (job_type-färg-fallback skippad i v1, lägg till om
 * Christoffer ber om det — mest meningsfullt när han har många projekt
 * av olika typer parallellt).
 */
export function LaneView({ monday, weekDays, today }: LaneViewProps) {
  const [bookings, setBookings] = useState<BookingApiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const from = formatDateISO(monday)
        const to = formatDateISO(weekDays[weekDays.length - 1])
        const res = await fetch(`/api/bookings?from=${from}&to=${to}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || 'Kunde inte hämta bokningar')
          setBookings([])
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
  }, [monday, weekDays])

  const { laneGroups, looseBookings } = useMemo(() => {
    const groupsMap = new Map<
      string,
      { project: LaneProject; bookings: LaneBooking[] }
    >()
    const loose: Array<LaneBooking & { kind?: string | null }> = []

    for (const b of bookings) {
      if (b.project_id && b.project) {
        const existing = groupsMap.get(b.project_id)
        const laneBooking: LaneBooking = {
          booking_id: b.booking_id,
          scheduled_start: b.scheduled_start,
          scheduled_end: b.scheduled_end,
          notes: b.notes,
          customer: b.customer,
        }
        if (existing) {
          existing.bookings.push(laneBooking)
        } else {
          groupsMap.set(b.project_id, {
            project: {
              project_id: b.project.project_id,
              name: b.project.name,
              color: b.project.current_stage_color || DEFAULT_LANE_COLOR,
              customer_name: b.customer?.name || null,
              current_stage_name: b.project.current_stage_name,
              stage_progress: b.project.stage_progress,
              total_stages: b.project.total_stages,
            },
            bookings: [laneBooking],
          })
        }
      } else {
        loose.push({
          booking_id: b.booking_id,
          scheduled_start: b.scheduled_start,
          scheduled_end: b.scheduled_end,
          notes: b.notes,
          customer: b.customer,
          kind: b.kind,
        })
      }
    }

    return {
      laneGroups: Array.from(groupsMap.values()),
      looseBookings: loose,
    }
  }, [bookings])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Laddar veckans bokningar…
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        Fel: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Projekt-lanes */}
      {laneGroups.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Projekt denna vecka · {laneGroups.length}
            </span>
            <span className="flex-1 h-px bg-slate-200" />
          </div>
          {laneGroups.map(g => (
            <ProjectLane
              key={g.project.project_id}
              project={g.project}
              bookings={g.bookings}
              weekDays={weekDays}
              today={today}
            />
          ))}
        </div>
      )}

      {/* Lösa pass */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Lösa pass denna vecka · {looseBookings.length}
          </span>
          <span className="flex-1 h-px bg-slate-200" />
        </div>
        {looseBookings.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400 italic">
            Inga lösa pass denna vecka
          </div>
        ) : (
          <LooseBookingGrid bookings={looseBookings} weekDays={weekDays} today={today} />
        )}
      </div>

      {laneGroups.length === 0 && looseBookings.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <div className="text-sm text-slate-500">Inga bokningar denna vecka.</div>
        </div>
      )}
    </div>
  )
}
