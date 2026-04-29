'use client'

import { ChevronDown, CreditCard, Plus, X } from 'lucide-react'
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
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 sm:px-6 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <CreditCard className="w-4.5 h-4.5" />
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight flex-1">
          Betalningsplan
          {paymentPlan.length > 0 && (
            <span className="ml-2 text-xs font-medium text-slate-500">({paymentPlan.length})</span>
          )}
        </h2>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 sm:px-6 pb-6 border-t border-slate-100 pt-5">
          {paymentPlan.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">
              Ingen betalningsplan. Lägg till delbetalningar nedan.
            </p>
          ) : (
            <div className="space-y-2 mb-4">
              {calculatedPaymentPlan.map((entry, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_80px_110px_1fr_32px] gap-2 items-center bg-slate-50 rounded-xl p-3"
                >
                  <input
                    type="text"
                    value={entry.label}
                    onChange={e => onUpdateEntry(idx, 'label', e.target.value)}
                    placeholder="T.ex. Vid start"
                    className={INPUT_CLS}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={entry.percent}
                      onChange={e => onUpdateEntry(idx, 'percent', parseFloat(e.target.value) || 0)}
                      className={`${INPUT_CLS} text-right tabular-nums`}
                    />
                    <span className="text-slate-500 text-sm">%</span>
                  </div>
                  <span className="text-sm font-heading font-semibold text-slate-900 text-right tabular-nums">
                    {formatCurrency(entry.amount)}
                  </span>
                  <input
                    type="text"
                    value={entry.due_description}
                    onChange={e => onUpdateEntry(idx, 'due_description', e.target.value)}
                    placeholder="Förfallodatum/villkor"
                    className={INPUT_CLS}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveEntry(idx)}
                    aria-label="Ta bort delbetalning"
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {!paymentPlanValid && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700 font-medium">
                  Procentsatserna summerar till {sumPercent.toFixed(0)}% (ska vara 100%)
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onAddEntry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-primary-700 border border-primary-200 hover:bg-primary-50 hover:border-primary-300 bg-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Lägg till delbetalning
          </button>
        </div>
      )}
    </div>
  )
}

const INPUT_CLS =
  'px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'
