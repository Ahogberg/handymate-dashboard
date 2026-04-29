'use client'

import { useState } from 'react'
import {
  ArrowRight, ArrowLeft, Phone, Lock, Check, Minus,
  User, LifeBuoy, X, Sparkles,
} from 'lucide-react'
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

type IconKind = 'on' | 'off' | 'who' | 'support'

function InfoItem({ kind, text }: { kind: IconKind; text: string }) {
  let icon
  let textClass = 'text-gray-700'
  if (kind === 'on') {
    icon = <Check className="w-3.5 h-3.5 text-primary-700 shrink-0 mt-[2px]" />
  } else if (kind === 'off') {
    icon = <Minus className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-[2px]" />
    textClass = 'text-gray-600'
  } else if (kind === 'who') {
    icon = <User className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-[2px]" />
  } else {
    icon = <LifeBuoy className="w-3.5 h-3.5 text-primary-700 shrink-0 mt-[2px]" />
  }
  return (
    <div className="flex items-start gap-2 text-[12px] leading-relaxed">
      {icon}
      <span className={textClass}>{text}</span>
    </div>
  )
}

const blockHeaderClass =
  'text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-1.5'

function InfoBlock({
  label,
  kind,
  items,
}: {
  label: string
  kind: IconKind
  items: string[]
}) {
  return (
    <div>
      <div className={blockHeaderClass}>{label}</div>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <InfoItem key={i} kind={kind} text={it} />
        ))}
      </div>
    </div>
  )
}

// ─── Hjälp-mig-välja modal ───────────────────────────────────────────────

type AnswerLevel = 0 | 1 | 2 // låg, medel, hög

const HELPER_QUESTIONS: Array<{
  q: string
  options: Array<{ label: string; level: AnswerLevel }>
}> = [
  {
    q: 'Hur många befintliga kunder har du som ringer regelbundet?',
    options: [
      { label: 'Få (under 50)', level: 0 },
      { label: 'Många (50–500)', level: 1 },
      { label: 'Mycket (500+)', level: 2 },
    ],
  },
  {
    q: 'Hur viktigt är det att kunder får snabba svar även när du är upptagen?',
    options: [
      { label: 'Inte så viktigt', level: 0 },
      { label: 'Ganska viktigt', level: 1 },
      { label: 'Mycket viktigt', level: 2 },
    ],
  },
  {
    q: 'Hur ofta vill du att AI ska sköta kommunikation utan din inblandning?',
    options: [
      { label: 'Sällan', level: 0 },
      { label: 'Ofta', level: 1 },
      { label: 'Alltid', level: 2 },
    ],
  },
]

interface HelperModalProps {
  onClose: () => void
  onPick: (choice: 'new' | 'keep') => void
}

