'use client'

import { useState, useEffect } from 'react'
import { X, ArrowRight } from 'lucide-react'

/**
 * Touchpoint 1 (dag 0, första inloggningen) — se tasks/onboarding-foljeskrift.md.
 * Ordagrann copy, en kort ruta hantverkaren inte tvingas läsa igenom — inget
 * feature-kort-rutnät, ingen video. Visas en gång (localStorage-gate).
 */
export default function WelcomeModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem('handymate_welcome_dismissed')
    if (!dismissed) setShow(true)
  }, [])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem('handymate_welcome_dismissed', '1')
    setShow(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 animate-in fade-in zoom-in duration-300">
        <button
          onClick={(e) => { e.stopPropagation(); dismiss() }}
          className="absolute top-4 right-4 z-10 p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-3">
          Välkommen — ditt team är på plats.
        </h2>

        <p className="text-sm text-gray-600 leading-relaxed mb-3">
          Du har precis anställt sex medhjälpare. De börjar med att lära känna
          ditt företag de närmaste dagarna — dina kunder, dina priser, ditt sätt.
        </p>

        <p className="text-sm text-gray-600 leading-relaxed mb-3">
          Sen börjar de jobba. Lisa fångar samtalen du missar. Karin håller
          koll på fakturorna. Daniel följer upp offerterna. Och du?
        </p>

        <p className="text-sm text-gray-600 leading-relaxed mb-6">
          <b className="text-gray-900">Du är chefen.</b> Ingenting går ut utan
          ditt OK. Allt de föreslår hamnar i din kö — godkänn med ett tryck,
          eller låt bli. Ju mer de bevisar sig, desto mer kan du lämna över, i
          din takt.
        </p>

        <button
          onClick={dismiss}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-700 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          Visa mig kön
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
