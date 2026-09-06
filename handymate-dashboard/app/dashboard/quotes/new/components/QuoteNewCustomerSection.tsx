'use client'

import { useState } from 'react'
import { formatKronor } from '@/lib/format-price'
import { AlertTriangle, ClipboardList, User } from 'lucide-react'
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
  onCustomerCreated?: (customer: Customer) => void
  setSelectedCustomer: (id: string) => void
  /** @deprecated Giltighetstiden sätts i dokumentet ("Giltig till"-datumet).
      Propparna finns kvar för anropskompatibilitet men används inte längre. */
  validDays?: number
  setValidDays?: (n: number) => void
  title: string
  setTitle: (s: string) => void
  description: string
  setDescription: (s: string) => void
  customerPriceListInfo: CustomerPriceListInfo | null
  items: QuoteItem[]
  setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>
  hasItems: boolean
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
  onCustomerCreated,
  setSelectedCustomer,
  title,
  setTitle,
  description,
  setDescription,
  customerPriceListInfo,
  items,
  setItems,
  hasItems,
}: QuoteNewCustomerSectionProps) {
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerSaving, setCustomerSaving] = useState(false)
  const [customerError, setCustomerError] = useState('')

  async function saveCustomer() {
    if (customerSaving || !customerName.trim() || !customerPhone.trim()) return
    setCustomerSaving(true)
    setCustomerError('')
    try {
      const response = await fetch('/api/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customerName.trim(), phone_number: customerPhone.trim(), email: customerEmail.trim() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(response.status >= 500 ? 'Kunden kunde inte sparas. Försök igen om en stund.' : result.message || result.error || 'Kunden kunde inte sparas')
      if (!result.customer?.customer_id) throw new Error('Kunden kunde inte bekräftas. Kontrollera kundregistret innan du försöker igen.')
      onCustomerCreated?.(result.customer)
      setSelectedCustomer(result.customer.customer_id)
      setCreatingCustomer(false)
      setCustomerName(''); setCustomerPhone(''); setCustomerEmail('')
    } catch (error) {
      setCustomerError(error instanceof Error ? error.message : 'Kunden kunde inte sparas')
    } finally { setCustomerSaving(false) }
  }

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
            {onCustomerCreated && (
              <div className="mt-2">
                <button type="button" className="min-h-[44px] text-sm font-semibold text-primary-700" onClick={() => setCreatingCustomer(!creatingCustomer)} disabled={customerSaving}>
                  {creatingCustomer ? 'Stäng kundformuläret' : '+ Skapa ny kund'}
                </button>
                {customers.length === 0 && <p className="text-sm text-gray-500">Skapa din första kund här. Offertens rader och priser ligger kvar.</p>}
                {creatingCustomer && (
                  <form onSubmit={e => { e.preventDefault(); void saveCustomer() }} aria-label="Skapa kund i offerten" className="mt-2 space-y-3 rounded-xl border border-slate-200 p-3">
                    <label className="block text-sm">Namn *<input required className={INPUT_CLS} value={customerName} onChange={e => setCustomerName(e.target.value)} disabled={customerSaving} /></label>
                    <label className="block text-sm">Telefon *<input required type="tel" className={INPUT_CLS} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} disabled={customerSaving} /></label>
                    <label className="block text-sm">E-post<input type="email" className={INPUT_CLS} value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} disabled={customerSaving} /></label>
                    <p className="text-xs text-gray-500">Namn och telefonnummer krävs. Adress och övriga kunduppgifter kan kompletteras i kundregistret.</p>
                    {customerError && <p role="alert" className="text-sm text-red-700">{customerError}</p>}
                    <button type="submit" className="min-h-[44px] rounded-lg bg-primary-700 px-4 text-sm text-white disabled:opacity-50" disabled={customerSaving || !customerName.trim() || !customerPhone.trim()}>
                      {customerSaving ? 'Sparar kunden…' : 'Spara och välj kunden'}
                    </button>
                  </form>
                )}
              </div>
            )}
            {customerPriceListInfo && (
              <div className="mt-3 bg-primary-50 border border-primary-100 rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <ClipboardList className="w-3.5 h-3.5 text-primary-700 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-primary-800 leading-relaxed">
                    Kundens prislista: <strong className="font-semibold">{customerPriceListInfo.name}</strong>
                    {customerPriceListInfo.segment && ` · ${customerPriceListInfo.segment}`}
                    {customerPriceListInfo.contractType && ` · ${customerPriceListInfo.contractType}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-primary-700 pl-5">
                  {customerPriceListInfo.hourlyRate ? <span>Timpris: {formatKronor(customerPriceListInfo.hourlyRate)}</span> : null}
                  {customerPriceListInfo.materialMarkup ? <span>Materialpåslag: {customerPriceListInfo.materialMarkup}%</span> : null}
                  {customerPriceListInfo.calloutFee ? <span>Utryckning: {formatKronor(customerPriceListInfo.calloutFee)}</span> : null}
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
          {/* DUBBLETT BORTTAGEN (2026-08-06): giltighetstiden fanns både här
              och som "Giltig till"-datum i dokumentet. Dokumentet är
              sanningen (masterplanens princip 1) och visar dessutom det
              faktiska datumet i stället för ett antal dagar. */}
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
            Beskrivning <span className="normal-case font-medium text-slate-400">(rekommenderas)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Kort beskrivning av jobbet…"
            rows={2}
            className={`${INPUT_CLS} resize-y leading-relaxed`}
          />
          {!description.trim() && hasItems && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Beskriv vad offerten avser — det är det första kunden läser.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
