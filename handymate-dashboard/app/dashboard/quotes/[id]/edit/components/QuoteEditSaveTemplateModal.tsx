'use client'

import { Loader2 } from 'lucide-react'

interface QuoteEditSaveTemplateModalProps {
  show: boolean
  onClose: () => void
  templateName: string
  setTemplateName: (s: string) => void
  saving: boolean
  onSave: () => void
}

export function QuoteEditSaveTemplateModal({
  show,
  onClose,
  templateName,
  setTemplateName,
  saving,
  onSave,
}: QuoteEditSaveTemplateModalProps) {
  if (!show) return null

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-heading text-lg font-bold text-slate-900 mb-4 tracking-tight">Spara som mall</h3>
        <div className="mb-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Mallnamn</label>
          <input
            type="text"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="T.ex. Byte elcentral"
            autoFocus
            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!templateName.trim() || saving}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Sparar…' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}