function HelperModal({ onClose, onPick }: HelperModalProps) {
  const [answers, setAnswers] = useState<(AnswerLevel | null)[]>([null, null, null])

  const allAnswered = answers.every(a => a !== null)
  const score = (answers as number[]).reduce((s, v) => s + (v ?? 0), 0)
  // 0–6: <3 → Alt 1 (behåll), >=3 → Alt 2 (nytt). På Q1 viktas högt antal kunder
  // åt "behåll" så vi väger Q1=2 åt andra hållet:
  const adjusted = (() => {
    if (!allAnswered) return 0
    const [q1, q2, q3] = answers as AnswerLevel[]
    // Q1 kunder: hög = mer skäl att behålla → vänd betydelsen
    // Q2 + Q3: hög = mer skäl att byta → behåll betydelsen
    return (2 - q1) + q2 + q3 // 0–6
  })()
  const recommendation: 'new' | 'keep' = adjusted >= 3 ? 'new' : 'keep'

  function setAnswer(idx: number, level: AnswerLevel) {
    setAnswers(prev => {
      const next = [...prev]
      next[idx] = level
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      style={{ animation: 'ob-fade-in 200ms' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white w-full max-w-md sm:mx-4 max-h-[92vh] flex flex-col"
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          animation: 'ob-pop-in 360ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div>
            <div className="text-[16px] font-bold text-gray-900">Hjälp mig välja</div>
            <div className="text-[11px] text-gray-500 mt-0.5">3 snabba frågor</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-[#E2E8F0] flex items-center justify-center text-gray-400 hover:text-gray-700"
            aria-label="Stäng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {HELPER_QUESTIONS.map((item, qi) => (
            <div key={qi}>
              <div className="text-[13px] font-semibold text-gray-900 mb-2.5">
                {qi + 1}. {item.q}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {item.options.map((opt, oi) => {
                  const isPicked = answers[qi] === opt.level
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => setAnswer(qi, opt.level)}
                      className={`px-3 py-2 rounded-lg border text-[12px] text-left transition-all ${
                        isPicked
                          ? 'border-primary-700 bg-primary-50 text-primary-700 font-medium'
                          : 'border-[#E2E8F0] bg-white text-gray-700 hover:border-primary-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {allAnswered && (
            <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-4 h-4 text-primary-700" />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-700">
                  Vår rekommendation
                </span>
              </div>
              <div className="text-[14px] font-semibold text-gray-900 mb-1">
                {recommendation === 'new'
                  ? 'Få ett nytt Handymate-nummer'
                  : 'Behåll ditt befintliga nummer'}
              </div>
              <p className="text-[12px] text-gray-600 leading-relaxed">
                {recommendation === 'new'
                  ? 'Du verkar vilja ge AI-teamet fri lina och prioritera snabba svar — då lönar sig ett nytt nummer eftersom hela kommunikationen kan automatiseras.'
                  : 'Du har många befintliga kunder och vill ha kontroll själv. Att behålla numret är säkrast — du kan alltid byta senare när du vant dig.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#E2E8F0] flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-[#E2E8F0] text-gray-700 text-[13px]"
          >
            Stäng
          </button>
          <button
            onClick={() => onPick(recommendation)}
            disabled={!allAnswered}
            className="flex-1 py-2.5 bg-primary-700 text-white rounded-lg font-semibold text-[13px] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            Välj rekommendationen
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 3 — telefonval ─────────────────────────────────────────────────

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
  const [showHelper, setShowHelper] = useState(false)

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
          {/* Kort 1 — Nytt Handymate-nummer (rekommenderas) */}
          <button
            onClick={() => setNumberChoice('new')}
            className={`relative text-left p-4 rounded-xl border-2 transition-all flex flex-col ${
              numberChoice === 'new'
                ? 'border-primary-700 bg-primary-50/50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            {/* Subtil "Rekommenderas"-pill — teal-50 bg + teal-700 text */}
            <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 bg-primary-50 border border-primary-300 text-primary-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" />
              Rekommenderas
            </span>

            <div className="text-xl mb-1">🆕</div>
            <p className="text-sm font-semibold text-gray-900 mb-0.5">Få ett nytt Handymate-nummer</p>
            <p className="text-[11px] font-medium text-primary-700 mb-2">Full automation aktiverad</p>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Du får ett nytt 010-nummer som blir ditt arbetsnummer. Alla samtal och SMS hanteras av AI-teamet.
            </p>

            <div className="space-y-3 mt-1">
              <InfoBlock
                label="Aktiveras"
                kind="on"
                items={[
                  'Allt från det andra alternativet',
                  'Karin svarar SMS automatiskt dygnet runt',
                  'Daniel följer upp leads via SMS',
                  'Lisa hanterar hela samtalsflödet',
                  'AI ser ALL kommunikation',
                  'Komplett historik per kund',
                ]}
              />
              <InfoBlock
                label="Övergångsstöd"
                kind="support"
                items={[
                  'Vidarekoppling från ditt gamla nummer',
                  'Färdiga SMS-mallar för att meddela kunder',
                  'Färdiga visitkort-mallar att skriva ut',
                  'Hjälp att uppdatera Hitta.se, Google m.fl.',
                ]}
              />
              <InfoBlock
                label="Bra för dig som"
                kind="who"
                items={[
                  'Vill maximera Handymates värde',
                  'Bygger upp ett växande företag',
                  'Vill ge kunderna ett professionellt intryck',
                ]}
              />
            </div>
          </button>

          {/* Kort 2 — Behåll befintligt */}
          <button
            onClick={() => setNumberChoice('keep')}
            className={`relative text-left p-4 rounded-xl border-2 transition-all flex flex-col ${
              numberChoice === 'keep'
                ? 'border-primary-700 bg-primary-50/50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-xl mb-1">📱</div>
            <p className="text-sm font-semibold text-gray-900 mb-0.5">Behåll mitt befintliga nummer</p>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Begränsad automation</p>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Vi routar inkommande samtal osynligt genom Handymate. Du behåller ditt nummer utåt mot kunderna.
            </p>

            <div className="space-y-3 mt-1">
              <InfoBlock
                label="Aktiveras"
                kind="on"
                items={[
                  'Lisa svarar samtal när du är upptagen',
                  'Samtal spelas in och analyseras (med samtycke)',
                  'Bokningar fångas automatiskt',
                  'Du kan skicka SMS via Handymate',
                ]}
              />
              <InfoBlock
                label="Begränsas"
                kind="off"
                items={[
                  'Inkommande SMS når inte AI-teamet',
                  'Karin kan inte svara automatiskt på SMS',
                  'Daniel kan inte följa upp leads via SMS',
                  'AI ser inte hela kommunikationen',
                ]}
              />
              <InfoBlock
                label="Bra för dig som"
                kind="who"
                items={[
                  'Har många befintliga kunder med ditt nummer',
                  'Inte vill byta visitkort eller material',
                  'Vill testa Handymate försiktigt först',
                ]}
              />
            </div>
          </button>
        </div>

        {/* Hjälp-mig-välja-länk */}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setShowHelper(true)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary-700 hover:text-primary-700/80"
          >
            Osäker? Hjälp mig välja
            <ArrowRight className="w-3.5 h-3.5" />
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

      {/* Hjälp-mig-välja-modal */}
      {showHelper && (
        <HelperModal
          onClose={() => setShowHelper(false)}
          onPick={(choice) => {
            setNumberChoice(choice)
            setShowHelper(false)
          }}
        />
      )}
    </div>
  )
}
