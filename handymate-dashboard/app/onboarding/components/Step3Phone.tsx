'use client'

import { useState } from 'react'
import { ArrowRight, ArrowLeft, Loader2, Phone, PhoneForwarded, Bot, Check, Copy } from 'lucide-react'
import { CALL_MODES, FORWARDING_INSTRUCTIONS } from '../constants'
import type { StepProps, PhoneSetupType, CallMode } from '../types'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function Step3Phone({ data, onNext, onBack, saving }: StepProps) {
  const [phoneSetupType, setPhoneSetupType] = useState<PhoneSetupType>(
    data.assigned_phone_number ? 'keep_existing' : null
  )
  const [forwardNumber, setForwardNumber] = useState(data.forward_phone_number || data.phone_number || '')
  const [callMode, setCallMode] = useState<CallMode>((data.call_mode as CallMode) || 'human_first')
  const [assignedNumber, setAssignedNumber] = useState(data.assigned_phone_number || '')
  const [selectedOperator, setSelectedOperator] = useState('telia')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleProvision = async () => {
    if (!data.business_id) return
    setPhoneLoading(true)
    setError('')

    try {
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const cleanPhone = '+' + forwardNumber.replace(/\D/g, '')
      const response = await fetch('/api/onboarding/phone', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: data.business_id,
          forward_phone_number: cleanPhone,
          call_mode: callMode,
          phone_setup_type: phoneSetupType,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kunde inte aktivera telefonnummer')

      setAssignedNumber(result.number)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel')
    }

    setPhoneLoading(false)
  }

  const copyCode = (code: string) => {
    const finalCode = code.replace('{nummer}', assignedNumber)
    navigator.clipboard.writeText(finalCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const operator = FORWARDING_INSTRUCTIONS[selectedOperator]

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Telefon</h1>
        <p className="text-zinc-400 mt-2">Steg 3 av 7 — Konfigurera ditt Handymate-telefonnummer</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}

      {/* Already has a number */}
      {assignedNumber ? (
        <div className="space-y-6">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center">
            <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-emerald-400 font-medium">Telefonnummer aktiverat!</p>
            <p className="text-2xl font-bold text-white mt-2">{assignedNumber}</p>
          </div>

          {/* Forwarding instructions */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h3 className="text-white font-medium flex items-center gap-2">
              <PhoneForwarded className="w-5 h-5 text-teal-400" /> Vidarekoppling
            </h3>
            <p className="text-sm text-zinc-400">
              Slå denna kod på din telefon för att vidarekoppla samtal till Handymate:
            </p>

            <div className="flex gap-2 mb-3">
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
        </div>
      ) : (
        <div className="space-y-6">
          {/* Setup type selection */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Hur vill du ta emot samtal?</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setPhoneSetupType('keep_existing')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  phoneSetupType === 'keep_existing'
                    ? 'bg-teal-500/10 border-teal-500'
                    : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <Phone className="w-6 h-6 text-teal-400 mb-2" />
                <p className="text-white font-medium">Behåll mitt nummer</p>
                <p className="text-sm text-zinc-400 mt-1">Du vidarekopplar ditt befintliga nummer till Handymate</p>
              </button>

              <button
                onClick={() => setPhoneSetupType('new_number')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  phoneSetupType === 'new_number'
                    ? 'bg-teal-500/10 border-teal-500'
                    : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <Bot className="w-6 h-6 text-teal-400 mb-2" />
                <p className="text-white font-medium">Nytt Handymate-nummer</p>
                <p className="text-sm text-zinc-400 mt-1">Få ett nytt nummer som hanteras av AI-assistenten</p>
              </button>
            </div>
          </div>

          {phoneSetupType && (
            <>
              {/* Forward number */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
                <h3 className="text-white font-medium">Vidarekoppla till</h3>
                <input
                  type="tel"
                  value={forwardNumber}
                  onChange={(e) => setForwardNumber(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                  placeholder="Ditt mobilnummer"
                />
              </div>

              {/* Call mode */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-3">
                <h3 className="text-white font-medium">Samtalsläge</h3>
                {CALL_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setCallMode(mode.value as CallMode)}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      callMode === mode.value
                        ? 'bg-teal-500/10 border-teal-500'
                        : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    <p className="text-white text-sm font-medium">{mode.label}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{mode.description}</p>
                  </button>
                ))}
              </div>

              <button
                onClick={handleProvision}
                disabled={phoneLoading}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {phoneLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Aktivera telefonnummer'}
              </button>
            </>
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
          onClick={onNext}
          disabled={saving}
          className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <>
              {assignedNumber ? 'Fortsätt' : 'Hoppa över för nu'}
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
