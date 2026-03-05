'use client'

import { Camera, Mic, Keyboard, FileStack, Phone } from 'lucide-react'

export type InputMethod = 'photo' | 'voice' | 'text' | 'template' | 'call'

interface InputSelectorProps {
  onSelect: (method: InputMethod) => void
  hasCallSuggestions?: boolean
}

export default function InputSelector({ onSelect, hasCallSuggestions }: InputSelectorProps) {
  const methods = [
    { id: 'photo' as InputMethod, icon: Camera, label: 'Ta foto', description: 'Fotografera jobbet', color: 'teal' },
    { id: 'voice' as InputMethod, icon: Mic, label: 'Beskriv med röst', description: 'Spela in beskrivning', color: 'sky' },
    { id: 'text' as InputMethod, icon: Keyboard, label: 'Skriv manuellt', description: 'Beskriv med text', color: 'slate' },
    { id: 'template' as InputMethod, icon: FileStack, label: 'Från mall', description: 'Välj sparad jobbmall', color: 'amber' },
    ...(hasCallSuggestions ? [{ id: 'call' as InputMethod, icon: Phone, label: 'Från samtal', description: 'Använd AI-förslag', color: 'emerald' }] : [])
  ]

  const colorMap: Record<string, string> = {
    teal: 'from-teal-600/20 to-teal-500/5 border-teal-300 hover:border-teal-500/60',
    sky: 'from-sky-500/20 to-sky-500/5 border-sky-300 hover:border-sky-500/60',
    slate: 'from-slate-500/20 to-slate-500/5 border-slate-300 hover:border-slate-500/60',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-200 hover:border-amber-500/60',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-200 hover:border-emerald-500/60',
  }

  const iconColorMap: Record<string, string> = {
    teal: 'text-teal-600',
    sky: 'text-sky-600',
    slate: 'text-slate-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Hur vill du börja?</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {methods.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`flex flex-col items-center gap-3 p-5 rounded-xl border bg-gradient-to-b transition-all ${colorMap[m.color]}`}
          >
            <m.icon className={`w-8 h-8 ${iconColorMap[m.color]}`} />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900">{m.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
