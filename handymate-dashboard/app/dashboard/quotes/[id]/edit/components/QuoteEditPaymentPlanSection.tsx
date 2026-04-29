'use client'

import { ChevronDown } from 'lucide-react'
import type { PaymentPlanEntry } from '@/lib/types/quote'

interface QuoteEditPaymentPlanSectionProps {
  open: boolean
  setOpen: (b: boolean) => void
  paymentPlan: PaymentPlanEntry[]
  calculatedPaymentPlan: PaymentPlanEntry[]
  paymentPlanValid: boolean
  onAddEntry: () => void
  onUpdateEntry: (index: number, field: keyof PaymentPlanEntry, value: any) => void
  onRemoveEntry: (index: number) => void
  formatCurrency: (n: number) => string
}

export function QuoteEditPaymentPlanSection({
  open,
  setOpen,
  paymentPlan,
  calculatedPaymentPlan,
  paymentPlanValid,
  onAddEntry,
  onUpdateEntry,
  onRemoveEntry,
  formatCurrency,
}: QuoteEditPaymentPlanSectionProps) {
  const sumPercent = paymentPlan.reduce((s, e) => s + e.percent, 0)

  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-7 py-4 text-left"
      >
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569]">
          Betalningsplan
          {paymentPlan.length > 0 && ` (${paymentPlan.length})`}
        </span>
        <ChevronDown className={`w-4 h-4 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-7 pb-6">
          {paymentPlan.length === 0 ? (
            <p className="text-[12px] text-[#94A3B8] mb-3">
              Ingen betalningsplan. Lägg till delbetalningar nedan.
            </p>
          ) : (
            <div className="space-y-3 mb-4">
              {calculatedPaymentPlan.map((entry, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_1fr_32px] gap-2 items-center bg-[#F8FAFC] rounded-lg p-3"
                >
                  <input
                    type="text"
                    value={entry.label}
                    onChange={e => onUpdateEntry(idx, 'label', e.target.value)}
                    placeholder="T.ex. Vid start"
                    className="px-3 py-1.5 border-thin border-[#E2E8F0] rounded-lg text-[#1E293B] text-[13px] bg-white focus:outline-none focus:border-[#0F766E]"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={entry.percent}
                      onChange={e => onUpdateEntry(idx, 'percent', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border-thin border-[#E2E8F0] rounded-lg text-[#1E293B] text-[13px] text-right bg-white focus:outline-none focus:border-[#0F766E]"
                    />
                    <span className="text-[#94A3B8] text-[13px]">%</span>
                  </div>
                  <span className="text-[13px] text-[#1E293B] font-medium text-right">{formatCurrency(entry.amount)}</span>
                  <input
                    type="text"
                    value={entry.due_description}
                    onChange={e => onUpdateEntry(idx, 'due_description', e.target.value)}
                    placeholder="Förfallodatum/villkor"
                    className="px-3 py-1.5 border-thin border-[#E2E8F0] rounded-lg text-[#1E293B] text-[13px] bg-white focus:outline-none focus:border-[#0F766E]"
                  />
                  <button
                    onClick={() => onRemoveEntry(idx)}
                    className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#CBD5E1] hover:text-red-500 flex items-center justify-center text-[16px]"
                  >
                    ×
                  </button>
                </div>
              ))}
              {!paymentPlanValid && (
                <p className="text-[12px] text-red-500">
                  Procentsatserna summerar till {sumPercent.toFixed(0)}% (ska vara 100%)
                </p>
              )}
            </div>
          )}
          <button
            onClick={onAddEntry}
            className="flex items-center gap-2 text-[13px] text-[#0F766E] bg-transparent border-none cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#0F766E" strokeWidth="1" />
              <path d="M8 5v6M5 8h6" stroke="#0F766E" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Lägg till delbetalning
          </button>
        </div>
      )}
    </div>
  )
}
