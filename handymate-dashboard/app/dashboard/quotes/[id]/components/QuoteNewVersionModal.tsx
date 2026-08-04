'use client'

import { GitBranch, Loader2 } from 'lucide-react'

interface QuoteNewVersionModalProps {
  show: boolean
  onClose: () => void
  onConfirm: () => void
  label: string
  setLabel: (s: string) => void
  creating: boolean
}

/**
 * ETAPP 4 (offert-masterplan.md), punkt 4: ersätter `window.prompt()` i
 * page.tsx:s createNewVersion(). Samma visuella mönster som den befintliga
 * "Spara som mall"-modalen (och QuoteEditSaveTemplateModal.tsx) — ett litet
 * fristående modal-flöde snarare än ett fält i versionsväljar-baren, eftersom
 * den baren bara är synlig när ≥2 versioner redan finns (dvs. inte vid det
 * första versionsskapandet).
 */
export function QuoteNewVersionModal({ show, onClose, onConfirm, label, setLabel, creating }: QuoteNewVersionModalProps) {
  if (!show) return null

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => !creating && onClose()}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
            <GitBranch className="w-4.5 h-4.5" />
          </div>
          <h3 className="font-heading text-lg font-bold text-slate-900 tracking-tight">Skapa ny version</h3>
        </div>
        <div className="mb-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Versionsnamn (valfritt)
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="T.ex. Version 2"
            autoFocus
            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={creating}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 hover:bg-primary-600 disabled:opacity-50 rounded-xl text-white text-sm font-semibold transition-colors"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
            {creating ? 'Skapar…' : 'Skapa version'}
          </button>
        </div>
      </div>
    </div>
  )
}
