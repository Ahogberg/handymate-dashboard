'use client'

import { TrendingUp } from 'lucide-react'

interface DealPromptModalProps {
  customerId: string
  customerName: string
  onDismiss: () => void
}

/**
 * Visas direkt efter skapad kund. Föreslår att skapa ett lead/deal direkt
 * istället för att tvinga användaren navigera dit manuellt.
 */
export function DealPromptModal({ customerId, customerName, onDismiss }: DealPromptModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-6 h-6 text-primary-700" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Kund skapad!</h3>
        <p className="text-sm text-gray-500 mb-5">
          Vill du skapa ett lead för <strong>{customerName}</strong> direkt?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-[#E2E8F0] rounded-xl hover:bg-gray-50"
          >
            Inte nu
          </button>
          <button
            onClick={() => {
              window.location.href = `/dashboard/pipeline?newDeal=true&customer_id=${customerId}&customer_name=${encodeURIComponent(customerName)}`
            }}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary-700 hover:bg-primary-800 rounded-xl"
          >
            Skapa lead
          </button>
        </div>
      </div>
    </div>
  )
}
