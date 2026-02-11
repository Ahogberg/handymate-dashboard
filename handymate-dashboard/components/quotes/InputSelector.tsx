'use client'

import { Camera, Mic, Keyboard, FileStack, Phone } from 'lucide-react'

export type InputMethod = 'photo' | 'voice' | 'text' | 'template' | 'call'

interface InputSelectorProps {
  onSelect: (method: InputMethod) => void
  hasCallSuggestions?: boolean
}

export default function InputSelector({ onSelect, hasCallSuggestions }: InputSelectorProps) {
  const methods = [
    { id: 'photo' as InputMethod, icon: Camera, label: 'Ta foto', description: 'Fotografera jobbet', color: 'violet' },
    { id: 'voice' as InputMethod, icon: Mic, label: 'Beskriv med röst', description: 'Spela in beskrivning', color: 'fuchsia' },
    { id: 'text' as InputMethod, icon: Keyboard, label: 'Skriv manuellt', description: 'Beskriv med text', color: 'cyan' },
    { id: 'template' as InputMethod, icon: FileStack, label: 'Från mall', description: 'Välj sparad jobbmall', color: 'amber' },
    ...(hasCallSuggestions ? [{ id: 'call' as InputMethod, icon: Phone, label: 'Från samtal', description: 'Använd AI-förslag', color: 'emerald' }] : [])
  ]

  const colorMap: Record<string, string> = {
    violet: 'from-violet-500/20 to-violet-500/5 border-violet-500/30 hover:border-violet-500/60',
    fuchsia: 'from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/30 hover:border-fuchsia-500/60',
    cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 hover:border-cyan-500/60',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 hover:border-amber-500/60',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/60',
  }

  const iconColorMap: Record<string, string> = {
    violet: 'text-violet-400',
    fuchsia: 'text-fuchsia-400',
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">Hur vill du börja?</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {methods.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`flex flex-col items-center gap-3 p-5 rounded-xl border bg-gradient-to-b transition-all ${colorMap[m.color]}`}
          >
            <m.icon className={`w-8 h-8 ${iconColorMap[m.color]}`} />
            <div className="text-center">
              <p className="text-sm font-medium text-white">{m.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{m.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
