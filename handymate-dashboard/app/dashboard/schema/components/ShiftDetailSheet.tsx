'use client'

import Link from 'next/link'
import { X, AlertTriangle, ArrowRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { PersonDayShift } from '@/lib/schedule/person-day'

const TYPE_LABEL: Record<string, string> = {
  booking: 'Kundjobb',
  project: 'Projekt',
  internal: 'Internt',
  travel: 'Restid',
  time_off: 'Frånvaro',
}

export interface ShiftDetailContext {
  shift: PersonDayShift
  memberName: string
  customerName?: string | null
  projectName?: string | null
}

interface ShiftDetailSheetProps {
  context: ShiftDetailContext | null
  onClose: () => void
}

/**
 * Klick-på-chip-detaljer (R2, tasks/resurs-masterplan.md, punkt 1):
 * titel, tid, projekt/kundlänk. Samma responsiva bottom-sheet/popover-
 * mönster som schedule/page.tsx:s post-modal (items-end sm:items-center,
 * rounded-t-2xl sm:rounded-xl) — ren infovy, inga redigeringsfält.
 */
export function ShiftDetailSheet({ context, onClose }: ShiftDetailSheetProps) {
  if (!context) return null
  const { shift, memberName, customerName, projectName } = context
  const timeLabel = shift.allDay
    ? 'Heldag'
    : `${format(parseISO(shift.start), 'HH:mm')}–${format(parseISO(shift.end), 'HH:mm')}`
  const dateLabel = format(parseISO(shift.start), 'EEEE d MMMM', { locale: sv })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#E2E8F0] rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md sm:mx-4 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{TYPE_LABEL[shift.type] || shift.type}</p>
            <h3 className="text-lg font-semibold text-gray-900 mt-0.5">{shift.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 -mt-1 -mr-1 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Person</span>
            <span className="font-medium text-gray-900">{memberName}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Datum</span>
            <span className="font-medium text-gray-900 capitalize">{dateLabel}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Tid</span>
            <span className="font-medium text-gray-900 tabular-nums">{timeLabel}</span>
          </div>

          {customerName && (
            <Link
              href={`/dashboard/customers/${shift.customerId}`}
              className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <span className="text-slate-500">Kund</span>
              <span className="font-medium text-primary-700 flex items-center gap-1">
                {customerName}
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          )}

          {projectName && (
            <Link
              href={`/dashboard/projects/${shift.projectId}`}
              className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <span className="text-slate-500">Projekt</span>
              <span className="font-medium text-primary-700 flex items-center gap-1">
                {projectName}
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          )}

          {shift.conflict && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="text-xs">Krockar tidsmässigt med minst ett annat pass denna dag.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
