'use client'

import { CheckCircle, Loader2, X } from 'lucide-react'
import { PAYMENT_METHODS } from '../helpers'

export interface PaymentData {
  paid_at: string
  payment_method: string
  paid_amount: number
}

interface InvoicePaymentModalProps {
  show: boolean
  paymentData: PaymentData
  setPaymentData: (data: PaymentData) => void
  amountDue: number
  updatingStatus: boolean
  onClose: () => void
  onConfirm: () => void
}

/**
 * ETAPP 6d (offert-masterplan.md, faktura-sprinten), punkt 4 — bruten ut
 * OFÖRÄNDRAD ur app/dashboard/invoices/[id]/page.tsx (tidigare rad
 * ~458-543). Ingen logikändring: samma fält, samma default-belopp
 * (invoice.customer_pays || invoice.total, beräknat av anroparen), samma
 * PATCH mot /api/invoices/[id]/status. Bara flyttad till en egen
 * komponent — mönster: QuoteDeleteConfirmModal.tsx (parent äger state,
 * modalen är ren presentation + callbacks).
 */
export function InvoicePaymentModal({
  show,
  paymentData,
  setPaymentData,
  amountDue,
  updatingStatus,
  onClose,
  onConfirm,
}: InvoicePaymentModalProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Markera som betald</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-2">Betaldatum</label>
            <input
              type="date"
              value={paymentData.paid_at}
              onChange={(e) => setPaymentData({ ...paymentData, paid_at: e.target.value })}
              className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-2">Betalningsmetod</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.value}
                  onClick={() => setPaymentData({ ...paymentData, payment_method: method.value })}
                  className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                    paymentData.payment_method === method.value
                      ? 'bg-primary-100 border-primary-600 text-gray-900'
                      : 'bg-gray-100 border-gray-300 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <method.icon className="w-4 h-4" />
                  <span className="text-sm">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-2">Betalt belopp</label>
            <div className="relative">
              <input
                type="number"
                value={paymentData.paid_amount}
                onChange={(e) => setPaymentData({ ...paymentData, paid_amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-12"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">kr</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Att betala: {amountDue?.toLocaleString('sv-SE')} kr
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            disabled={updatingStatus}
            className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl text-gray-900 font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {updatingStatus ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Bekräfta
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
