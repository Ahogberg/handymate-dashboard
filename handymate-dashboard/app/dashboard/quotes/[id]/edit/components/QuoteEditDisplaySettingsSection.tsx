'use client'

import { ChevronDown } from 'lucide-react'
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
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-7 py-4 text-left"
      >
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569]">Visningsinställningar</span>
        <ChevronDown className={`w-4 h-4 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-7 pb-6 space-y-4">
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Detaljnivå</label>
            <select
              value={detailLevel}
              onChange={e => setDetailLevel(e.target.value as DetailLevel)}
              className="w-full sm:w-64 px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
            >
              <option value="detailed">Detaljerad (alla rader)</option>
              <option value="subtotals_only">Endast delsummor</option>
              <option value="total_only">Endast totalsumma</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showUnitPrices}
                onChange={e => setShowUnitPrices(e.target.checked)}
                className="w-4 h-4 rounded border-[#E2E8F0] text-[#0F766E] focus:ring-[#0F766E]"
              />
              <span className="text-[13px] text-[#64748B]">Visa à-priser</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showQuantities}
                onChange={e => setShowQuantities(e.target.checked)}
                className="w-4 h-4 rounded border-[#E2E8F0] text-[#0F766E] focus:ring-[#0F766E]"
              />
              <span className="text-[13px] text-[#64748B]">Visa antal</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showCategorySubtotals}
                onChange={e => setShowCategorySubtotals(e.target.checked)}
                className="w-4 h-4 rounded border-[#E2E8F0] text-[#0F766E] focus:ring-[#0F766E]"
              />
              <span className="text-[13px] text-[#64748B]">Visa delsummor per kategori</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
