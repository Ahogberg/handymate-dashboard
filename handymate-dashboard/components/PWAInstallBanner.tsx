'use client'

import { useEffect, useState } from 'react'
import { Smartphone, X, Bell } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { PUSH_SUBSCRIBED_KEY, PUBLIC_VAPID_KEY, arIOS, prenumereraPaPush } from '@/lib/push/prenumerera-klient'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'handymate_pwa_banner_dismissed'

export default function PWAInstallBanner() {
  const business = useBusiness()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [pushGranted, setPushGranted] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already installed / dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Fråga om push i standalone (installerad PWA) ELLER i en vanlig flik på
  // en icke-iOS-plattform — bara iOS kräver installation innan push funkar.
  useEffect(() => {
    if (!PUBLIC_VAPID_KEY) return
    if (!isStandalone && arIOS()) return
    if (localStorage.getItem(PUSH_SUBSCRIBED_KEY)) return
    subscribeToPush()
  }, [isStandalone])

  // Delad med "Notiser"-kortet i inställningarna (lib/push/prenumerera-klient.ts)
  // — exakt samma kod, ingen dubblerad pushManager.subscribe.
  async function subscribeToPush() {
    const ok = await prenumereraPaPush()
    if (ok) setPushGranted(true)
  }

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
      await subscribeToPush()
    }
    setInstallPrompt(null)
  }

  function handleDismiss() {
    setShowBanner(false)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  if (!showBanner || !business?.business_id) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-primary-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 font-semibold text-sm">Installera Handymate</p>
            <p className="text-gray-500 text-xs mt-0.5">
              Lägg till som app på din telefon och få push-notiser om nya godkännanden.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-700 hover:bg-primary-600 text-white text-xs font-medium rounded-lg transition-all"
              >
                <Bell className="w-3.5 h-3.5" />
                Installera
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-gray-500 hover:text-gray-900 text-xs rounded-lg transition-all"
              >
                Inte nu
              </button>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
