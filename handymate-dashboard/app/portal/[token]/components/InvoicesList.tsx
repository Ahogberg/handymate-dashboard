'use client'

import { ChevronRight, Receipt } from 'lucide-react'
import { formatDate, formatCurrency, getInvoiceStatusText, getInvoiceStatusColor } from '../helpers'
import type { Invoice } from '../types'

interface InvoicesListProps {
  invoices: Invoice[]
  onSelectInvoice: (id: string) => void
}

/**
 * Fakturalista (rendered när activeTab === 'invoices' && !selectedInvoice).
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 */
export default function InvoicesList({ invoices, onSelectInvoice }: InvoicesListProps) {
  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p>Inga fakturor just nu.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {invoices.map(inv => {
        const amountToPay = inv.customer_pays || inv.total
        const daysUntilDue = Math.ceil((new Date(inv.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        return (
          <button
            key={inv.invoice_id}
            onClick={() => onSelectInvoice(inv.invoice_id)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-primary-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-gray-900">Faktura #{inv.invoice_number}</h3>
                {inv.is_credit_note && (
                  <span className="text-xs text-red-600 font-medium">Kreditfaktura</span>
                )}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${getInvoiceStatusColor(inv.status)}`}>
                {getInvoiceStatusText(inv.status)}
              </span>
            </div>
            <div className="text-sm text-gray-500 mb-2">
              {inv.status === 'paid' && inv.paid_at
                ? `Betald: ${formatDate(inv.paid_at)}`
                : inv.status === 'overdue'
                  ? `${Math.abs(daysUntilDue)} dagar forsenad`
                  : `Forfaller: ${formatDate(inv.due_date)}`
              }
              {inv.reminder_count ? ` | ${inv.reminder_count} paminnelse${inv.reminder_count > 1 ? 'r' : ''}` : ''}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(amountToPay)}</p>
                {inv.rot_rut_type && inv.rot_rut_deduction && (
                  <p className="text-xs text-emerald-600">efter {inv.rot_rut_type.toUpperCase()}-avdrag ({formatCurrency(inv.rot_rut_deduction)})</p>
                )}
              </div>
              <span className="text-sm text-sky-700 flex items-center gap-1">
                Detaljer <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
