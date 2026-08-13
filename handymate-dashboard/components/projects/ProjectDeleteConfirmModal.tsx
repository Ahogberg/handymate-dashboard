'use client'

import { Loader2, Trash2 } from 'lucide-react'

interface ProjectDeleteConfirmModalProps {
  show: boolean
  projectName: string
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}

/**
 * Ersätter window.confirm() i handleDeleteProject (redesign 2026-08-14,
 * punkt 05 i Projektytor-genomgången). Samma mönster som
 * QuoteDeleteConfirmModal.tsx — inte en ny stil.
 *
 * Raderingsknappen visas idag bara för opåbörjade planeringsprojekt
 * (project.status === 'planning' && project.actual_hours === 0, se
 * page.tsx) — det finns alltså aldrig tidrader, ÄTA eller fakturor att
 * varna för på riktigt just nu. Kopian säger det ärligt i stället för att
 * återanvända mockupens illustrativa "42 tidrader"-exempel, som förutsätter
 * en raderingsväg (ett redan påbörjat projekt) den här knappen inte
 * erbjuder.
 */
export function ProjectDeleteConfirmModal({ show, projectName, onClose, onConfirm, deleting }: ProjectDeleteConfirmModalProps) {
  if (!show) return null

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => !deleting && onClose()}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-4.5 h-4.5" />
          </div>
          <h3 className="font-heading text-lg font-bold text-slate-900 tracking-tight">Ta bort {projectName}?</h3>
        </div>
        <p className="text-sm text-slate-600 mb-5">
          Inga tidrader eller ÄTA är kopplade till projektet ännu, så det finns
          inget att ta med sig — bara själva projektet försvinner. Det går
          inte att ångra.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-white text-sm font-semibold transition-colors"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Tar bort…' : 'Ta bort projektet'}
          </button>
        </div>
      </div>
    </div>
  )
}
