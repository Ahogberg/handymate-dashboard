'use client'

import { useState } from 'react'
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
  const assignedNumber = data.assigned_phone_number || ''
  const [personalPhone, setPersonalPhone] = useState(
    (data as any).personal_phone || data.forward_phone_number || data.phone_number || ''
  )
  const [callHandlingMode, setCallHandlingMode] = useState(
    (data as any).call_handling_mode || 'agent_with_transfer'
  )
  const [showForwarding, setShowForwarding] = useState(false)
  const [selectedOperator, setSelectedOperator] = useState('telia')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  const operator = FORWARDING_INSTRUCTIONS[selectedOperator]

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

      // Save personal_phone to business_config
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ personal_phone: cleanPhone }),
      })
      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error || 'Kunde inte spara')
      }

      // Save call_handling_mode to automation settings
      const res2 = await fetch('/api/automation/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ call_handling_mode: callHandlingMode }),
      })
      if (!res2.ok) {
        const result2 = await res2.json()
        throw new Error(result2.error || 'Kunde inte spara samtalsläge')
      }

      setSaved(true)
      onNext()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel')
    }

    setPhoneSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Ditt företagsnummer</h1>
        <p className="text-zinc-400 mt-2">Steg 3 av 7 — Ditt Handymate-telefonnummer</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}

      {/* Public phone number — prominent display */}
      {assignedNumber ? (
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-6 text-center">
          <Check className="w-8 h-8 text-teal-400 mx-auto mb-2" />
          <p className="text-teal-400 font-medium">Telefonnummer aktiverat!</p>
          <p className="text-2xl font-bold text-white mt-2">{assignedNumber}</p>
        </div>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 text-center">
          <Phone className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
          <p className="text-zinc-400">Inget nummer provisionerat ännu</p>
          <p className="text-xs text-zinc-500 mt-1">Kontakta support om du inte fått ett nummer</p>
        </div>
      )}

      {/* Explanation text */}
      <p className="text-sm text-zinc-400 leading-relaxed">
        Det här är ditt Handymate-nummer. Använd det på visitkort, hemsida och i offerter.
        Kunder ringer hit — agenten svarar alltid.
      </p>

      {/* Personal phone number field */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-3">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Phone className="w-5 h-5 text-teal-400" />
          Ditt privata mobilnummer
        </h3>
        <p className="text-xs text-zinc-400">
          Hit kopplar agenten vidare om kunden behöver prata med dig direkt.
        </p>
        <input
          type="tel"
          value={personalPhone}
          onChange={(e) => setPersonalPhone(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
          placeholder="+46701234567"
        />
      </div>

      {/* Call handling mode */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-3">
        <h3 className="text-white font-medium">Hur vill du hantera inkommande samtal?</h3>
        {CALL_HANDLING_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setCallHandlingMode(mode.value)}
            className={`w-full p-3 rounded-lg border text-left transition-all ${
              callHandlingMode === mode.value
                ? 'bg-teal-500/10 border-teal-500'
                : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                callHandlingMode === mode.value ? 'border-teal-500' : 'border-zinc-600'
              }`}>
                {callHandlingMode === mode.value && (
                  <div className="w-2 h-2 rounded-full bg-teal-500" />
                )}
              </div>
              <p className="text-white text-sm font-medium">{mode.label}</p>
            </div>
            <p className="text-xs text-zinc-400 mt-1 ml-6">{mode.description}</p>
          </button>
        ))}
      </div>

      {/* Collapsible forwarding section */}
      {assignedNumber && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowForwarding(!showForwarding)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-all"
          >
            <div className="flex items-center gap-2">
              <PhoneForwarded className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-400">Har du ett gammalt nummer?</span>
            </div>
            {showForwarding ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </button>

          {showForwarding && (
            <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">
              <p className="text-xs text-zinc-400">
                Om du har ett befintligt företagsnummer kan du vidarekoppla det till ditt Handymate-nummer.
                Slå denna kod på din telefon:
              </p>

              <div className="flex gap-2">
                {Object.keys(FORWARDING_INSTRUCTIONS).map((op) => (
                  <button
                    key={op}
                    onClick={() => setSelectedOperator(op)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      selectedOperator === op
                        ? 'bg-teal-500/20 border-teal-500 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {FORWARDING_INSTRUCTIONS[op].name}
                  </button>
                ))}
              </div>

              <div className="bg-zinc-800 rounded-lg p-4 flex items-center justify-between">
                <code className="text-teal-400 font-mono text-lg">
                  {operator.activate.replace('{nummer}', assignedNumber)}
                </code>
                <button
                  onClick={() => copyCode(operator.activate)}
                  className="p-2 text-zinc-400 hover:text-white"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Avaktivera med: <code className="text-zinc-400">{operator.deactivate}</code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        {onBack && (
          <button onClick={onBack} className="px-6 py-3 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl hover:bg-zinc-700 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Tillbaka
          </button>
        )}
        <button
          onClick={handleSaveAndContinue}
          disabled={phoneSaving || saving}
          className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {phoneSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <>
              Fortsätt
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
