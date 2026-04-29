'use client'

import { ChevronDown, Settings2 } from 'lucide-react'
import type { DetailLevel } from '@/lib/types/quote'

interface QuoteEditDisplaySettingsSectionProps {
  open: boolean
  setOpen: (b: boolean) => void
  detailLevel: DetailLevel
  setDetailLevel: (d: DetailLevel) => void
  showUnitPrices: boolean
  setShowUnitPrices: (b: boolean) => void
  showQuantities: boolean
  setShowQuantities: (b: boolean) => void
  showCategorySubtotals: boolean
  setShowCategorySubtotals: (b: boolean) => void
}

export function QuoteEditDisplaySettingsSection({
  open,
  setOpen,
  detailLevel,
  setDetailLevel,
  showUnitPrices,
  setShowUnitPrices,
  showQuantities,
  setShowQuantities,
  showCategorySubtotals,
  setShowCategorySubtotals,
}: QuoteEditDisplaySettingsSectionProps) {
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
        <div className="px-5 sm:px-6 pb-6 border-t border-slate-100 pt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Detaljnivå
            </label>
            <select
              value={detailLevel}
              onChange={e => setDetailLevel(e.target.value as DetailLevel)}
              className="w-full sm:w-72 px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            >
              <option value="detailed">Detaljerad (alla rader)</option>
              <option value="subtotals_only">Endast delsummor</option>
              <option value="total_only">Endast totalsumma</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Checkbox label="Visa à-priser" checked={showUnitPrices} onChange={setShowUnitPrices} />
            <Checkbox label="Visa antal" checked={showQuantities} onChange={setShowQuantities} />
            <Checkbox
              label="Visa delsummor per kategori"
              checked={showCategorySubtotals}
              onChange={setShowCategorySubtotals}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (b: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-2 focus:ring-primary-100 focus:ring-offset-0"
      />
      <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">{label}</span>
    </label>
  )
}
