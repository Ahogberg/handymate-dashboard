'use client'

import { AlertTriangle, Briefcase, Car, Coffee, Palmtree } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { PersonDayShift } from '@/lib/schedule/person-day'

/**
 * Färgkodning per passtyp (R2, tasks/resurs-masterplan.md, punkt 1):
 * booking=teal, project=blå, internal=neutral, travel=amber, time_off=grå
 * (frånvaromarkerad). Medvetet INGA violetta/fuchsia toner (CLAUDE.md:
 * "aldrig mörkt tema eller lila/fuchsia").
 */
function shiftStyle(shift: PersonDayShift): { bg: string; text: string; border: string; icon: JSX.Element } {
  switch (shift.type) {
    case 'booking':
      return { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-300', icon: <Briefcase className="w-3 h-3" /> }
    case 'project':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300', icon: <Briefcase className="w-3 h-3" /> }
    case 'travel':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', icon: <Car className="w-3 h-3" /> }
    case 'time_off':
      return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', icon: <Palmtree className="w-3 h-3" /> }
    case 'internal':
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-300', icon: <Coffee className="w-3 h-3" /> }
  }
}

interface ShiftChipProps {
  shift: PersonDayShift
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClick?: () => void
  compact?: boolean
}

export function ShiftChip({ shift, draggable, onDragStart, onDragEnd, onClick, compact }: ShiftChipProps) {
  const style = shiftStyle(shift)
  const timeLabel = shift.allDay ? 'Heldag' : `${format(parseISO(shift.start), 'HH:mm')}–${format(parseISO(shift.end), 'HH:mm')}`

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={`${shift.title} (${timeLabel})`}
      className={`w-full text-left rounded-lg border px-2 py-1 transition-colors hover:opacity-90 ${style.bg} ${style.text} ${style.border} ${
        shift.conflict ? 'ring-2 ring-red-400' : ''
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <div className="flex items-center gap-1 min-w-0">
        {style.icon}
        <span className={`truncate font-medium ${compact ? 'text-[11px]' : 'text-xs'}`}>{shift.title}</span>
        {shift.conflict && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0 ml-auto" />}
      </div>
      {!compact && <div className="text-[10px] tabular-nums opacity-75 mt-0.5">{timeLabel}</div>}
    </button>
  )
}
