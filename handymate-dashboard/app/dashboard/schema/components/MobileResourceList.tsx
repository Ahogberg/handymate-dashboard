'use client'

import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Palmtree } from 'lucide-react'
import type { PersonDay, PersonDayShift } from '@/lib/schedule/person-day'
import { utilizationColorClasses, type PersonWeekUtilization } from '@/lib/schedule/utilization'
import { ShiftChip } from './ShiftChip'
import { UnassignedBookingChip } from './UnassignedBookingChip'
import type { ResourceTeamMember, WeekBooking } from './types'

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').substring(0, 2).toUpperCase()
}

interface MobileResourceListProps {
  weekDates: string[]
  todayStr: string
  selectedDate: string
  onSelectDate: (date: string) => void
  members: ResourceTeamMember[]
  personDays: PersonDay[]
  unassignedByDate: Map<string, WeekBooking[]>
  utilByMember: Map<string, PersonWeekUtilization>
  canAssign: boolean
  onShiftClick: (shift: PersonDayShift, member: ResourceTeamMember) => void
  onUnassignedAssignClick: (booking: WeekBooking) => void
}

/**
 * Mobilvyn <1024px (R2, tasks/resurs-masterplan.md, punkt 6) — INTE en
 * krympt tavla, en förenklad dag/personlista byggd för tummen. Detta är
 * vinstytan mot Easofts sågade mobilkalender (masterplanens nordstjärna).
 */
export function MobileResourceList({
  weekDates,
  todayStr,
  selectedDate,
  onSelectDate,
  members,
  personDays,
  unassignedByDate,
  utilByMember,
  canAssign,
  onShiftClick,
  onUnassignedAssignClick,
}: MobileResourceListProps) {
  const unassignedToday = unassignedByDate.get(selectedDate) || []

  return (
    <div className="space-y-4">
      {/* Dag-väljare — horisontell veckoremsa */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {weekDates.map((date) => {
          const d = parseISO(date)
          const isSelected = date === selectedDate
          const isToday = date === todayStr
          return (
            <button
              key={date}
              onClick={() => onSelectDate(date)}
              className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[52px] transition-colors ${
                isSelected ? 'bg-primary-700 text-white' : isToday ? 'bg-primary-50 text-primary-700' : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{format(d, 'EEE', { locale: sv })}</span>
              <span className="text-sm font-semibold">{format(d, 'd')}</span>
            </button>
          )
        })}
      </div>

      {/* Obemannade */}
      {unassignedToday.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1.5 px-0.5">Obemannade · {unassignedToday.length}</p>
          <div className="space-y-1.5">
            {unassignedToday.map((b) => (
              <UnassignedBookingChip
                key={b.booking_id}
                booking={b}
                onAssignClick={canAssign ? () => onUnassignedAssignClick(b) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Personkort */}
      <div className="space-y-2.5">
        {members.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 text-center text-sm text-slate-400">Inga aktiva teammedlemmar</div>
        ) : (
          members.map((member) => {
            const personDay = personDays.find((pd) => pd.businessUserId === member.id && pd.date === selectedDate)
            const shifts = (personDay?.shifts || []).filter((s) => s.type !== 'time_off')
            const isAbsent = personDay?.isAbsent ?? false
            const util = utilByMember.get(member.id)
            const pct = util?.utilizationPct ?? 0
            const colors = utilizationColorClasses(pct)

            return (
              <div key={member.id} className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: member.color || '#0F766E' }}
                  >
                    {getInitials(member.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{member.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-400">Beläggning vecka</span>
                      <span className={`text-[11px] font-bold tabular-nums ${colors.text}`}>{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  {isAbsent && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 rounded-full px-2 py-1 flex-shrink-0">
                      <Palmtree className="w-3 h-3" />
                      Frånvaro
                    </span>
                  )}
                </div>

                {shifts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Inga pass idag</p>
                ) : (
                  <div className="space-y-1.5">
                    {shifts.map((shift) => (
                      <ShiftChip key={`${shift.source}_${shift.refId}`} shift={shift} onClick={() => onShiftClick(shift, member)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
