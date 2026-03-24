'use client'

import { useState, useEffect } from 'react'
import { ArrowRight, ArrowLeft, Loader2, Phone, PhoneForwarded, Check, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { FORWARDING_INSTRUCTIONS } from '../constants'
import type { StepProps } from '../types'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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
  const [assignedNumber, setAssignedNumber] = useState(data.assigned_phone_number || '')
  const [personalPhone, setPersonalPhone] = useState(
    (data as any).personal_phone || data.forward_phone_number || data.phone_number || ''
  )
  const [callHandlingMode, setCallHandlingMode] = useState(
    (data as any).call_handling_mode || 'agent_with_transfer'
  )
  const [showForwarding, setShowForwarding] = useState(false)
  const [selectedOperator, setSelectedOperator] = useState('telia')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const operator = FORWARDING_INSTRUCTIONS[selectedOperator]

  // Auto-provisionera nummer om det saknas
  useEffect(() => {
    if (!assignedNumber && data.business_id && !provisioning) {
      provisionNumber()
    }
  }, [data.business_id])

  async function provisionNumber() {
    if (!data.business_id) return
    setProvisioning(true)
    setError('')

    try {
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const cleanPhone = personalPhone ? '+' + personalPhone.replace(/\D/g, '') : data.phone_number || ''

      const res = await fetch('/api/onboarding/phone', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: data.business_id,
          forward_phone_number: cleanPhone || undefined,
          call_mode: callHandlingMode,
          phone_setup_type: 'handymate_number',
        }),
      })

      const result = await res.json()

      if (res.ok && result.number) {
        setAssignedNumber(result.number)
      } else if (res.ok && result.assigned_phone_number) {
        setAssignedNumber(result.assigned_phone_number)
      } else {
        console.error('[Step3Phone] Provision failed:', result)
        setError('Kunde inte tilldela nummer automatiskt — kontakta support')
      }
    } catch (err: unknown) {
      console.error('[Step3Phone] Provision error:', err)
      setError('Nätverksfel vid nummertilldelning')
    }

    setProvisioning(false)
  }

  const copyCode = (code: string) => {
    const finalCode = code.replace('{nummer}', assignedNumber)
    navigator.clipboard.writeText(finalCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveAndContinue = async () => {
    if (!data.business_id) { onNext(); return }

    setPhoneSaving(true)
    setError('')

    try {
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const cleanPhone = personalPhone ? '+' + personalPhone.replace(/\D/g, '') : null

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ personal_phone: cleanPhone }),
      })
      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error || 'Kunde inte spara')
      }

      const res2 = await fetch('/api/automation/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ call_handling_mode: callHandlingMode }),
      })
      if (!res2.ok) {
        const result2 = await res2.json()
        throw new Error(result2.error || 'Kunde inte spara samtalsläge')
      }

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

      {/* Nummer-display */}
      {provisioning ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center shadow-sm">
          <Loader2 className="w-8 h-8 text-teal-600 mx-auto mb-2 animate-spin" />
          <p className="text-gray-500">Tilldelar ditt företagsnummer...</p>
        </div>
      ) : assignedNumber ? (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-6 text-center shadow-sm">
          <Check className="w-8 h-8 text-teal-600 mx-auto mb-2" />
          <p className="text-teal-700 font-medium">Telefonnummer aktiverat!</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{assignedNumber}</p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center shadow-sm">
          <Phone className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-amber-700">Kunde inte tilldela nummer automatiskt</p>
          <button
            onClick={provisionNumber}
            className="mt-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
          >
            Försök igen
          </button>
        </div>
      )}

      <p className="text-sm text-gray-500 leading-relaxed">
        Det här är ditt Handymate-nummer. Använd det på visitkort, hemsida och i offerter.
        Kunder ringer hit — agenten svarar alltid.
      </p>

      {/* Privat mobilnummer */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-gray-900 font-medium flex items-center gap-2">
          <Phone className="w-5 h-5 text-teal-600" />
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
        <h3 className="text-gray-900 font-medium">Hur vill du hantera inkommande samtal?</h3>
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

      {/* Vidarekoppling */}
      {assignedNumber && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowForwarding(!showForwarding)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-all"
          >
            <div className="flex items-center gap-2">
              <PhoneForwarded className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">Har du ett gammalt nummer du vill vidarekoppla?</span>
            </div>
            {showForwarding ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showForwarding && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">
                Slå denna kod på din telefon för att vidarekoppla ditt gamla nummer:
              </p>
              <div className="flex gap-2">
                {Object.keys(FORWARDING_INSTRUCTIONS).map((op) => (
                  <button
                    key={op}
                    onClick={() => setSelectedOperator(op)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      selectedOperator === op
                        ? 'bg-teal-50 border-teal-300 text-teal-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    {FORWARDING_INSTRUCTIONS[op].name}
                  </button>
                ))}
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                <code className="text-teal-700 font-mono text-lg">
                  {operator.activate.replace('{nummer}', assignedNumber)}
                </code>
                <button onClick={() => copyCode(operator.activate)} className="p-2 text-gray-400 hover:text-teal-600">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Avaktivera med: <code className="text-gray-500">{operator.deactivate}</code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        {onBack && (
          <button onClick={onBack} className="px-6 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Tillbaka
          </button>
        )}
        <button
          onClick={handleSaveAndContinue}
          disabled={phoneSaving || saving}
          className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {phoneSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Fortsätt <ArrowRight className="w-5 h-5" /></>}
        </button>
      </div>
    </div>
  )
}
