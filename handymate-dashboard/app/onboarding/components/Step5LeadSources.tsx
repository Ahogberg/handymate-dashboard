'use client'

import { useState } from 'react'
import { ArrowRight, ArrowLeft, Loader2, Globe, Copy, Check } from 'lucide-react'
import { LEAD_PLATFORMS } from '../constants'
import type { StepProps } from '../types'

export default function Step5LeadSources({ data, onNext, onBack, onUpdate, saving }: StepProps) {
  const [selectedSources, setSelectedSources] = useState<string[]>(data.lead_sources || [])
  const [copied, setCopied] = useState(false)

  const leadEmail = data.lead_email_address || `leads+${data.business_id}@handymate.se`

  const toggleSource = (id: string) => {
    setSelectedSources(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  const copyEmail = () => {
    navigator.clipboard.writeText(leadEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleNext = async () => {
    // Save lead sources via settings
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_sources: selectedSources }),
    }).catch(() => {})

    onUpdate({ lead_sources: selectedSources })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Leadkällor</h1>
        <p className="text-zinc-400 mt-2">Steg 5 av 7 — Var kommer dina kunder ifrån?</p>
      </div>

      {/* Lead Platforms */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Globe className="w-5 h-5 text-teal-400" />
          Varifrån får du förfrågningar?
        </h2>
        <p className="text-sm text-zinc-400">Välj de plattformar du använder. Vi kan automatiskt importera leads därifrån.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LEAD_PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              onClick={() => toggleSource(platform.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedSources.includes(platform.id)
                  ? 'bg-teal-500/10 border-teal-500'
                  : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
              }`}
            >
              <p className="text-white font-medium">{platform.label}</p>
              {platform.url && <p className="text-xs text-zinc-500 mt-0.5">{platform.url}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Lead Email */}
      {selectedSources.some(s => ['offerta', 'servicefinder', 'byggahus'].includes(s)) && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="text-white font-medium">Din lead-epostadress</h3>
          <p className="text-sm text-zinc-400">
            Ange denna adress som mottagare i dina lead-plattformar. Handymate importerar automatiskt leads härifrån.
          </p>

          <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-3">
            <code className="text-teal-400 text-sm flex-1 truncate">{leadEmail}</code>
            <button onClick={copyEmail} className="p-1.5 text-zinc-400 hover:text-white shrink-0">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
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
          onClick={handleNext}
          disabled={saving}
          className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Fortsätt <ArrowRight className="w-5 h-5" /></>}
        </button>
      </div>
    </div>
  )
}
