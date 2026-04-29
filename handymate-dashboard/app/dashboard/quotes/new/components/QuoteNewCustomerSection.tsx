'use client'

import { ClipboardList, User } from 'lucide-react'
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

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'

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
              className={INPUT_CLS}
            >
              <option value="">Välj kund…</option>
              {customers.map(c => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.name} — {c.phone_number}
                </option>
              ))}
            </select>
            {customerPriceListInfo && (
              <div className="mt-3 bg-primary-50 border border-primary-100 rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <ClipboardList className="w-3.5 h-3.5 text-primary-700 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-primary-800 leading-relaxed">
                    Prislista: <strong className="font-semibold">{customerPriceListInfo.name}</strong>
                    {customerPriceListInfo.segment && ` · ${customerPriceListInfo.segment}`}
                    {customerPriceListInfo.contractType && ` · ${customerPriceListInfo.contractType}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-primary-700 pl-5">
                  {customerPriceListInfo.hourlyRate ? <span>Timpris: {customerPriceListInfo.hourlyRate} kr</span> : null}
                  {customerPriceListInfo.materialMarkup ? <span>Materialpåslag: {customerPriceListInfo.materialMarkup}%</span> : null}
                  {customerPriceListInfo.calloutFee ? <span>Utryckning: {customerPriceListInfo.calloutFee} kr</span> : null}
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
                    className="ml-5 text-xs font-semibold text-primary-700 hover:text-primary-600 underline underline-offset-2"
                  >
                    Lägg till {customerPriceListInfo.items.length} poster från prislistan
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Giltighetstid
            </label>
            <select
              value={validDays}
              onChange={e => setValidDays(parseInt(e.target.value))}
              className={INPUT_CLS}
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
            className={INPUT_CLS}
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
            className={`${INPUT_CLS} resize-y leading-relaxed`}
          />
        </div>
      </div>
    </div>
  )
}
