'use client'

import { formatCurrency } from '../helpers'
import type { PaymentInfo } from '../types'

interface PaymentInfoBlockProps {
  paymentInfo: PaymentInfo
  ocrNumber: string
  amountToPay: number
  totalWithFees: number
  isOverdue: boolean
}

/**
 * Mörkt betalningsinformations-kort (Bankgiro, Plusgiro, Swish, Bankkonto, OCR, Att betala).
 * Extraherat från InvoiceDetail-vyn vid komponent-splitten — INGEN visuell ändring.
 */
export default function PaymentInfoBlock({
  paymentInfo,
  ocrNumber,
  amountToPay,
  totalWithFees,
  isOverdue,
}: PaymentInfoBlockProps) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 text-white">
      <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-3">Betalningsinformation</h4>
      <div className="grid grid-cols-2 gap-3">
        {paymentInfo.bankgiro && (
          <div>
            <p className="text-xs text-gray-400">Bankgiro</p>
            <p className="text-base font-semibold text-primary-600">{paymentInfo.bankgiro}</p>
          </div>
        )}
        {paymentInfo.plusgiro && (
          <div>
            <p className="text-xs text-gray-400">Plusgiro</p>
            <p className="text-base font-semibold text-primary-600">{paymentInfo.plusgiro}</p>
          </div>
        )}
        {paymentInfo.swish && (
          <div>
            <p className="text-xs text-gray-400">Swish</p>
            <p className="text-base font-semibold text-primary-600">{paymentInfo.swish}</p>
          </div>
        )}
        {paymentInfo.bank_account && (
          <div>
            <p className="text-xs text-gray-400">Bankkonto</p>
            <p className="text-base font-semibold text-primary-600">{paymentInfo.bank_account}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-400">OCR-nummer</p>
          <p className="text-base font-mono font-semibold text-primary-600">{ocrNumber}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Att betala</p>
          <p className="text-base font-semibold text-primary-600">
            {formatCurrency(isOverdue ? totalWithFees : amountToPay)}
          </p>
        </div>
      </div>
    </div>
  )
}
