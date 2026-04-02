'use client'

import { useState } from 'react'
import { ArrowRight, ArrowLeft, Phone, Lock, Check, X } from 'lucide-react'
import type { StepProps } from '../types'

const CALL_HANDLING_MODES = [
  {
    value: 'agent_fallback',
    label: 'Agenten svarar om jag inte hinner',
    description: 'Din telefon ringer först — om du inte svarar tar agenten vid.',
  },
  {
    value: 'agent_with_transfer',
    label: 'Agenten filtrerar — jag tar vid vid behov',
    description: 'Agenten svarar alltid och kopplar till dig om kunden vill prata direkt.',
  },
  {
    value: 'human_work_hours',
    label: 'Jag svarar under arbetstid',
    description: '07-17 mån-fre ringer din telefon direkt — agenten täcker kvällar och helger.',
  },
]

export default function Step3Phone({ data, onNext, onBack, saving }: StepProps) {
  const [personalPhone, setPersonalPhone] = useState(
    (data as any).personal_phone || data.forward_phone_number || data.phone_number || ''
  )
  const [callHandlingMode, setCallHandlingMode] = useState(
    (data as any).call_handling_mode || 'agent_fallback'
  )
  const [numberChoice, setNumberChoice] = useState<'new' | 'keep'>('new')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [error, setError] = useState('')

  const handleContinue = async () => {
    setPhoneSaving(true)
    setError('')

    try {
      const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const cleanPhone = personalPhone ? '+' + personalPhone.replace(/\D/g, '') : null

      await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          personal_phone: cleanPhone,
          number_strategy: numberChoice,
        }),
      })

      await fetch('/api/automation/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ call_handling_mode: callHandlingMode }),
      })

      onNext()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel')
    }

    setPhoneSaving(false)
  }

  const Feature = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <Check className="w-4 h-4 text-primary-700 shrink-0" />
      ) : (
        <X className="w-4 h-4 text-gray-300 shrink-0" />
      )}
      <span className={ok ? 'text-gray-700' : 'text-gray-400'}>{text}</span>
    </div>
  )

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>
      )}

      {/* Sektion 1 — Reserverat nummer */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center shadow-sm">
        <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Phone className="w-6 h-6 text-primary-700" />
        </div>
        <p className="text-2xl font-bold text-gray-900 tracking-wider mb-1">+4676•••••••</p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 border border-primary-300 rounded-full">
          <Lock className="w-3 h-3 text-primary-700" />
          <span className="text-xs font-medium text-primary-700">Reserverat åt dig</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">Aktiveras automatiskt när du slutför betalningen</p>
      </div>

      {/* Sektion 2 — Vilket nummer ser kunder? */}
      <div className="space-y-3">
        <div>
          <h3 className="text-gray-900 font-semibold">Vilket nummer ser dina kunder?</h3>
          <p className="text-xs text-gray-500 mt-0.5">Det här valet avgör hur mycket av Handymates värde du kan utnyttja.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Kort 1 — Byt till Handymate */}
          <button
            onClick={() => setNumberChoice('new')}
            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
              numberChoice === 'new'
                ? 'border-primary-700 bg-primary-50/50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className="absolute -top-2.5 right-3 bg-primary-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              ⭐ Rekommenderat
            </span>
            <div className="text-xl mb-2">🆕</div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Byt till Handymate-numret</p>
            <p className="text-xs text-gray-500 mb-3">Sätt det här numret på hemsida, visitkort och offerter.</p>
            <div className="space-y-1.5">
              <Feature ok={true} text="Matte svarar på inkommande SMS" />
              <Feature ok={true} text="Utgående SMS-automation" />
              <Feature ok={true} text="Samtalsagent (kommer snart)" />
            </div>
          </button>

          {/* Kort 2 — Behåll befintligt */}
          <button
            onClick={() => setNumberChoice('keep')}
            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
              numberChoice === 'keep'
                ? 'border-primary-700 bg-primary-50/50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-xl mb-2">📱</div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Behåll ditt befintliga nummer</p>
            <p className="text-xs text-gray-500 mb-3">Ditt gamla nummer behålls utåt mot kunder.</p>
            <div className="space-y-1.5">
              <Feature ok={false} text="Matte kan ej svara inkommande SMS" />
              <Feature ok={true} text="Utgående SMS-automation aktiv" />
              <Feature ok={false} text="Samtalsagent ej tillgänglig" />
            </div>
          </button>
        </div>
      </div>

      {/* Sektion 3 — Samtalshantering */}
      <div className={`space-y-3 transition-all ${numberChoice !== 'new' ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-gray-900 font-medium">Hur hanteras inkommande samtal?</h3>
          <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Kommer snart</span>
        </div>
        <p className="text-xs text-gray-500 -mt-1">
          Samtalsagenten aktiveras automatiskt när den är redo. SMS-funktionen fungerar fullt ut redan nu.
        </p>
        {CALL_HANDLING_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setCallHandlingMode(mode.value)}
            className={`w-full p-4 rounded-xl border text-left transition-all ${
              callHandlingMode === mode.value
                ? 'bg-primary-50 border-primary-300'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                callHandlingMode === mode.value ? 'border-primary-700' : 'border-gray-300'
              }`}>
                {callHandlingMode === mode.value && (
                  <div className="w-2 h-2 rounded-full bg-primary-700" />
                )}
              </div>
              <p className="text-gray-900 text-sm font-medium">{mode.label}</p>
            </div>
            <p className="text-xs text-gray-500 mt-1 ml-6">{mode.description}</p>
          </button>
        ))}
      </div>

      {/* Sektion 4 — Privat mobilnummer */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-gray-900 font-medium flex items-center gap-2">
          <Phone className="w-4 h-4 text-primary-700" />
          Ditt privata mobilnummer
        </h3>
        <p className="text-xs text-gray-500">
          Hit kopplar agenten vidare om kunden behöver prata med dig direkt.
        </p>
        <input
          type="tel"
          value={personalPhone}
          onChange={(e) => setPersonalPhone(e.target.value)}
          className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600"
          placeholder="+46708379552"
        />
      </div>

      {/* Knappar */}
      <div className="flex gap-3">
        {onBack && (
          <button onClick={onBack} className="px-4 py-3 border border-gray-200 rounded-xl text-gray-600 text-sm">
            <ArrowLeft className="w-4 h-4 inline mr-1" />Tillbaka
          </button>
        )}
        <button
          onClick={handleContinue}
          disabled={phoneSaving || saving}
          className="flex-1 py-3 bg-primary-700 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {phoneSaving ? 'Sparar...' : <>Välj plan och aktivera <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  )
}
