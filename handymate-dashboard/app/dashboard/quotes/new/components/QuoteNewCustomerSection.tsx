'use client'

import { createDefaultItem } from '@/lib/quote-calculations'
import type { QuoteItem } from '@/lib/types/quote'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  personal_number?: string
  property_designation?: string
}

interface CustomerPriceListInfo {
  name: string
  segment?: string
  contractType?: string
  hourlyRate?: number
  materialMarkup?: number
  calloutFee?: number
  items?: { name: string; unit: string; price: number; category_slug?: string; is_rot_eligible?: boolean; is_rut_eligible?: boolean }[]
}

interface QuoteNewCustomerSectionProps {
  customers: Customer[]
  selectedCustomer: string
  setSelectedCustomer: (id: string) => void
  validDays: number
  setValidDays: (n: number) => void
  title: string
  setTitle: (s: string) => void
  description: string
  setDescription: (s: string) => void
  customerPriceListInfo: CustomerPriceListInfo | null
  items: QuoteItem[]
  setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>
}

/**
 * Kund-sektion för new-vyn. Skiljer sig från edit genom att den visar en
 * banner under kundvalet med kundens kopplade prislista (timpris,
 * materialpåslag, snabbknapp för att importera prislisteposter).
 */
export function QuoteNewCustomerSection({
  customers,
  selectedCustomer,
  setSelectedCustomer,
  validDays,
  setValidDays,
  title,
  setTitle,
  description,
  setDescription,
  customerPriceListInfo,
  items,
  setItems,
}: QuoteNewCustomerSectionProps) {
  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
      <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569] mb-4">Kund</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[12px] text-[#64748B] mb-1">Kund *</label>
          <select
            value={selectedCustomer}
            onChange={e => setSelectedCustomer(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600 appearance-auto"
          >
            <option value="">Välj kund...</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.name} — {c.phone_number}
              </option>
            ))}
          </select>
          {customerPriceListInfo && (
            <div className="mt-2 bg-primary-50 border border-[#E2E8F0] rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-primary-700">📋</span>
                <span className="text-primary-800">
                  Prislista: <strong>{customerPriceListInfo.name}</strong>
                  {customerPriceListInfo.segment && ` · ${customerPriceListInfo.segment}`}
                  {customerPriceListInfo.contractType && ` · ${customerPriceListInfo.contractType}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-primary-700">
                {customerPriceListInfo.hourlyRate ? <span>Timpris: {customerPriceListInfo.hourlyRate} kr</span> : null}
                {customerPriceListInfo.materialMarkup ? <span>Materialpåslag: {customerPriceListInfo.materialMarkup}%</span> : null}
                {customerPriceListInfo.calloutFee ? <span>Utryckningsavgift: {customerPriceListInfo.calloutFee} kr</span> : null}
              </div>
              {customerPriceListInfo.items && customerPriceListInfo.items.length > 0 && items.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const newItems = customerPriceListInfo.items!.map((plItem, idx) => ({
                      ...createDefaultItem('item', idx),
                      description: plItem.name,
                      unit: plItem.unit || 'st',
                      unit_price: plItem.price,
                      quantity: 1,
                      total: plItem.price,
                      category_slug: plItem.category_slug || undefined,
                      is_rot_eligible: plItem.is_rot_eligible || false,
                      is_rut_eligible: plItem.is_rut_eligible || false,
                    }))
                    setItems(newItems as any)
                  }}
                  className="text-[11px] text-primary-700 hover:text-primary-800 font-medium underline underline-offset-2"
                >
                  Lägg till {customerPriceListInfo.items.length} poster från prislistan
                </button>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="block text-[12px] text-[#64748B] mb-1">Giltighetstid</label>
          <select
            value={validDays}
            onChange={e => setValidDays(parseInt(e.target.value))}
            className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
          >
            <option value={14}>14 dagar</option>
            <option value={30}>30 dagar</option>
            <option value={60}>60 dagar</option>
            <option value={90}>90 dagar</option>
          </select>
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-[12px] text-[#64748B] mb-1">Titel</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="T.ex. Elinstallation kök"
          className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
        />
      </div>
      <div>
        <label className="block text-[12px] text-[#64748B] mb-1">
          Beskrivning <span className="text-[11px] text-[#CBD5E1]">(valfri)</span>
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Kort beskrivning av jobbet..."
          rows={2}
          className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y"
        />
      </div>
    </div>
  )
}
