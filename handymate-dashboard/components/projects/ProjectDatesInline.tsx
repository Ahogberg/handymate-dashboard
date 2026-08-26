'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { deriveProjectDates } from '@/lib/projects/derive-dates'

/**
 * Datumraden i projektsidans metarad (Statusbandet-handoffen, 2026-08-26).
 *
 * Visar EXAKT samma text som projektlistan (deriveProjectDates — "12 aug –
 * 30 sep · vecka 3 av 7", "försenad 6 dagar", "Klart 24 aug", "Inga datum
 * satta") och är klickbar: start + slut redigeras på plats via samma
 * onSaveDates som TwinStrip hade. Utan onSaveDates: rent läsläge.
 */

interface ProjectDatesInlineProps {
  status: string | null
  startDate: string | null
  endDate: string | null
  completedAt?: string | null
  actualStart?: string | null
  onSaveDates?: (start: string | null, end: string | null) => Promise<boolean>
}

export function ProjectDatesInline({ status, startDate, endDate, completedAt, actualStart, onSaveDates }: ProjectDatesInlineProps) {
  const dates = deriveProjectDates({ status, start_date: startDate, end_date: endDate, completed_at: completedAt ?? null, actual_start: actualStart ?? null })
  const [editing, setEditing] = useState(false)
  const [draftStart, setDraftStart] = useState(startDate || '')
  const [draftEnd, setDraftEnd] = useState(endDate || '')
  const [saving, setSaving] = useState(false)

  const open = () => {
    setDraftStart(startDate || '')
    setDraftEnd(endDate || '')
    setEditing(true)
  }
  const save = async () => {
    if (!onSaveDates) return
    setSaving(true)
    const ok = await onSaveDates(draftStart || null, draftEnd || null)
    setSaving(false)
    if (ok) setEditing(false)
  }

  const toneCls =
    dates.tone === 'late' ? 'text-red-600 font-medium'
      : dates.tone === 'done' ? 'text-emerald-700'
        : dates.tone === 'upcoming' ? 'text-primary-700'
          : 'text-slate-500'

  if (editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          value={draftStart}
          onChange={e => setDraftStart(e.target.value)}
          aria-label="Planerad start"
          className="px-1.5 py-0.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-primary-600"
        />
        <span className="text-slate-400 text-xs">–</span>
        <input
          type="date"
          value={draftEnd}
          min={draftStart || undefined}
          onChange={e => setDraftEnd(e.target.value)}
          aria-label="Planerat slut"
          className="px-1.5 py-0.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-primary-600"
        />
        <button type="button" onClick={save} disabled={saving} className="px-2 py-0.5 text-xs font-semibold rounded-md bg-primary-700 text-white hover:bg-primary-600 disabled:opacity-50">
          {saving ? 'Sparar…' : 'Spara'}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-900">
          Avbryt
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onSaveDates ? open : undefined}
      disabled={!onSaveDates}
      title={onSaveDates ? 'Ändra planerad start och slut' : dates.sublabel || undefined}
      className={`inline-flex items-center gap-1.5 min-w-0 ${toneCls} ${onSaveDates ? 'hover:text-primary-700 cursor-pointer' : 'cursor-default'}`}
    >
      <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      <span className="truncate">{dates.label}</span>
      {dates.sublabel && <span className="text-xs text-slate-400 font-normal hidden sm:inline">· {dates.sublabel}</span>}
    </button>
  )
}

export default ProjectDatesInline
