'use client'

import { Building2, Home, Loader2, User, X } from 'lucide-react'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import type { Customer, CustomerForm, PricingOption } from './types'

interface CustomerModalProps {
  open: boolean
  editingCustomer: Customer | null
  form: CustomerForm
  setForm: (f: CustomerForm) => void
  pricingSegments: PricingOption[]
  pricingContractTypes: PricingOption[]
  pricingPriceLists: PricingOption[]
  actionLoading: boolean
  onClose: () => void
  onSubmit: () => void
}

/**
 * Stor formulär-modal för att skapa eller redigera en kund. Hanterar tre
 * kundtyper (privat / företag / brf) med villkorade fält per typ.
 */
export function CustomerModal({
  open,
  editingCustomer,
  form,
  setForm,
  pricingSegments,
  pricingContractTypes,
  pricingPriceLists,
  actionLoading,
  onClose,
  onSubmit,
}: CustomerModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-t-2xl sm:rounded-xl p-6 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {editingCustomer ? 'Redigera kund' : 'Ny kund'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-2">Kundtyp</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'private', label: 'Privatperson', icon: User },
                  { value: 'company', label: 'Företag', icon: Building2 },
                  { value: 'brf', label: 'BRF', icon: Home },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm({ ...form, customer_type: value })}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm font-medium transition-all min-h-[44px] ${
                    form.customer_type === value
                      ? 'bg-primary-50 border-primary-500 text-primary-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">
              {form.customer_type === 'private'
                ? 'Namn *'
                : form.customer_type === 'company'
                ? 'Företagsnamn *'
                : 'Föreningsnamn *'}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
            />
          </div>

          {(form.customer_type === 'company' || form.customer_type === 'brf') && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Organisationsnummer</label>
              <input
                type="text"
                value={form.org_number}
                onChange={e => setForm({ ...form, org_number: e.target.value })}
                placeholder="XXXXXX-XXXX"
                className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          )}

          {(form.customer_type === 'company' || form.customer_type === 'brf') && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Kontaktperson</label>
              <input
                type="text"
                value={form.contact_person}
                onChange={e => setForm({ ...form, contact_person: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-500 mb-1">Telefon *</label>
            <input
              type="tel"
              value={form.phone_number}
              onChange={e => setForm({ ...form, phone_number: e.target.value })}
              placeholder="+46..."
              className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">E-post</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Adress</label>
            <AddressAutocomplete
              value={form.address_line}
              onChange={val => setForm({ ...form, address_line: val })}
              onSelect={r => setForm({ ...form, address_line: r.full_address })}
              placeholder="Sök adress..."
              className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
            />
          </div>

          {(form.customer_type === 'company' || form.customer_type === 'brf') && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Referens / Er märkning</label>
              <input
                type="text"
                value={form.reference}
                onChange={e => setForm({ ...form, reference: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          )}

          {(form.customer_type === 'company' || form.customer_type === 'brf') && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Fakturaadress</label>
              <input
                type="text"
                value={form.invoice_address}
                onChange={e => setForm({ ...form, invoice_address: e.target.value })}
                placeholder="Om annan än besöksadress"
                className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          )}

          {form.customer_type === 'brf' && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Antal lägenheter</label>
              <input
                type="number"
                value={form.apartment_count}
                onChange={e => setForm({ ...form, apartment_count: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          )}

          {form.customer_type === 'private' && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Personnummer</label>
              <input
                type="text"
                value={form.personal_number}
                onChange={e => setForm({ ...form, personal_number: e.target.value })}
                placeholder="YYYYMMDD-XXXX"
                className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
              <p className="text-xs text-gray-400 mt-1">Krävs för ROT/RUT-avdrag</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Betalningsvillkor</label>
              <select
                value={form.default_payment_days}
                onChange={e => setForm({ ...form, default_payment_days: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
              >
                <option value="10">10 dagar</option>
                <option value="15">15 dagar</option>
                <option value="20">20 dagar</option>
                <option value="30">30 dagar</option>
                <option value="45">45 dagar</option>
                <option value="60">60 dagar</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.invoice_email}
                  onChange={e => setForm({ ...form, invoice_email: e.target.checked })}
                  className="rounded border-gray-300 text-primary-700 focus:ring-primary-600"
                />
                <span className="text-sm text-gray-600">Skicka faktura via e-post</span>
              </label>
            </div>
          </div>

          {pricingSegments.length > 0 && (
            <div className="grid grid-cols-1 gap-3 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Kundtyp / Segment</label>
                <select
                  value={form.segment_id}
                  onChange={e => {
                    const segId = e.target.value
                    const suggested = pricingPriceLists.find(pl => pl.segment_id === segId)
                    if (suggested) {
                      setForm({ ...form, segment_id: segId, price_list_id: suggested.id })
                    } else {
                      setForm({ ...form, segment_id: segId })
                    }
                  }}
                  className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                >
                  <option value="">Välj segment...</option>
                  {pricingSegments.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Avtalsform</label>
                <select
                  value={form.contract_type_id}
                  onChange={e => setForm({ ...form, contract_type_id: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                >
                  <option value="">Välj avtalsform...</option>
                  {pricingContractTypes.map(ct => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Prislista</label>
                <select
                  value={form.price_list_id}
                  onChange={e => setForm({ ...form, price_list_id: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                >
                  <option value="">Välj prislista...</option>
                  {pricingPriceLists.map(pl => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </select>
                {form.price_list_id && form.segment_id && (
                  <p className="text-xs text-gray-400 mt-1">Auto-vald baserat på segment</p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-500 mb-1">Fastighetsbeteckning</label>
            <input
              type="text"
              value={form.property_designation}
              onChange={e => setForm({ ...form, property_designation: e.target.value })}
              placeholder="T.ex. Stockholm Söder 1:23"
              className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
            />
            <p className="text-xs text-gray-400 mt-1">Krävs för ROT-avdrag</p>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-900">
            Avbryt
          </button>
          <button
            onClick={onSubmit}
            disabled={actionLoading}
            className="flex items-center px-4 py-2 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingCustomer ? 'Spara' : 'Skapa'}
          </button>
        </div>
      </div>
    </div>
  )
}
