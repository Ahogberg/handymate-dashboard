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
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary-500" />
          Kund
        </h2>
        {quote.customer ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400">Namn</p>
              <p className="text-gray-900">{quote.customer.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Telefon</p>
              <p className="text-gray-900">{quote.customer.phone_number}</p>
            </div>
            {quote.customer.email && (
              <div>
                <p className="text-sm text-gray-400">Email</p>
                <p className="text-gray-900">{quote.customer.email}</p>
              </div>
            )}
            {quote.customer.address_line && (
              <div>
                <p className="text-sm text-gray-400">Adress</p>
                <p className="text-gray-900">{quote.customer.address_line}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400">Ingen kund vald</p>
        )}
      </div>

      {/* Reference fields */}
      {hasReferences && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary-600" />
            Referenser
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quote.reference_person && (
              <div>
                <p className="text-sm text-gray-400">Referensperson</p>
                <p className="text-gray-900">{quote.reference_person}</p>
              </div>
            )}
            {quote.customer_reference && (
              <div>
                <p className="text-sm text-gray-400">Kundreferens</p>
                <p className="text-gray-900">{quote.customer_reference}</p>
              </div>
            )}
            {quote.project_address && (
              <div className="sm:col-span-2">
                <p className="text-sm text-gray-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  Projektadress
                </p>
                <p className="text-gray-900">{quote.project_address}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
