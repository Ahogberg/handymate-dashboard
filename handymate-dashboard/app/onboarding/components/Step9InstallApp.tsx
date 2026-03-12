'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Smartphone, Share, MoreHorizontal, Plus, Loader2, Rocket } from 'lucide-react'

interface Step9Props {
  onBack?: () => void
}

export default function Step9InstallApp({ onBack }: Step9Props) {
  const router = useRouter()
  const [finishing, setFinishing] = useState(false)

  const handleFinish = async () => {
    setFinishing(true)
    try {
      await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 10 }),
      })
    } catch {
      // Silent fail
    }
    router.push('/dashboard')
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Installera appen</h1>
        <p className="text-zinc-400 mt-2">Steg 9 av 9 — Få Handymate på din telefon</p>
      </div>

      <div className="flex justify-center">
        <div className="w-20 h-20 bg-teal-500/20 rounded-2xl flex items-center justify-center">
          <Smartphone className="w-10 h-10 text-teal-400" />
        </div>
      </div>

      {/* iOS instructions */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-white font-semibold">iPhone (Safari)</h2>
        <ol className="space-y-3">
          <li className="flex items-start gap-3 text-sm text-zinc-400">
            <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 mt-0.5">1</span>
            <span>Öppna <span className="text-white font-medium">app.handymate.se</span> i Safari</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-zinc-400">
            <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 mt-0.5">2</span>
            <span>Tryck på <Share className="w-3.5 h-3.5 inline text-blue-400 mx-0.5" /> delningsknappen längst ner i webbläsaren</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-zinc-400">
            <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 mt-0.5">3</span>
            <span>Välj <span className="text-white font-medium">"Lägg till på hemskärmen"</span> <Plus className="w-3.5 h-3.5 inline text-zinc-300 mx-0.5" /></span>
          </li>
          <li className="flex items-start gap-3 text-sm text-zinc-400">
            <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 mt-0.5">4</span>
            <span>Tryck <span className="text-white font-medium">"Lägg till"</span> — klart!</span>
          </li>
        </ol>
      </div>

      {/* Android instructions */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Android (Chrome)</h2>
        <ol className="space-y-3">
          <li className="flex items-start gap-3 text-sm text-zinc-400">
            <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 mt-0.5">1</span>
            <span>Öppna <span className="text-white font-medium">app.handymate.se</span> i Chrome</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-zinc-400">
            <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 mt-0.5">2</span>
            <span>Tryck på <MoreHorizontal className="w-3.5 h-3.5 inline text-zinc-300 mx-0.5" /> menyknappen uppe till höger</span>
          </li>
          <li className="flex items-start gap-3 text-sm text-zinc-400">
            <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 mt-0.5">3</span>
            <span>Välj <span className="text-white font-medium">"Lägg till på startskärmen"</span></span>
          </li>
          <li className="flex items-start gap-3 text-sm text-zinc-400">
            <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 mt-0.5">4</span>
            <span>Tryck <span className="text-white font-medium">"Installera"</span> — klart!</span>
          </li>
        </ol>
      </div>

      <div className="bg-teal-500/5 border border-teal-500/20 rounded-xl p-4 text-sm text-zinc-400">
        Appen fungerar som en vanlig mobilapp — snabb åtkomst till bokningar, offerter och AI-assistenten direkt från hemskärmen.
      </div>

      <button
        onClick={handleFinish}
        disabled={finishing}
        className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium text-lg disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {finishing ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Startar dashboard...</>
        ) : (
          <><Rocket className="w-5 h-5" /> Gå till Dashboard</>
        )}
      </button>

      {onBack && (
        <div className="text-center">
          <button onClick={onBack} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Tillbaka
          </button>
        </div>
      )}
    </div>
  )
}
