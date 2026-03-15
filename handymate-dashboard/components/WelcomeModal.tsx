'use client'

import { useState, useEffect } from 'react'
import { Sparkles, X, ArrowRight, Phone, FileText, Bot } from 'lucide-react'

interface WelcomeModalProps {
  businessName: string
}

export default function WelcomeModal({ businessName }: WelcomeModalProps) {
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

        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-teal-600 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Välkommen till Handymate{businessName ? `, ${businessName}` : ''}!
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            Din AI-drivna plattform för att hantera samtal, offerter och fakturor.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3 p-3 bg-teal-50 rounded-xl">
            <Phone className="w-5 h-5 text-sky-700 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">AI-telefonassistent</p>
              <p className="text-xs text-gray-500">Svara på samtal, boka möten och skapa leads automatiskt</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-teal-50 rounded-xl">
            <FileText className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Smarta offerter</p>
              <p className="text-xs text-gray-500">Generera offerter med AI från foto, röst eller text</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-xl">
            <Bot className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Automatiserad uppföljning</p>
              <p className="text-xs text-gray-500">SMS-påminnelser, fakturering och kundhantering</p>
            </div>
          </div>
        </div>

        <button
          onClick={dismiss}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          Kom igång
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
