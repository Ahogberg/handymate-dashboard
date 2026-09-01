'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, ReceiptText } from 'lucide-react'
import type { PartnerBillingProfile } from './types'

interface Props {
  profile: PartnerBillingProfile
  complete: boolean
  onSaved: () => Promise<void>
}

export default function BillingProfileCard({ profile, complete, onSaved }: Props) {
  const [form, setForm] = useState({
    legal_name: '', organization_number: '', registered_address: '', vat_number: '',
    vat_registered: true, vat_rate: '0.25', f_tax_approved: true, email: '',
    bankgiro: '', plusgiro: '', account: '',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setForm({
      legal_name: profile.self_billing_legal_name || '',
      organization_number: profile.self_billing_org_number || '',
      registered_address: profile.self_billing_registered_address || '',
      vat_number: profile.self_billing_vat_number || '',
      vat_registered: profile.self_billing_vat_registered ?? true,
      vat_rate: String(profile.self_billing_vat_rate ?? 0.25),
      f_tax_approved: profile.self_billing_f_tax_approved ?? true,
      email: profile.self_billing_email || '',
      bankgiro: profile.payout_bankgiro || '',
      plusgiro: profile.payout_plusgiro || '',
      account: profile.payout_account || '',
    })
  }, [profile])

  function field(key: keyof typeof form, value: string | boolean) {
    setForm(current => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/partners/billing-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, vat_rate: Number(form.vat_rate) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte spara')
      setMessage('Fakturauppgifterna är sparade.')
      await onSaved()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunde inte spara')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100'

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex gap-3">
          <span className="mt-0.5 rounded-lg bg-primary-50 p-2"><ReceiptText className="w-5 h-5 text-primary-700" /></span>
          <div>
            <h2 className="font-semibold text-gray-900">Fakturauppgifter för självfakturering</h2>
            <p className="text-sm text-gray-500 mt-1">Handymate skapar fakturan i ditt namn. Uppgifterna fryses i varje underlag.</p>
          </div>
        </div>
        {complete && <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full"><CheckCircle2 className="w-3.5 h-3.5" /> Komplett</span>}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <input className={inputClass} value={form.legal_name} onChange={e => field('legal_name', e.target.value)} placeholder="Juridiskt företagsnamn" />
        <input className={inputClass} value={form.organization_number} onChange={e => field('organization_number', e.target.value)} placeholder="Organisationsnummer" />
        <input className={`${inputClass} sm:col-span-2`} value={form.registered_address} onChange={e => field('registered_address', e.target.value)} placeholder="Registrerad adress" />
        <input className={inputClass} type="email" value={form.email} onChange={e => field('email', e.target.value)} placeholder="Faktura-e-post" />
        <input className={inputClass} value={form.vat_number} onChange={e => field('vat_number', e.target.value)} placeholder="Momsregistreringsnummer" disabled={!form.vat_registered} />
        <input className={inputClass} value={form.bankgiro} onChange={e => field('bankgiro', e.target.value)} placeholder="Bankgiro" />
        <input className={inputClass} value={form.plusgiro} onChange={e => field('plusgiro', e.target.value)} placeholder="Plusgiro" />
        <input className={`${inputClass} sm:col-span-2`} value={form.account} onChange={e => field('account', e.target.value)} placeholder="Bankkonto (om bank-/plusgiro saknas)" />
      </div>

      <div className="flex flex-wrap gap-5 mt-4 text-sm text-gray-700">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.vat_registered} onChange={e => field('vat_registered', e.target.checked)} /> Momsregistrerad</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.f_tax_approved} onChange={e => field('f_tax_approved', e.target.checked)} /> Godkänd för F-skatt</label>
        {form.vat_registered && (
          <label className="inline-flex items-center gap-2">Momssats
            <select className="rounded border border-gray-200 px-2 py-1" value={form.vat_rate} onChange={e => field('vat_rate', e.target.value)}>
              <option value="0.25">25 %</option><option value="0.12">12 %</option><option value="0.06">6 %</option><option value="0">0 %</option>
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-5">
        <p className={`text-sm ${message?.includes('sparade') ? 'text-green-700' : 'text-red-600'}`}>{message}</p>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Sparar…' : 'Spara uppgifter'}
        </button>
      </div>
    </section>
  )
}

