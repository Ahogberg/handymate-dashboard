'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ShieldCheck, X } from 'lucide-react'
import type { ReservationSuggestion } from '@/lib/reservations/match'

interface ReservationReviewSheetProps {
  open: boolean
  suggestions: ReservationSuggestion[]
  onAccept: (
    accepted: Array<{ reservation_id: string; title: string; content: string }>,
    rejectedIds: string[],
  ) => void
  onSkipAll: () => void
  onClose: () => void
}

/**
 * Granskningsvyn — där hantverkaren tar ställning till förslagen.
 *
 * FÖRBOCKADE som default (beslut av Andreas 2026-08-05): ett tryck ska räcka
 * för att vara skyddad. Alternativet — obockade — respekterar autonomin mer
 * men i praktiken hade nästan ingen kryssat i något, och då hade funktionen
 * byggts förgäves.
 *
 * Texten går att redigera INNAN den läggs till; den redigerade versionen är
 * det som fryses på offerten (appendToSnapshot), aldrig bibliotekstexten.
 *
 * Bottom sheet på mobil, centrerad panel på desktop — samma formspråk som
 * RowEditSheet/AddRowSheet så rörelsemönstret är inlärt.
 */
export function ReservationReviewSheet({
  open,
  suggestions,
  onAccept,
  onSkipAll,
  onClose,
}: ReservationReviewSheetProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [edited, setEdited] = useState<Record<string, string>>({})

  // Nya förslag bockas i automatiskt; hantverkarens egna avbockningar behålls
  // så länge vyn är öppen.
  useEffect(() => {
    if (!open) return
    setChecked(prev => {
      const next = { ...prev }
      for (const s of suggestions) {
        if (next[s.reservation.id] === undefined) next[s.reservation.id] = true
      }
      return next
    })
  }, [open, suggestions])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  const selectedCount = useMemo(
    () => suggestions.filter(s => checked[s.reservation.id]).length,
    [suggestions, checked],
  )

  if (!open || suggestions.length === 0) return null

  const confirm = () => {
    const accepted = suggestions
      .filter(s => checked[s.reservation.id])
      .map(s => ({
        reservation_id: s.reservation.id,
        title: s.reservation.title,
        content: edited[s.reservation.id] ?? s.reservation.content,
      }))
    const rejectedIds = suggestions.filter(s => !checked[s.reservation.id]).map(s => s.reservation.id)
    onAccept(accepted, rejectedIds)
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/45 rowsheet-fade" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Föreslagna reservationer"
        className="relative w-full sm:max-w-xl max-h-[85vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col rowsheet-up"
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0 sm:hidden" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-base font-bold text-slate-900">Föreslagna reservationer</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Förbehåll som matchar dina rader. Formuleringsmallar som stöd — inte juridisk rådgivning.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="p-2 -m-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {suggestions.map(suggestion => {
            const { reservation, triggeredBy } = suggestion
            const isChecked = checked[reservation.id] ?? true
            const isExpanded = expanded[reservation.id] ?? false
            const text = edited[reservation.id] ?? reservation.content

            return (
              <div
                key={reservation.id}
                className={`rounded-xl border p-3.5 transition-colors ${
                  isChecked ? 'border-primary-200 bg-primary-50/40' : 'border-slate-200 bg-white'
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => setChecked(prev => ({ ...prev, [reservation.id]: e.target.checked }))}
                    className="mt-0.5 w-5 h-5 rounded border-slate-300 accent-primary-700 cursor-pointer shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900">{reservation.title}</span>
                    <span className={`block text-sm text-slate-600 mt-1 ${isExpanded ? '' : 'line-clamp-2'}`}>
                      {text}
                    </span>
                  </span>
                </label>

                <div className="mt-2 pl-8 space-y-2">
                  <p className="text-xs text-slate-500">
                    Utlöst av: {triggeredBy.map(t => t.description || 'rad utan beskrivning').join(', ')}
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => ({ ...prev, [reservation.id]: !isExpanded }))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      {isExpanded ? 'Visa mindre' : 'Läs hela och redigera'}
                    </button>
                  </div>

                  {isExpanded && (
                    <textarea
                      value={text}
                      onChange={e => setEdited(prev => ({ ...prev, [reservation.id]: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onSkipAll}
            className="min-h-[44px] px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Hoppa över
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={selectedCount === 0}
            className="ml-auto min-h-[44px] px-5 bg-primary-700 hover:bg-primary-800 disabled:opacity-40 disabled:hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Lägg till valda ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  )
}
