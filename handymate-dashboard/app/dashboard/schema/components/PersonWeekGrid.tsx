'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Palmtree } from 'lucide-react'
import type { PersonDay, PersonDayShift } from '@/lib/schedule/person-day'
import { utilizationColorClasses, type PersonWeekUtilization } from '@/lib/schedule/utilization'
import { ShiftChip } from './ShiftChip'
import { UnassignedBookingChip } from './UnassignedBookingChip'
import type { ResourceTeamMember, WeekBooking } from './types'

const GRID_COLS = '220px repeat(7, minmax(132px, 1fr))'

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').substring(0, 2).toUpperCase()
}

interface PersonWeekGridProps {
  weekDates: string[]
  todayStr: string
  members: ResourceTeamMember[]
  personDays: PersonDay[]
  unassignedByDate: Map<string, WeekBooking[]>
  utilByMember: Map<string, PersonWeekUtilization>
  canAssign: boolean
  onShiftClick: (shift: PersonDayShift, member: ResourceTeamMember) => void
  onUnassignedClick: (booking: WeekBooking) => void
  onRequestAssign: (bookingId: string, targetMemberId: string) => void
}

/**
 * Veckotavlan, desktop ≥1024px (R2, tasks/resurs-masterplan.md, punkt 1-4).
 * Rader = anställda, kolumner = mån-sön. Översta raden = obemannade
 * bokningar (punkt 3). HTML5 native drag-drop (inga nya beroenden) — en
 * dragen bokning kan bara släppas i SAMMA datumkolumn den redan ligger i
 * (tilldelningen ändrar bara assigned_user_id, aldrig tid/datum — se
 * app/api/bookings/route.ts PUT). Andra kolumner avvisar dropp.
 */
export function PersonWeekGrid({
  weekDates,
  todayStr,
  members,
  personDays,
  unassignedByDate,
  utilByMember,
  canAssign,
  onShiftClick,
  onUnassignedClick,
  onRequestAssign,
}: PersonWeekGridProps) {
  const [dragSourceDate, setDragSourceDate] = useState<string | null>(null)
  const [dragBookingId, setDragBookingId] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<string | null>(null) // `${memberId}::${date}`

  function startDrag(bookingId: string, date: string) {
    return (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', bookingId)
      setDragBookingId(bookingId)
      setDragSourceDate(date)
    }
  }

  function endDrag() {
    setDragBookingId(null)
    setDragSourceDate(null)
    setHoverCell(null)
  }

  function cellDragOver(memberId: string, date: string) {
    return (e: React.DragEvent) => {
      if (!canAssign || !dragBookingId || dragSourceDate !== date) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setHoverCell(`${memberId}::${date}`)
    }
  }

  function cellDrop(memberId: string, date: string) {
    return (e: React.DragEvent) => {
      if (!canAssign || !dragBookingId || dragSourceDate !== date) return
      e.preventDefault()
      onRequestAssign(dragBookingId, memberId)
      endDrag()
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 940 }}>
          {/* Header */}
          <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: GRID_COLS }}>
            <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Person</div>
            {weekDates.map((date) => {
              const d = parseISO(date)
              const isToday = date === todayStr
              return (
                <div key={date} className={`px-2 py-3 text-center border-l border-slate-100 ${isToday ? 'bg-primary-50/60' : ''}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-primary-700' : 'text-slate-400'}`}>
                    {format(d, 'EEE', { locale: sv })}
                  </div>
                  <div className={`text-sm font-semibold ${isToday ? 'text-primary-700' : 'text-gray-700'}`}>{format(d, 'd MMM', { locale: sv })}</div>
                </div>
              )
            })}
          </div>

          {/* Obemannade */}
          <div className="grid border-b border-slate-200 bg-amber-50/30" style={{ gridTemplateColumns: GRID_COLS }}>
            <div className="px-4 py-3 flex items-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Obemannade</span>
            </div>
            {weekDates.map((date) => {
              const bookings = unassignedByDate.get(date) || []
              return (
                <div key={date} className="border-l border-slate-100 p-1.5 min-h-[64px] space-y-1">
                  {bookings.map((b) => (
                    <UnassignedBookingChip
                      key={b.booking_id}
                      booking={b}
                      draggable={canAssign}
                      onDragStart={startDrag(b.booking_id, date)}
                      onDragEnd={endDrag}
                      onClick={() => onUnassignedClick(b)}
                    />
                  ))}
                </div>
              )
            })}
          </div>

          {/* Personrader */}
          {members.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">Inga aktiva teammedlemmar</div>
          ) : (
            members.map((member) => {
              const util = utilByMember.get(member.id)
              const pct = util?.utilizationPct ?? 0
              const colors = utilizationColorClasses(pct)
              return (
                <div key={member.id} className="grid border-b border-slate-100 last:border-b-0" style={{ gridTemplateColumns: GRID_COLS }}>
                  <div className="px-4 py-3 flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: member.color || '#0F766E' }}
                    >
                      {getInitials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{member.name}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className={`text-[11px] font-bold tabular-nums ${colors.text}`}>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>

                  {weekDates.map((date) => {
                    const personDay = personDays.find((pd) => pd.businessUserId === member.id && pd.date === date)
                    const shifts = personDay?.shifts || []
                    const isAbsent = personDay?.isAbsent ?? false
                    const isHovering = hoverCell === `${member.id}::${date}`
                    return (
                      <div
                        key={date}
                        onDragOver={cellDragOver(member.id, date)}
                        onDragLeave={() => setHoverCell((c) => (c === `${member.id}::${date}` ? null : c))}
                        onDrop={cellDrop(member.id, date)}
                        className={`border-l border-slate-100 p-1.5 min-h-[64px] space-y-1 transition-colors ${
                          isAbsent ? 'bg-slate-50' : ''
                        } ${isHovering ? 'bg-primary-50 ring-2 ring-inset ring-primary-400' : ''}`}
                      >
                        {isAbsent && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 italic px-0.5">
                            <Palmtree className="w-3 h-3" />
                            Frånvaro
                          </div>
                        )}
                        {shifts
                          .filter((s) => s.type !== 'time_off')
                          .map((shift) => (
                            <ShiftChip
                              key={`${shift.source}_${shift.refId}`}
                              shift={shift}
                              compact
                              draggable={canAssign && shift.source === 'booking'}
                              onDragStart={shift.source === 'booking' ? startDrag(shift.refId, date) : undefined}
                              onDragEnd={shift.source === 'booking' ? endDrag : undefined}
                              onClick={() => onShiftClick(shift, member)}
                            />
                          ))}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
