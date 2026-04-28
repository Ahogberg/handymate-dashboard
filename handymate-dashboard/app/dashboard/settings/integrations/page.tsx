'use client'

import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import { ArrowLeft, Globe, Calendar, Mail, Code, ChevronRight, Copy, Check, Loader2, Lock, Receipt, RefreshCw } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

interface FortnoxStatus {
  connected: boolean
  company_name: string | null
  connected_at: string | null
  last_synced_at: string | null
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'aldrig'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'nyss'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min sedan`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h sedan`
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

export default function IntegrationsPage() {
  const business = useBusiness()
  const searchParams = useSearchParams()
  const [copied, setCopied] = useState(false)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [widgetEnabled, setWidgetEnabled] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [fortnox, setFortnox] = useState<FortnoxStatus | null>(null)
  const [fortnoxAction, setFortnoxAction] = useState<'syncing' | 'disconnecting' | null>(null)
  const [fortnoxToast, setFortnoxToast] = useState<string | null>(null)

  const embedCode = `<script src="https://app.handymate.se/embed.js" data-key="HM-${business.business_id?.slice(0, 8) || 'abc123'}"></script>`

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const refreshFortnox = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/fortnox/status')
      if (res.ok) {
        const data = await res.json()
        setFortnox(data)
      }
    } catch { /* non-blocking */ }
  }, [])

  useEffect(() => {
    if (!business.business_id) return
    let cancelled = false
    ;(async () => {
      try {
        const [googleRes] = await Promise.all([
          fetch('/api/google/status').then(r => r.ok ? r.json() : null).catch(() => null),
          refreshFortnox(),
        ])
        if (cancelled) return
        setCalendarConnected(!!(googleRes?.connected && googleRes?.syncEnabled))
        setWidgetEnabled(false)
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) setStatusLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [business.business_id, refreshFortnox])

  // Visa toast vid OAuth-callback
  useEffect(() => {
    const status = searchParams?.get('fortnox')
    if (status === 'connected') {
      setFortnoxToast('Fortnox kopplad!')
      setTimeout(() => setFortnoxToast(null), 4000)
    } else if (status === 'error') {
      const msg = searchParams?.get('message') || 'Något gick fel'
      setFortnoxToast(`Fortnox: ${msg}`)
      setTimeout(() => setFortnoxToast(null), 6000)
    }
  }, [searchParams])

  async function handleFortnoxSyncNow() {
    setFortnoxAction('syncing')
    try {
      const res = await fetch('/api/integrations/fortnox/sync-now', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setFortnoxToast(
          `Synkat: ${data.checked} fakturor kontrollerade, ${data.marked_paid} markerade som betalda${data.marked_overdue ? `, ${data.marked_overdue} förfallna` : ''}`
        )
      } else {
        setFortnoxToast(`Synk misslyckades: ${data.error || 'okänt fel'}`)
      }
      await refreshFortnox()
    } catch (err: any) {
      setFortnoxToast(`Synk misslyckades: ${err.message || 'okänt fel'}`)
    } finally {
      setFortnoxAction(null)
      setTimeout(() => setFortnoxToast(null), 5000)
    }
  }

  async function handleFortnoxDisconnect() {
    if (!confirm('Koppla från Fortnox? Tokens raderas men kund/faktura-kopplingar finns kvar.')) return
    setFortnoxAction('disconnecting')
    try {
      await fetch('/api/integrations/fortnox/disconnect', { method: 'POST' })
      await refreshFortnox()
      setFortnoxToast('Fortnox frånkopplad')
    } catch (err: any) {
      setFortnoxToast(`Misslyckades: ${err.message}`)
    } finally {
      setFortnoxAction(null)
      setTimeout(() => setFortnoxToast(null), 4000)
    }
  }

  if (!business.business_id) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/settings" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Integrationer</h1>
            <p className="text-sm text-gray-500">Koppla ihop Handymate med dina andra verktyg</p>
          </div>
        </div>

        {/* Integration cards */}
        <div className="space-y-3 mb-8">
          {/* Hemsida-widget */}
          <Link
            href="/dashboard/settings/website-widget"
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-[#E2E8F0] hover:border-primary-300 hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-primary-700 bg-primary-50">
              <Globe className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">Hemsida-widget</span>
                {!statusLoading && widgetEnabled && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Kopplad</span>
                )}
                {!statusLoading && !widgetEnabled && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Ej kopplad</span>
                )}
              </div>
              <p className="text-sm text-gray-500 truncate">Lägg till en chattwidget på din hemsida så kunder kan kontakta dig direkt</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>

          {/* Google Calendar */}
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-[#E2E8F0] hover:border-primary-300 hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-blue-600 bg-blue-50">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">Google Calendar</span>
                {!statusLoading && calendarConnected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Kopplad</span>
                )}
                {!statusLoading && !calendarConnected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Ej kopplad</span>
                )}
              </div>
              <p className="text-sm text-gray-500 truncate">Synka bokningar automatiskt med din Google Kalender</p>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Behörighet: Kalender (läsa och skriva bokningar)
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>

          {/* Fortnox */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-emerald-700 bg-emerald-50">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">Fortnox</span>
                  {fortnox?.connected ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                      Ansluten{fortnox.company_name ? ` · ${fortnox.company_name}` : ''}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Ej kopplad</span>
                  )}
                </div>
                {fortnox?.connected ? (
                  <p className="text-sm text-gray-500 truncate">
                    Senast synkad: {relativeTime(fortnox.last_synced_at)}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 truncate">
                    Synka fakturor och bokföring automatiskt
                  </p>
                )}
              </div>
              {!fortnox?.connected ? (
                <a
                  href="/api/integrations/fortnox/connect"
                  className="text-xs font-medium text-white bg-[#0F766E] hover:bg-[#0D9488] px-4 py-2 rounded-lg flex-shrink-0"
                >
                  Koppla Fortnox
                </a>
              ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleFortnoxSyncNow}
                    disabled={fortnoxAction !== null}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#0F766E] border border-[#E2E8F0] hover:border-[#0F766E] px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {fortnoxAction === 'syncing' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Synka nu
                  </button>
                  <button
                    onClick={handleFortnoxDisconnect}
                    disabled={fortnoxAction !== null}
                    className="text-xs text-gray-500 hover:text-red-600 px-2 py-1.5 disabled:opacity-50"
                  >
                    Koppla från
                  </button>
                </div>
              )}
            </div>
            {fortnoxToast && (
              <div className="px-4 py-2 bg-[#F0FDFA] border-t border-[#CCFBF1] text-xs text-[#0F766E]">
                {fortnoxToast}
              </div>
            )}
          </div>

          {/* E-post — kommer snart (icke-klickbar) */}
          <div
            aria-disabled="true"
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-[#E2E8F0] opacity-70 cursor-not-allowed select-none"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-400 bg-gray-100">
              <Mail className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">E-post</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
                  Kommer snart
                </span>
              </div>
              <p className="text-sm text-gray-500 truncate">Automatisk hantering av inkommande kundmail — aktiveras snart</p>
            </div>
            <span
              aria-hidden="true"
              className="text-xs font-medium text-gray-400 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 flex-shrink-0"
            >
              Inaktiv
            </span>
          </div>
        </div>

        {/* Embed code section */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <Code className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">Snabbinstallation</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Klistra in denna kod på din hemsida för att aktivera Handymate-widgeten
          </p>

          <div className="relative">
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto font-mono">
              {embedCode}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              title="Kopiera"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {copied && (
            <p className="text-xs text-emerald-600 mt-2">Kopierat till urklipp!</p>
          )}
        </div>
      </div>
    </div>
  )
}
