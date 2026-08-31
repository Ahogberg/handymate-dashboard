'use client'

import { User } from 'lucide-react'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  personal_number?: string
  property_designation?: string
}

interface QuoteEditCustomerSectionProps {
  customers: Customer[]
  selectedCustomer: string
  setSelectedCustomer: (id: string) => void
  validDays: number
  setValidDays: (n: number) => void
  title: string
  setTitle: (s: string) => void
  description: string
  setDescription: (s: string) => void
}

export function QuoteEditCustomerSection({
  customers,
  selectedCustomer,
  setSelectedCustomer,
  validDays,
  setValidDays,
  title,
  setTitle,
  description,
  setDescription,
}: QuoteEditCustomerSectionProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <User className="w-4.5 h-4.5" />
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">Kund &amp; offertinfo</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Kund <span className="text-red-600 normal-case font-medium">*</span>
            </label>
            <select
              value={selectedCustomer}
              onChange={e => setSelectedCustomer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            >
              <option value="">Välj kund…</option>
              {customers.map(c => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.name} — {c.phone_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Giltighetstid
            </label>
            <select
              value={validDays}
              onChange={e => setValidDays(parseInt(e.target.value))}
              className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            >
              <option value={14}>14 dagar</option>
              <option value={30}>30 dagar</option>
              <option value={60}>60 dagar</option>
              <option value={90}>90 dagar</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Titel</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="T.ex. Elinstallation kök"
            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Beskrivning <span className="normal-case font-medium text-slate-400">(valfri)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Kort beskrivning av jobbet…"
            rows={2}
            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors resize-y leading-relaxed"
          />
        </div>
      </div>
    </div>
  )
}
