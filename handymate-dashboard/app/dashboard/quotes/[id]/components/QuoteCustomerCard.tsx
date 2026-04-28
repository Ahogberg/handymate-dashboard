'use client'

import { ClipboardList, MapPin, User } from 'lucide-react'
import type { Quote } from '../types'

interface QuoteCustomerCardProps {
  quote: Quote
}

export function QuoteCustomerCard({ quote }: QuoteCustomerCardProps) {
  const hasReferences = !!(quote.reference_person || quote.customer_reference || quote.project_address)

  return (
    <>
      {/* Customer */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
            <User className="w-4.5 h-4.5" />
          </div>
          <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">Kund</h2>
        </div>
        {quote.customer ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Namn" value={quote.customer.name} />
            <Field label="Telefon" value={quote.customer.phone_number} />
            {quote.customer.email && <Field label="Email" value={quote.customer.email} />}
            {quote.customer.address_line && <Field label="Adress" value={quote.customer.address_line} />}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Ingen kund vald</p>
        )}
      </div>

      {/* Reference fields */}
      {hasReferences && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-4.5 h-4.5" />
            </div>
            <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">Referenser</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {quote.reference_person && <Field label="Referensperson" value={quote.reference_person} />}
            {quote.customer_reference && <Field label="Kundreferens" value={quote.customer_reference} />}
            {quote.project_address && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Projektadress
                </p>
                <p className="text-sm text-slate-900">{quote.project_address}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-900 break-words">{value}</p>
    </div>
  )
}
