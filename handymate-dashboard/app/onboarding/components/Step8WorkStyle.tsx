'use client'

import { useState } from 'react'
import { Loader2, ChevronRight } from 'lucide-react'

interface Step8Props {
  businessId: string
  onNext: () => void
}

interface Question {
  key: string
  label: string
  options: { label: string; value: string }[]
}

const QUESTIONS: Question[] = [
  {
    key: 'pricing_margin_default',
    label: 'Vilken marginal tar du på material?',
    options: [
      { label: '10%', value: '10' },
      { label: '15%', value: '15' },
      { label: '20%', value: '20' },
      { label: '25%+', value: '25+' },
      { label: 'Jag räknar manuellt', value: 'manual' },
    ],
  },
  {
    key: 'min_job_value_sek',
    label: 'Vad är ditt minsta jobbvärde?',
    options: [
      { label: 'Under 5 000 kr', value: '<5000' },
      { label: '5 000–10 000 kr', value: '5000-10000' },
      { label: '10 000–25 000 kr', value: '10000-25000' },
      { label: 'Över 25 000 kr', value: '>25000' },
    ],
  },
  {
    key: 'geography_max_km',
    label: 'Hur långt är du villig att köra?',
    options: [
      { label: '10 km', value: '10' },
      { label: '30 km', value: '30' },
      { label: '50 km', value: '50' },
      { label: 'Spelar ingen roll', value: 'any' },
    ],
  },
  {
    key: 'scheduling_preferred_hours',
    label: 'Vilka arbetstider föredrar du?',
    options: [
      { label: '07–15', value: '07-15' },
      { label: '07–17', value: '07-17' },
      { label: '08–17', value: '08-17' },
      { label: 'Varierar', value: 'flexible' },
    ],
  },
  {
    key: 'preferred_contact_channel',
    label: 'Hur vill du helst bli kontaktad av Handymate?',
    options: [
      { label: 'Push-notis på telefonen', value: 'push' },
      { label: 'E-post', value: 'email' },
      { label: 'Båda', value: 'both' },
    ],
  },
]

export default function Step8WorkStyle({ businessId, onNext }: Step8Props) {
  const [currentQ, setCurrentQ] = useState(0)
  const [saving, setSaving] = useState(false)

  const question = QUESTIONS[currentQ]
  const isLast = currentQ === QUESTIONS.length - 1

  const saveAndProceed = async (value: string) => {
    setSaving(true)
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: question.key, value, source: 'onboarding' }),
      })
    } catch {
      // Silent fail — preferences are non-critical
    } finally {
      setSaving(false)
    }

    if (isLast) {
      onNext()
    } else {
      setCurrentQ(q => q + 1)
    }
  }

  const skip = () => {
    if (isLast) {
      onNext()
    } else {
      setCurrentQ(q => q + 1)
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Hur du jobbar</h1>
        <p className="text-zinc-400 mt-2">Steg 8 av 9 — Hjälp AI-assistenten förstå din verksamhet</p>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i < currentQ ? 'bg-teal-500' : i === currentQ ? 'bg-teal-400' : 'bg-zinc-700'
            }`}
          />
        ))}
      </div>

      {/* Question card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <p className="text-lg font-medium text-white">{question.label}</p>

        <div className="grid gap-3">
          {question.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => saveAndProceed(opt.value)}
              disabled={saving}
              className="w-full text-left px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-teal-500/50 text-white rounded-xl transition-all flex items-center justify-between group disabled:opacity-50"
            >
              <span>{opt.label}</span>
              {saving ? (
                <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-teal-400 transition-colors" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={skip}
          disabled={saving}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Hoppa över
        </button>
      </div>
    </div>
  )
}
