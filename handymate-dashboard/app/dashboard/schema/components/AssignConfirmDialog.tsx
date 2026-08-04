'use client'

import { AlertTriangle, Check, Loader2, User, X } from 'lucide-react'
import type { DispatchAssessment } from '@/lib/schedule/dispatch-assessment'

export interface AssignFlowState {
  bookingId: string
  bookingTitle: string
  bookingTime: string
  candidateId: string
  candidateName: string
}

interface AssignConfirmDialogProps {
  flow: AssignFlowState | null
  loading: boolean
  assessment: DispatchAssessment | null
  error: string | null
  confirming: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Delad bekräftelsedialog för resurstavlans tilldelning (R2, tasks/
 * resurs-masterplan.md, punkt 4) — används av BÅDE drag-drop (desktop)
 * och "Tilldela"-flödet (mobil, efter personval i sheeten), som
 * instruktionen kräver ("samma bekräftelseflöde ... delad komponent").
 * Visar dispatch-bedömningen (lib/schedule/dispatch-assessment.ts, via
 * /api/schema/assign-preview): kompetensmatch + eventuell krock — krock
 * VARNAR tydligt men blockerar aldrig bekräftelsen.
 *
 * Samma responsiva bottom-sheet/modal-mönster som ShiftDetailSheet och
 * schedule/page.tsx:s post-modal.
 */
export function AssignConfirmDialog({ flow, loading, assessment, error, confirming, onConfirm, onCancel }: AssignConfirmDialogProps) {
  if (!flow) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[#E2E8F0] rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md sm:mx-4 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tilldela</p>
            <h3 className="text-lg font-semibold text-gray-900 mt-0.5">{flow.bookingTitle}</h3>
            <p className="text-xs text-slate-500 tabular-nums mt-0.5">{flow.bookingTime}</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-900 -mt-1 -mr-1 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2.5 bg-primary-50 border border-primary-100 rounded-xl p-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-gray-900">{flow.candidateName}</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Bedömer tillgänglighet...
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        {!loading && assessment && (
          <div className="space-y-3 mb-5">
            {/* Kompetens */}
            <div
              className={`flex items-start gap-2 rounded-xl p-3 border ${
                assessment.skillMatch
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {assessment.skillMatch ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <div className="text-xs">
                {assessment.skillMatch ? (
                  <span>Rätt kompetens ({assessment.matchedSkills.join(', ')})</span>
                ) : assessment.isGeneralist ? (
                  <span>Ingen specialitet angiven — generalist</span>
                ) : (
                  <span>Matchar inte jobbets kompetenskrav ({assessment.jobSkills.join(', ')})</span>
                )}
              </div>
            </div>

            {/* Tillgänglighet */}
            {assessment.hasConflict ? (
              <div className="flex items-start gap-2 rounded-xl p-3 border bg-red-50 border-red-200 text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium mb-1">Krockar med {assessment.conflictingShifts.length} befintligt pass denna dag:</p>
                  <ul className="space-y-0.5">
                    {assessment.conflictingShifts.map((s) => (
                      <li key={s.refId} className="tabular-nums">
                        {s.title} — {s.allDay ? 'Heldag' : `${s.start.slice(11, 16)}–${s.end.slice(11, 16)}`}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 opacity-80">Blockerar inte — du kan tilldela ändå.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl p-3 border bg-emerald-50 border-emerald-200 text-emerald-700">
                <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="text-xs">Ledig — ingen krock denna dag</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || confirming}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary-700 text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
            {assessment?.hasConflict ? 'Tilldela ändå' : 'Tilldela'}
          </button>
        </div>
      </div>
    </div>
  )
}
