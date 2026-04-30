'use client'

import { TrendingUp } from 'lucide-react'

interface DealPromptModalProps {
  customerId: string
  customerName: string
  onDismiss: () => void
}

export function DealPromptModal({ customerId, customerName, onDismiss }: DealPromptModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onDismiss}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 text-center shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-5 h-5" />
        </div>
        <h3 className="font-heading text-lg font-bold text-slate-900 tracking-tight mb-1">Kund skapad</h3>
        <p className="text-sm text-slate-500 mb-5 leading-relaxed">
          Vill du skapa ett lead för <strong className="text-slate-900">{customerName}</strong> direkt?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-colors"
          >
            Inte nu
          </button>
          <button
            onClick={() => {
              window.location.href = `/dashboard/pipeline?newDeal=true&customer_id=${customerId}&customer_name=${encodeURIComponent(customerName)}`
            }}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-primary-700 hover:bg-primary-600 rounded-xl transition-colors shadow-sm"
          >
            Skapa lead
          </button>
        </div>
      </div>
    </div>
  )
}
