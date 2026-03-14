'use client'

import { useEffect, useState } from 'react'
import { Gift, Copy, Check, Users, ArrowRight, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

interface ReferralData {
  code: string
  referral_url: string
  referral_count: number
}

interface ReferralEvent {
  id: string
  referred_email: string
  status: string
  created_at: string
}

export default function ReferralPage() {
  const business = useBusiness()
  const [data, setData] = useState<ReferralData | null>(null)
  const [referrals, setReferrals] = useState<ReferralEvent[]>([])
  const [hasPendingDiscount, setHasPendingDiscount] = useState(false)
  const [copied, setCopied] = useState<'link' | 'sms' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        // Hämta referralkod
        const res = await fetch('/api/referral')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }

        // Hämta referral-historik
        if (business.business_id) {
          const { data: refs } = await supabase
            .from('referrals')
            .select('id, referred_email, status, created_at')
            .eq('referrer_business_id', business.business_id)
            .order('created_at', { ascending: false })

          setReferrals(refs || [])

          // Kolla pending rabatt
          const { data: settings } = await supabase
            .from('v3_automation_settings')
            .select('referral_discount_pending')
            .eq('business_id', business.business_id)
            .single()

          if (settings?.referral_discount_pending) {
            const discount = settings.referral_discount_pending as { expires_at: string }
            if (new Date(discount.expires_at) > new Date()) {
              setHasPendingDiscount(true)
            }
          }
        }
      } catch (err) {
        console.error('Referral fetch failed:', err)
      }
      setLoading(false)
    }

    fetchData()
  }, [business.business_id])

  function copyToClipboard(text: string, type: 'link' | 'sms') {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const activeCount = referrals.filter(r => r.status === 'active' || r.status === 'rewarded').length
  const pendingCount = referrals.filter(r => r.status === 'pending').length

  const smsMessage = data
    ? `Hej! Jag använder Handymate för att sköta mitt företags administration med AI. Prova gratis: ${data.referral_url}`
    : ''

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-teal-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Bjud in en kollega</h1>
        <p className="text-zinc-500 mt-1">
          Dela din länk och få 50% rabatt på nästa månads faktura när din kollega aktiverar sitt konto.
        </p>
      </div>

      {/* Pending rabatt */}
      {hasPendingDiscount && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <Gift className="h-6 w-6 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Du har en 50% rabatt på nästa faktura!</p>
            <p className="text-sm text-emerald-600">Rabatten appliceras automatiskt.</p>
          </div>
        </div>
      )}

      {/* Referrallänk */}
      {data && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-zinc-900">Din unika länk</h2>

          <div className="flex items-center gap-2">
            <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3 font-mono text-sm text-zinc-700 truncate">
              {data.referral_url}
            </div>
            <button
              onClick={() => copyToClipboard(data.referral_url, 'link')}
              className="flex items-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              {copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === 'link' ? 'Kopierad!' : 'Kopiera'}
            </button>
          </div>

          {/* Förifyllt SMS */}
          <div>
            <h3 className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Förifyllt SMS
            </h3>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm text-zinc-600">
              {smsMessage}
            </div>
            <button
              onClick={() => copyToClipboard(smsMessage, 'sms')}
              className="mt-2 text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              {copied === 'sms' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'sms' ? 'Kopierad!' : 'Kopiera SMS-text'}
            </button>
          </div>
        </div>
      )}

      {/* Statistik */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-zinc-900">{referrals.length}</div>
          <div className="text-sm text-zinc-500 mt-1">Hänvisade kollegor</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-teal-600">{activeCount}</div>
          <div className="text-sm text-zinc-500 mt-1">Har aktiverat</div>
        </div>
      </div>

      {/* Referral-lista */}
      {referrals.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-400" />
            <h2 className="font-semibold text-zinc-900 text-sm">Dina hänvisningar</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {referrals.map(ref => (
              <div key={ref.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-900">
                    {ref.referred_email || 'Okänd e-post'}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {new Date(ref.created_at).toLocaleDateString('sv-SE')}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  ref.status === 'rewarded' || ref.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}>
                  {ref.status === 'rewarded' ? 'Aktiverad' : ref.status === 'active' ? 'Aktiv' : 'Väntar'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hur det fungerar */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">Så fungerar det</h2>
        <div className="space-y-3">
          {[
            'Dela din unika länk med en kollega',
            'Din kollega registrerar sig och provar Handymate',
            'När kollegan aktiverar sin prenumeration får du 50% rabatt på nästa faktura',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-xs font-bold">
                {i + 1}
              </div>
              <p className="text-sm text-zinc-600 pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
