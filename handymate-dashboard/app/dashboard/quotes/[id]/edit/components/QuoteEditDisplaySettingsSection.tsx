'use client'

import { ChevronDown, Settings2 } from 'lucide-react'
import type { DetailLevel } from '@/lib/types/quote'
import {
  resolveDisplayLevel,
  displayLevelToWriteFields,
  type DisplayLevel,
} from '@/lib/quotes/display-level'

interface QuoteEditDisplaySettingsSectionProps {
  open: boolean
  setOpen: (b: boolean) => void
  detailLevel: DetailLevel
  setDetailLevel: (d: DetailLevel) => void
  showUnitPrices: boolean
  setShowUnitPrices: (b: boolean) => void
  showQuantities: boolean
  setShowQuantities: (b: boolean) => void
}

const OPTIONS: { level: DisplayLevel; title: string; desc: string }[] = [
  { level: 'summary', title: 'Bara delsummor', desc: 'Gruppsummor per sektion — inga rader' },
  { level: 'rows', title: 'Rad för rad', desc: 'Alla rader, utan à-priser och antal' },
  { level: 'full', title: 'Full detalj', desc: 'Rader med antal och à-pris' },
]

/**
 * Nivåväljaren "Vad ska kunden se?" — EN radiogrupp som skriver koherenta
 * kombinationer av detail_level/show_unit_prices/show_quantities (via
 * displayLevelToWriteFields). Omöjliga kombinationer kan inte längre skapas.
 * Läsning normaliserar gamla värden (inkl. total_only) via resolveDisplayLevel.
 */
export function QuoteEditDisplaySettingsSection({
  open,
  setOpen,
  detailLevel,
  setDetailLevel,
  showUnitPrices,
  setShowUnitPrices,
  showQuantities,
  setShowQuantities,
}: QuoteEditDisplaySettingsSectionProps) {
  const current = resolveDisplayLevel({ detail_level: detailLevel, show_unit_prices: showUnitPrices })

  const select = (level: DisplayLevel) => {
    const w = displayLevelToWriteFields(level)
    setDetailLevel(w.detail_level)
    setShowUnitPrices(w.show_unit_prices)
    setShowQuantities(w.show_quantities)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 sm:px-6 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <Settings2 className="w-4.5 h-4.5" />
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight flex-1">Visningsinställningar</h2>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 sm:px-6 pb-6 border-t border-slate-100 pt-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Vad ska kunden se?
          </label>
          <div className="space-y-2.5">
            {OPTIONS.map(opt => {
              const active = current === opt.level
              return (
                <label
                  key={opt.level}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    active
                      ? 'border-primary-700 bg-primary-50/60 ring-1 ring-primary-100'
                      : 'border-slate-200 hover:bg-slate-50/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="display-level"
                    checked={active}
                    onChange={() => select(opt.level)}
                    className="mt-0.5 w-4 h-4 text-primary-700 border-slate-300 focus:ring-2 focus:ring-primary-100"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{opt.title}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{opt.desc}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
