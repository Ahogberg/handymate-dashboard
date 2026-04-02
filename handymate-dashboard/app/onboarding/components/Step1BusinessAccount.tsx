'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, ArrowRight, Building2, User, Mail, Lock, Phone, MapPin } from 'lucide-react'
import { BRANCHES } from '../constants'
import type { SignupFormData } from '../types'

interface Step1Props {
  onComplete: (
    businessId: string,
    emailPending: boolean,
    formData: { business_name: string; branch: string; contact_name: string; contact_email: string; phone_number: string }
  ) => void
}

export default function Step1BusinessAccount({ onComplete }: Step1Props) {
  const searchParams = useSearchParams()
  const refCode = searchParams?.get('ref') || ''
  const [form, setForm] = useState<SignupFormData>({
    business_name: '',
    display_name: '',
    contact_name: '',
    email: '',
    phone: '',
    branch: '',
    service_area: '',
    password: '',
    password_confirm: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const formatPhone = (value: string) => {
    let digits = value.replace(/\D/g, '')
    if (digits.startsWith('0')) digits = '46' + digits.substring(1)
    if (!digits.startsWith('46') && digits.length > 0) digits = '46' + digits
    if (digits.length === 0) return ''
    if (digits.length <= 2) return '+' + digits
    if (digits.length <= 4) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2)
    if (digits.length <= 7) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4)
    return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4, 7) + ' ' + digits.substring(7, 9) + ' ' + digits.substring(9, 11)
  }

  const getCleanPhone = () => '+' + form.phone.replace(/\D/g, '')

  const handleSubmit = async () => {
    setError('')

    if (!form.business_name || !form.contact_name || !form.email || !form.phone || !form.branch || !form.password) {
      setError('Alla obligatoriska fält måste fyllas i')
      return
    }

    if (form.password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken')
      return
    }

    if (form.password !== form.password_confirm) {
      setError('Lösenorden matchar inte')
      return
    }

    const cleanPhone = getCleanPhone()
    if (cleanPhone.length < 12) {
      setError('Ange ett giltigt telefonnummer')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          data: {
            email: form.email,
            password: form.password,
            businessName: form.business_name,
            displayName: form.display_name || form.business_name,
            contactName: form.contact_name,
            phone: cleanPhone,
            branch: form.branch,
            serviceArea: form.service_area,
            referralCode: refCode || undefined,
          }
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Något gick fel')

      onComplete(result.businessId, result.emailConfirmationPending || false, {
        business_name: form.business_name,
        branch: form.branch,
        contact_name: form.contact_name,
        contact_email: form.email,
        phone_number: cleanPhone,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel')
    }

    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Skapa ditt konto</h1>
        <p className="text-gray-500 mt-2">Steg 1 av 7 — Företagsinformation & konto</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Business Info */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary-700" />
          Företagsinformation
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Företagsnamn *</label>
            <input
              type="text"
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
              placeholder="T.ex. Anderssons El AB"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Visningsnamn</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
              placeholder="Kort namn för SMS & samtal"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-500 mb-2">Bransch *</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {BRANCHES.map((b) => (
              <button
                key={b.value}
                onClick={() => setForm({ ...form, branch: b.value })}
                className={`px-3 py-2.5 rounded-xl border text-sm transition-all ${
                  form.branch === b.value
                    ? 'bg-primary-50 border-primary-600 text-primary-700 font-medium'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="mr-1.5">{b.icon}</span>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> Serviceområde
          </label>
          <input
            type="text"
            value={form.service_area}
            onChange={(e) => setForm({ ...form, service_area: e.target.value })}
            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
            placeholder="T.ex. Stockholm, Södertälje, Nynäshamn"
          />
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <User className="w-5 h-5 text-primary-700" />
          Kontouppgifter
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Kontaktperson *</label>
            <input
              type="text"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
              placeholder="Ditt namn"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> Telefon *
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
              placeholder="+46 70 123 45 67"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> E-post *
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
            placeholder="din@email.se"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Lösenord *
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
              placeholder="Minst 6 tecken"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Bekräfta lösenord *</label>
            <input
              type="password"
              value={form.password_confirm}
              onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
              placeholder="Skriv lösenordet igen"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
        <p className="text-gray-400 text-sm text-center">
          30 dagars pengarna-tillbaka-garanti. Inga frågor.
        </p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3 bg-primary-700 hover:bg-primary-700 text-gray-900 rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Skapa konto <ArrowRight className="w-5 h-5" /></>}
      </button>

      <p className="text-center text-sm text-gray-400">
        Har du redan ett konto? <a href="/login" className="text-primary-700 hover:underline">Logga in</a>
      </p>
    </div>
  )
}
