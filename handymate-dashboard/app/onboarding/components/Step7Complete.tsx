'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Rocket, Phone, Calendar, Users, Briefcase } from 'lucide-react'
import type { OnboardingData } from '../types'

interface Step7Props {
  data: OnboardingData
  onNext?: () => void
}

export default function Step7Complete({ data, onNext }: Step7Props) {
  const router = useRouter()
  const [finalizing, setFinalizing] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleFinalize = async () => {
    setFinalizing(true)
    setError('')

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: data.business_name,
          contact_name: data.contact_name,
          contact_email: data.contact_email,
          phone_number: data.phone_number,
          branch: data.branch,
          org_number: data.org_number,
          address: data.address,
          service_area: data.service_area,
          services_offered: data.services_offered,
          default_hourly_rate: data.default_hourly_rate,
          callout_fee: data.callout_fee,
          rot_enabled: data.rot_enabled,
          rut_enabled: data.rut_enabled,
          lead_sources: data.lead_sources,
          knowledge_base: data.knowledge_base,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kunde inte slutföra')

      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel')
    }

    setFinalizing(false)
  }

  const completionItems = [
    { label: 'Företag & konto', done: true, icon: CheckCircle2 },
    { label: 'Tjänster & priser', done: (data.services_offered?.length || 0) > 0, icon: Briefcase },
    { label: 'Telefon', done: !!data.assigned_phone_number, icon: Phone },
  ]

  if (done) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 bg-teal-600 hover:bg-teal-700 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
          <Rocket className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Välkommen till Handymate!</h1>
        <p className="text-zinc-400 text-lg mb-8">Allt är klart. Din AI-assistent är redo att hjälpa dig.</p>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-8 max-w-md mx-auto">
          <p className="text-sm text-zinc-400 mb-2">Gratis provperiod</p>
          <p className="text-2xl font-bold text-white">14 dagar kvar</p>
          <p className="text-xs text-zinc-500 mt-1">Inget betalkort behövs under provperioden</p>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium hover:opacity-90 text-lg"
        >
          Gå till Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Allt klart!</h1>
        <p className="text-zinc-400 mt-2">Sammanfattning och aktivering</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}

      {/* Summary */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Sammanfattning</h2>

        <div className="space-y-3">
          {completionItems.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  item.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={item.done ? 'text-white' : 'text-zinc-500'}>
                  {item.label}
                </span>
                {item.done ? (
                  <span className="text-emerald-400 text-sm ml-auto">Klart</span>
                ) : (
                  <span className="text-zinc-500 text-sm ml-auto">Hoppad över</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Business summary */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">Företag</span>
            <p className="text-white font-medium">{data.business_name}</p>
          </div>
          <div>
            <span className="text-zinc-500">Kontakt</span>
            <p className="text-white font-medium">{data.contact_name}</p>
          </div>
          <div>
            <span className="text-zinc-500">Timpris</span>
            <p className="text-white font-medium">{data.default_hourly_rate || '–'} kr/h</p>
          </div>
          <div>
            <span className="text-zinc-500">Telefon</span>
            <p className="text-white font-medium">{data.assigned_phone_number || 'Ej konfigurerad'}</p>
          </div>
        </div>
      </div>

      {/* What happens next */}
      <div className="bg-teal-500/5 border border-teal-500/20 rounded-xl p-6">
        <h3 className="text-white font-medium mb-2">Vad händer nu?</h3>
        <ul className="text-sm text-zinc-400 space-y-1">
          <li>• Vi skapar din AI-kunskapsbas baserad på din bransch</li>
          <li>• Standardchecklistor och offertmallar konfigureras</li>
          <li>• Pipeline och automationsregler aktiveras</li>
          <li>• Du kan börja ta emot samtal och skapa offerter direkt</li>
        </ul>
      </div>

      <button
        onClick={handleFinalize}
        disabled={finalizing}
        className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium text-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {finalizing ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Aktiverar...</>
        ) : (
          <><Rocket className="w-5 h-5" /> Aktivera Handymate</>
        )}
      </button>
    </div>
  )
}
