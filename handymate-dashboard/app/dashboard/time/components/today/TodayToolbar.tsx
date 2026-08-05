'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import type { TeamMemberBasic } from './types'

/**
 * TodayToolbar — R4-A (tasks/resurs-masterplan.md).
 * Person-filter (owner/admin) + CSV-export + Ersättningar-länk + Lägg till.
 * Ren utflyttning ur TodayView.tsx, oförändrad markup/beteende.
 */
interface TodayToolbarProps {
  isOwnerOrAdmin: boolean
  teamMembers: TeamMemberBasic[]
  filterPerson: string
  setFilterPerson: (id: string) => void
  weekStart: Date
  weekEnd: Date
  onAddClick: () => void
}

export default function TodayToolbar({
  isOwnerOrAdmin,
  teamMembers,
  filterPerson,
  setFilterPerson,
  weekStart,
  weekEnd,
  onAddClick,
}: TodayToolbarProps) {
  return (
    <div className="flex items-center justify-end gap-2 flex-wrap mb-4">
      {isOwnerOrAdmin && teamMembers.length > 1 && (
        <select
          value={filterPerson}
          onChange={e => setFilterPerson(e.target.value)}
          className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]"
        >
          <option value="">Alla i teamet</option>
          {teamMembers.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}

      <a
        href={`/api/time-entry/report?startDate=${format(weekStart, 'yyyy-MM-dd')}&endDate=${format(weekEnd, 'yyyy-MM-dd')}&format=csv&groupBy=day`}
        className="px-[14px] py-[7px] bg-transparent border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#64748B] hover:text-[#1E293B]"
      >
        CSV
      </a>

      <Link href="/dashboard/time/allowances"
        className="px-[14px] py-[7px] bg-transparent border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#64748B] hover:text-[#1E293B]">
        Ersättningar
      </Link>

      <button onClick={onAddClick}
        className="px-4 py-[8px] bg-[#0F766E] text-white border-none rounded-lg text-[13px] font-medium cursor-pointer hover:bg-[#0F766E]/90">
        + Lägg till
      </button>
    </div>
  )
}
