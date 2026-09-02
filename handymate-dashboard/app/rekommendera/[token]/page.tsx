'use client'

/**
 * app/rekommendera/[token]/page.tsx — Epic C spel 1
 * (tasks/hanna-sales-engine-v2-spec.md).
 *
 * Publik landningssida för en NÖJD KUNDS personliga rekommendationslänk.
 * Ingen inloggning — vem som helst kunden delar länken med ska kunna
 * fylla i det korta formuläret. Samma anda som app/lead-portal/[code]/page.tsx
 * men medvetet mindre: bara namn, telefon och vad man behöver hjälp med.
 *
 * Token bär vem som rekommenderade (business_id + customer_id,
 * lib/referral/link.ts) — vi visar ALDRIG rekommendörens namn här (ingen
 * anledning att exponera en privatpersons namn på en offentlig sida utan
 * samtycke), bara vilket företag man rekommenderas till.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import type { Attribution } from '@/lib/branding/attribution'
import AttributionStamp from '@/components/branding/AttributionStamp'

interface LinkInfo {
  business_name: string
  logo_url: string | null
  /** "Skickat via Handymate"-stämpeln (lib/branding/attribution.ts). */
  attribution?: Attribution | null
}

export default function ReferralLandingPage() {
  const params = useParams()
  const token = params?.token as string

  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/referral-lead?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        setError('Länken är ogiltig eller har upphört.')
        return
      }
      const json = await res.json()
      setInfo(json)
    } catch {
      setError('Kunde inte ladda sidan. Försök igen senare.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (token) fetchInfo()
  }, [token, fetchInfo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/referral-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: name.trim(),
          phone: phone.trim(),
          message: message.trim() || null,
        }),
      })

      if (res.status === 503) {
        setSubmitError('Den här funktionen aktiveras inom kort. Försök igen lite senare.')
        return
      }
      if (res.status === 404) {
        setError('Länken är ogiltig eller har upphört.')
        return
      }
      if (res.status === 429) {
        setSubmitError('För många försök just nu. Vänta en stund och försök igen.')
        return
      }
      if (!res.ok) {
        setSubmitError('Något gick fel. Försök igen.')
        return
      }

      setSubmitted(true)
    } catch {
      setSubmitError('Något gick fel. Försök igen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-700 mb-2">Länken fungerar inte</h1>
          <p className="text-sm text-gray-500">{error || 'Kunde inte ladda sidan.'}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-xl border border-gray-200 p-8">
          <CheckCircle2 className="w-12 h-12 text-primary-700 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Tack!</h1>
          <p className="text-sm text-gray-500">
            {info.business_name} har fått din förfrågan och hör av sig så snart de kan.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-6 text-center">
          {info.logo_url ? (
            <img src={info.logo_url} alt="" className="w-14 h-14 rounded-lg object-cover mx-auto mb-3" />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-primary-700 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">
              {info.business_name.charAt(0)}
            </div>
          )}
          <h1 className="text-lg font-bold text-gray-900">{info.business_name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Du har blivit rekommenderad att kontakta {info.business_name}. Fyll i dina uppgifter så hör de av sig.
          </p>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Namn *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
              placeholder="Ditt namn"
              autoComplete="name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefon *</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
              placeholder="0701234567"
              autoComplete="tel"
              inputMode="tel"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vad behöver du hjälp med?</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none resize-none"
              placeholder="Beskriv kort vad du behöver hjälp med (frivilligt)"
            />
          </div>

          {submitError && (
            <p className="text-sm text-red-600">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={!name.trim() || !phone.trim() || submitting}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary-700 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Skicka
          </button>
        </form>

        <AttributionStamp attribution={info.attribution} className="mt-6 text-center text-xs text-gray-400" linkClassName="font-medium" />
      </div>
    </div>
  )
}
