'use client'

import { useState } from 'react'
import { ArrowRight, ArrowLeft, Phone, Lock, MessageSquare, PhoneCall } from 'lucide-react'
import type { StepProps } from '../types'

const CALL_HANDLING_MODES = [
  {
    value: 'agent_always',
    label: 'Agenten svarar alltid',
    description: 'Agenten hanterar alla samtal, du behöver aldrig svara telefon',
  },
  {
    value: 'agent_with_transfer',
    label: 'Agenten filtrerar, du tar vid vid behov',
    description: 'Agenten svarar, men kan koppla till dig om kunden vill prata direkt',
  },
  {
    value: 'human_work_hours',
    label: 'Du svarar under arbetstid, agenten tar kvällar och helger',
    description: 'Under 07-17 mån-fre ringer din telefon direkt — agenten täcker resten',
  },
]

export default function Step3Phone({ data, onNext, onBack, saving }: StepProps) {
  const [personalPhone, setPersonalPhone] = useState(
    (data as any).personal_phone || data.forward_phone_number || data.phone_number || ''
  )
  const [callHandlingMode, setCallHandlingMode] = useState(
    (data as any).call_handling_mode || 'agent_with_transfer'
  )
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [error, setError] = useState('')

  const handleContinue = async () => {
    setPhoneSaving(true)
    setError('')

    try {
      // Spara bara personal_phone och call_handling_mode — numret provisioneras efter betalning
      const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const cleanPhone = personalPhone ? '+' + personalPhone.replace(/\D/g, '') : null

      await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ personal_phone: cleanPhone }),
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

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>
      )}

      {/* Reserverat nummer */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center shadow-sm">
        <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Phone className="w-6 h-6 text-teal-600" />
        </div>
        <p className="text-2xl font-bold text-gray-900 tracking-wider mb-1">+4676•••••••</p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-200 rounded-full">
          <Lock className="w-3 h-3 text-teal-600" />
          <span className="text-xs font-medium text-teal-700">Reserverat åt dig</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">Aktiveras automatiskt när du slutför betalningen i nästa steg</p>
      </div>

      {/* Beskrivning */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <p className="text-sm text-gray-700 leading-relaxed">
          Det här numret är din direktlinje till Matte — din AI-assistent som aldrig sover.
        </p>

        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5">
            <MessageSquare className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">SMS-automatisering (alltid aktiv)</p>
              <ul className="text-xs text-gray-500 mt-1 space-y-0.5">
                <li>Nya leads svaras inom sekunder och kvalificeras automatiskt</li>
                <li>Offerter följs upp med påminnelser tills kunden svarar</li>
                <li>Bokningsbekräftelser och påminnelser skickas automatiskt</li>
                <li>Betalningspåminnelser vid förfallna fakturor</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <PhoneCall className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Samtal (valfritt)</p>
              <p className="text-xs text-gray-500 mt-0.5">Välj hur inkommande samtal ska hanteras nedan</p>
            </div>
          </div>
        </div>
      </div>

      {/* Privat mobilnummer */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-gray-900 font-medium flex items-center gap-2">
          <Phone className="w-4 h-4 text-teal-600" />
          Ditt privata mobilnummer
        </h3>
        <p className="text-xs text-gray-500">
          Hit kopplar agenten vidare om kunden behöver prata med dig direkt.
        </p>
        <input
          type="tel"
          value={personalPhone}
          onChange={(e) => setPersonalPhone(e.target.value)}
          className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          placeholder="+46708379552"
        />
      </div>

      {/* Samtalshantering */}
      <div className="space-y-3">
        <h3 className="text-gray-900 font-medium">Hur ska vi hantera inkommande samtal?</h3>
        {CALL_HANDLING_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setCallHandlingMode(mode.value)}
            className={`w-full p-4 rounded-xl border text-left transition-all ${
              callHandlingMode === mode.value
                ? 'bg-teal-50 border-teal-300'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                callHandlingMode === mode.value ? 'border-teal-600' : 'border-gray-300'
              }`}>
                {callHandlingMode === mode.value && (
                  <div className="w-2 h-2 rounded-full bg-teal-600" />
                )}
              </div>
              <p className="text-gray-900 text-sm font-medium">{mode.label}</p>
            </div>
            <p className="text-xs text-gray-500 mt-1 ml-6">{mode.description}</p>
          </button>
        ))}
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
          className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {phoneSaving ? 'Sparar...' : <>Välj plan och aktivera <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  )
}
