'use client'

import { useEffect, useState } from 'react'
import { Smartphone, X, Bell } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'handymate_pwa_banner_dismissed'
const PUSH_SUBSCRIBED_KEY = 'handymate_push_subscribed'

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}

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

  // If standalone, subscribe to push automatically
  useEffect(() => {
    if (!isStandalone || !PUBLIC_VAPID_KEY) return
    if (localStorage.getItem(PUSH_SUBSCRIBED_KEY)) return
    subscribeToPush()
  }, [isStandalone])

  async function subscribeToPush() {
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) return
    if (!PUBLIC_VAPID_KEY) return

    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        setPushGranted(true)
        localStorage.setItem(PUSH_SUBSCRIBED_KEY, '1')
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      })

      const { endpoint, keys } = subscription.toJSON() as {
        endpoint: string
        keys: { p256dh: string; auth: string }
      }

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
      })

      setPushGranted(true)
      localStorage.setItem(PUSH_SUBSCRIBED_KEY, '1')
    } catch (err) {
      console.warn('Push subscription failed:', err)
    }
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
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-teal-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Installera Handymate</p>
            <p className="text-zinc-400 text-xs mt-0.5">
              Lägg till som app på din telefon och få push-notiser om nya godkännanden.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium rounded-lg transition-all"
              >
                <Bell className="w-3.5 h-3.5" />
                Installera
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs rounded-lg transition-all"
              >
                Inte nu
              </button>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
