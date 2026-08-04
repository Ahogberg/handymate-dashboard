'use client'

import { X } from 'lucide-react'

interface PickerMember {
  id: string
  name: string
  color: string
}

interface MemberPickerSheetProps {
  bookingTitle: string | null
  members: PickerMember[]
  onPick: (memberId: string) => void
  onClose: () => void
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').substring(0, 2).toUpperCase()
}

/**
 * Mobilens "Tilldela"-flöde, steg 1 (R2, tasks/resurs-masterplan.md,
 * punkt 6): personval i en bottom-sheet. Steg 2 (dispatch-bedömning +
 * bekräftelse) är samma delade AssignConfirmDialog som desktopens
 * drag-drop använder — den här sheeten gör bara "vem", inte "är det ok".
 */
export function MemberPickerSheet({ bookingTitle, members, onPick, onClose }: MemberPickerSheetProps) {
  if (!bookingTitle) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm lg:hidden" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#E2E8F0] rounded-t-2xl p-5 w-full max-h-[75vh] overflow-y-auto"
      >
        <div className="flex justify-center pb-2" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tilldela</p>
            <h3 className="text-base font-semibold text-gray-900">{bookingTitle}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Inga aktiva teammedlemmar</p>
        ) : (
          <div className="space-y-1.5">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => onPick(m.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: m.color || '#0F766E' }}
                >
                  {getInitials(m.name)}
                </div>
                <span className="text-sm font-medium text-gray-900">{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
