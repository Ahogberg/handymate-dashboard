'use client'

import { AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { bookingTitle, type WeekBooking } from './types'

interface UnassignedBookingChipProps {
  booking: WeekBooking
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClick?: () => void
  /** Mobil: explicit "Tilldela"-knapp istället för drag (punkt 6). */
  onAssignClick?: () => void
}

/**
 * Chip för en obemannad bokning (R2, tasks/resurs-masterplan.md, punkt
 * 3) — varm amber-accent ("behöver åtgärd") till skillnad från tilldelade
 * bokningars teal, se ShiftChip.tsx.
 */
export function UnassignedBookingChip({ booking, draggable, onDragStart, onDragEnd, onClick, onAssignClick }: UnassignedBookingChipProps) {
  const title = bookingTitle(booking)
  const timeLabel = format(parseISO(booking.scheduled_start), 'HH:mm')
  const customerName = booking.customer?.name

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-2 py-1.5 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <AlertCircle className="w-3 h-3 flex-shrink-0" />
        <span className="truncate text-xs font-medium">{title}</span>
      </div>
      <div className="text-[10px] tabular-nums opacity-80 mt-0.5 truncate">
        {timeLabel}{customerName ? ` · ${customerName}` : ''}
      </div>
      {onAssignClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAssignClick()
          }}
          className="mt-1.5 w-full text-[11px] font-semibold bg-primary-700 text-white rounded-md py-1 hover:opacity-90 transition-opacity"
        >
          Tilldela
        </button>
      )}
    </div>
  )
}
