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

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'

const LABEL_CLS = 'block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5'

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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="font-heading text-lg font-bold text-slate-900 tracking-tight">
            {editingCustomer ? 'Redigera kund' : 'Ny kund'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Stäng"
            className="p-1.5 -m-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className={LABEL_CLS}>Kundtyp</label>
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
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-colors ${
                    form.customer_type === value
                      ? 'bg-primary-50 border-primary-700 text-primary-700 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>
              {form.customer_type === 'private'
                ? 'Namn '
                : form.customer_type === 'company'
                ? 'Företagsnamn '
                : 'Föreningsnamn '}
              <span className="text-red-600 normal-case font-medium">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className={INPUT_CLS}
            />
          </div>

          {(form.customer_type === 'company' || form.customer_type === 'brf') && (
            <>
              <div>
                <label className={LABEL_CLS}>Organisationsnummer</label>
                <input
                  type="text"
                  value={form.org_number}
                  onChange={e => setForm({ ...form, org_number: e.target.value })}
                  placeholder="XXXXXX-XXXX"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Kontaktperson</label>
                <input
                  type="text"
                  value={form.contact_person}
                  onChange={e => setForm({ ...form, contact_person: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
            </>
          )}

          <div>
            <label className={LABEL_CLS}>
              Telefon <span className="text-red-600 normal-case font-medium">*</span>
            </label>
            <input
              type="tel"
              value={form.phone_number}
              onChange={e => setForm({ ...form, phone_number: e.target.value })}
              placeholder="+46…"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>E-post</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Adress</label>
            <AddressAutocomplete
              value={form.address_line}
              onChange={val => setForm({ ...form, address_line: val })}
              onSelect={r => setForm({ ...form, address_line: r.full_address })}
              placeholder="Sök adress…"
              className={INPUT_CLS}
            />
          </div>

          {(form.customer_type === 'company' || form.customer_type === 'brf') && (
            <>
              <div>
                <label className={LABEL_CLS}>Referens / Er märkning</label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={e => setForm({ ...form, reference: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Fakturaadress</label>
                <input
                  type="text"
                  value={form.invoice_address}
                  onChange={e => setForm({ ...form, invoice_address: e.target.value })}
                  placeholder="Om annan än besöksadress"
                  className={INPUT_CLS}
                />
              </div>
            </>
          )}

          {form.customer_type === 'brf' && (
            <div>
              <label className={LABEL_CLS}>Antal lägenheter</label>
              <input
                type="number"
                value={form.apartment_count}
                onChange={e => setForm({ ...form, apartment_count: e.target.value })}
                className={INPUT_CLS}
              />
            </div>
          )}

          {form.customer_type === 'private' && (
            <div>
              <label className={LABEL_CLS}>Personnummer</label>
              <input
                type="text"
                value={form.personal_number}
                onChange={e => setForm({ ...form, personal_number: e.target.value })}
                placeholder="YYYYMMDD-XXXX"
                className={INPUT_CLS}
              />
              <p className="text-[11px] text-slate-400 mt-1">Krävs för ROT/RUT-avdrag</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className={LABEL_CLS}>Betalningsvillkor</label>
              <select
                value={form.default_payment_days}
                onChange={e => setForm({ ...form, default_payment_days: e.target.value })}
                className={INPUT_CLS}
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
                  className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-2 focus:ring-primary-100"
                />
                <span className="text-xs text-slate-700">Skicka faktura via e-post</span>
              </label>
            </div>
          </div>

          {pricingSegments.length > 0 && (
            <div className="grid grid-cols-1 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className={LABEL_CLS}>Kundtyp / Segment</label>
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
                  className={INPUT_CLS}
                >
                  <option value="">Välj segment…</option>
                  {pricingSegments.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Avtalsform</label>
                <select
                  value={form.contract_type_id}
                  onChange={e => setForm({ ...form, contract_type_id: e.target.value })}
                  className={INPUT_CLS}
                >
                  <option value="">Välj avtalsform…</option>
                  {pricingContractTypes.map(ct => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Prislista</label>
                <select
                  value={form.price_list_id}
                  onChange={e => setForm({ ...form, price_list_id: e.target.value })}
                  className={INPUT_CLS}
                >
                  <option value="">Välj prislista…</option>
                  {pricingPriceLists.map(pl => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </select>
                {form.price_list_id && form.segment_id && (
                  <p className="text-[11px] text-slate-400 mt-1">Auto-vald baserat på segment</p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className={LABEL_CLS}>Fastighetsbeteckning</label>
            <input
              type="text"
              value={form.property_designation}
              onChange={e => setForm({ ...form, property_designation: e.target.value })}
              placeholder="T.ex. Stockholm Söder 1:23"
              className={INPUT_CLS}
            />
            <p className="text-[11px] text-slate-400 mt-1">Krävs för ROT-avdrag</p>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={onSubmit}
            disabled={actionLoading}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingCustomer ? 'Spara' : 'Skapa'}
          </button>
        </div>
      </div>
    </div>
  )
}
