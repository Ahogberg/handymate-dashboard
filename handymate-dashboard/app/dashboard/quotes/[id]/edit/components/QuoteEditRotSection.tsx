'use client'

import { Sparkles } from 'lucide-react'
import type { QuoteItem } from '@/lib/types/quote'

interface QuoteEditRotSectionProps {
  items: QuoteItem[]
  setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>
  hasRotItems: boolean
  personnummer: string
  setPersonnummer: (s: string) => void
  fastighetsbeteckning: string
  setFastighetsbeteckning: (s: string) => void
}

export function QuoteEditRotSection({
  items,
  setItems,
  hasRotItems,
  personnummer,
  setPersonnummer,
  fastighetsbeteckning,
  setFastighetsbeteckning,
}: QuoteEditRotSectionProps) {
  const toggle = () => {
    if (hasRotItems) {
      setItems(prev => prev.map(item => ({ ...item, is_rot_eligible: false })))
    } else {
      setItems(prev =>
        prev.map(item => ({
          ...item,
          is_rot_eligible: item.item_type === 'item' && item.unit === 'tim',
        })),
      )
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between text-left group"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Sparkles className={`w-4 h-4 ${hasRotItems ? 'text-primary-700' : 'text-slate-400'}`} />
          ROT-avdrag
          {hasRotItems && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
              Aktivt
            </span>
          )}
        </span>
        {/* Switch */}
        <span
          aria-checked={hasRotItems}
          role="switch"
          className={`relative inline-flex h-6 w-10 flex-shrink-0 rounded-full transition-colors ${
            hasRotItems ? 'bg-primary-700' : 'bg-slate-300 group-hover:bg-slate-400'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 mt-[2px] rounded-full bg-white shadow-sm transition-transform ${
              hasRotItems ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </span>
      </button>

      {hasRotItems && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Personnummer
            </label>
            <input
              type="text"
              value={personnummer}
              onChange={e => setPersonnummer(e.target.value)}
              placeholder="YYYYMMDD-XXXX"
              className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Fastighetsbeteckning
            </label>
            <input
              type="text"
              value={fastighetsbeteckning}
              onChange={e => setFastighetsbeteckning(e.target.value)}
              placeholder="T.ex. Stockholm Söder 1:23"
              className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            />
          </div>
          <p className="text-xs text-primary-700 sm:col-span-2 leading-relaxed">
            Kunden betalar 70% — Skatteverket betalar resterande 30% direkt till dig.
          </p>
        </div>
      )}
    </div>
  )
}
