'use client'

import { AlertTriangle, Search, X } from 'lucide-react'
import type { DiaryAtaOption, DiaryFilterState } from './types'
import { EMPTY_DIARY_FILTERS } from './types'

/**
 * Filterraden ovanför dagboken. Alla filter går till servern
 * (GET /api/projects/[id]/logs?…) — inget filtreras i klienten, så listan
 * och PDF-exporten (som tar from/to) ser samma urval.
 */
export default function DiaryFilters({
  value,
  onChange,
  authors,
  atas,
}: {
  value: DiaryFilterState
  onChange: (next: DiaryFilterState) => void
  authors: Array<{ id: string; name: string | null }>
  atas: DiaryAtaOption[]
}) {
  const set = <K extends keyof DiaryFilterState>(key: K, v: DiaryFilterState[K]) =>
    onChange({ ...value, [key]: v })

  const active =
    value.q.trim() !== '' || value.from !== '' || value.to !== '' || value.user_id !== '' ||
    value.has_issues || value.attested !== '' || value.ata_change_id !== ''

  const fieldCls = 'h-9 px-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-800 focus:outline-none focus:border-primary-400 min-w-0'

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={value.q}
            onChange={e => set('q', e.target.value)}
            placeholder="Sök i dagboken…"
            className={`${fieldCls} w-full pl-8`}
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={value.from} max={value.to || undefined} onChange={e => set('from', e.target.value)} className={`${fieldCls} flex-1`} aria-label="Från datum" />
          <span className="text-gray-400 text-sm">–</span>
          <input type="date" value={value.to} min={value.from || undefined} onChange={e => set('to', e.target.value)} className={`${fieldCls} flex-1`} aria-label="Till datum" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => set('has_issues', !value.has_issues)}
          className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors ${
            value.has_issues
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-white border-[#E2E8F0] text-gray-600 hover:border-gray-300'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Avvikelser
        </button>

        <select value={value.attested} onChange={e => set('attested', e.target.value as DiaryFilterState['attested'])} className={`${fieldCls} h-8 text-xs`} aria-label="Attestering">
          <option value="">Alla rader</option>
          <option value="1">Attesterade</option>
          <option value="0">Ej attesterade</option>
        </select>

        {authors.length > 1 && (
          <select value={value.user_id} onChange={e => set('user_id', e.target.value)} className={`${fieldCls} h-8 text-xs`} aria-label="Skriven av">
            <option value="">Alla personer</option>
            {authors.map(a => (
              <option key={a.id} value={a.id}>{a.name || 'Okänd'}</option>
            ))}
          </select>
        )}

        {atas.length > 0 && (
          <select value={value.ata_change_id} onChange={e => set('ata_change_id', e.target.value)} className={`${fieldCls} h-8 text-xs max-w-[220px]`} aria-label="ÄTA">
            <option value="">Alla ÄTA</option>
            {atas.map(a => (
              <option key={a.change_id} value={a.change_id}>
                ÄTA {a.ata_number ? `#${a.ata_number}` : ''} · {a.description.slice(0, 40)}
              </option>
            ))}
          </select>
        )}

        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_DIARY_FILTERS)}
            className="h-8 px-2 rounded-lg text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 ml-auto"
          >
            <X className="w-3.5 h-3.5" /> Rensa filter
          </button>
        )}
      </div>
    </div>
  )
}
