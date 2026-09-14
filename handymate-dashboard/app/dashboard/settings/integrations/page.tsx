'use client'

import { ContactReadiness } from '@/components/onboarding/ContactReadiness'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import { ArrowLeft, Globe, Calendar, Mail, ChevronRight, Copy, Check, Loader2, Lock, Receipt, RefreshCw, Download } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

interface FortnoxStatus {
  connected: boolean
  company_name: string | null
  connected_at: string | null
  last_synced_at: string | null
}

type WidgetState = 'not_enabled' | 'enabled_unverified' | 'installed' | 'tested' | 'lead_verified'

interface WidgetStatus {
  state: WidgetState
  label: string
  last_seen_at: string | null
  last_seen_host: string | null
  last_tested_at: string | null
  lead_verified_at: string | null
}

const WIDGET_BADGE: Record<WidgetState, string> = {
  not_enabled: 'bg-gray-100 text-gray-500',
  enabled_unverified: 'bg-slate-100 text-slate-600',
  installed: 'bg-blue-100 text-blue-700',
  tested: 'bg-cyan-100 text-cyan-700',
  lead_verified: 'bg-teal-50 text-teal-800',
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
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [widgetStatus, setWidgetStatus] = useState<WidgetStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [fortnox, setFortnox] = useState<FortnoxStatus | null>(null)
  const [fortnoxAction, setFortnoxAction] = useState<'syncing' | 'disconnecting' | 'importing' | null>(null)
  const [fortnoxToast, setFortnoxToast] = useState<string | null>(null)
  const [emailLead, setEmailLead] = useState<{ address: string | null; last_received_at: string | null } | null>(null)
  const [emailLeadLoading, setEmailLeadLoading] = useState(true)
  const [emailLeadUnavailable, setEmailLeadUnavailable] = useState(false)
  const [emailLeadActivating, setEmailLeadActivating] = useState(false)
  const [emailLeadCopied, setEmailLeadCopied] = useState(false)
  const [emailLeadError, setEmailLeadError] = useState<string | null>(null)

  const refreshFortnox = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/fortnox/status')
      if (res.ok) {
        const data = await res.json()
        setFortnox(data)
      }
    } catch { /* non-blocking */ }
  }, [])

  const refreshEmailLead = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/email-lead')
      if (res.status === 503) {
        setEmailLeadUnavailable(true)
        setEmailLead(null)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setEmailLead({ address: data.address || null, last_received_at: data.last_received_at || null })
        setEmailLeadUnavailable(false)
      }
    } catch { /* non-blocking */ }
  }, [])

  useEffect(() => {
    if (!business.business_id) return
    let cancelled = false
    ;(async () => {
      try {
        const [googleRes, widgetRes] = await Promise.all([
          fetch('/api/google/status').then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/widget/status').then(r => r.ok ? r.json() : null).catch(() => null),
          refreshFortnox(),
          refreshEmailLead(),
        ])
        if (cancelled) return
        setCalendarConnected(!!(googleRes?.connected && googleRes?.syncEnabled))
        setWidgetStatus(widgetRes)
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) {
          setStatusLoading(false)
          setEmailLeadLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [business.business_id, refreshFortnox, refreshEmailLead])

  // Visa toast vid OAuth-callback
  useEffect(() => {
    const status = searchParams?.get('fortnox')
    if (status === 'connected') {
      setFortnoxToast('Fortnox kopplad!')
    } else if (status === 'error') {
      const msg = searchParams?.get('message') || 'Något gick fel'
      setFortnoxToast(`Fortnox: ${msg}`)
    }
  }, [searchParams])

  async function handleFortnoxSyncNow() {
    setFortnoxToast(null)
    setFortnoxAction('syncing')
    try {
      const res = await fetch('/api/integrations/fortnox/sync-now', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success !== false) {
        setFortnoxToast(
          `Synkat: ${data.imported || 0} nya, ${data.updated || 0} uppdaterade, ${data.checked} kontrollerade, ${data.marked_paid} markerade som betalda${data.marked_overdue ? `, ${data.marked_overdue} förfallna` : ''}`
        )
      } else {
        setFortnoxToast(`Synk misslyckades: ${data.error || data.errors?.[0]?.error || data.errors?.[0] || 'Alla fakturor kunde inte synkas. Kontrollera anslutningen och försök igen.'}`)
      }
      await refreshFortnox()
    } catch (err: any) {
      setFortnoxToast(`Synk misslyckades: ${err.message || 'okänt fel'}`)
    } finally {
      setFortnoxAction(null)
    }
  }

  /**
   * "Hämta historik" (2026-08-15) — samma två import-rutter som onboardingens
   * StepImportData.tsx anropar (kunder, sedan fakturor), bara exponerade här
   * för REDAN anslutna kunder som kopplade Fortnox innan historik-widening
   * fanns, eller som vill köra om senare. Idempotent: båda rutterna dedupar
   * redan (fortnox_customer_number/e-post/telefon respektive
   * fortnox_document_number) — säkert att klicka flera gånger.
   */
  async function handleFortnoxImportHistory() {
    setFortnoxToast(null)
    setFortnoxAction('importing')
    try {
      const customerRes = await fetch('/api/integrations/fortnox/import/customers', { method: 'POST' })
      const customerData = await customerRes.json()
      if (!customerRes.ok || customerData.success === false || customerData.errors?.length) throw new Error('Kunderna kunde inte hämtas. Kontrollera Fortnox-anslutningen.')
      const res = await fetch('/api/integrations/fortnox/import/invoices', { method: 'POST' })
      const data = await res.json()

      let supplierMessage = ''
      try {
        const supplierRes = await fetch('/api/integrations/fortnox/import/supplier-invoices', { method: 'POST' })
        const supplierData = await supplierRes.json()
        if (supplierRes.ok && supplierData.imported > 0) {
          supplierMessage = ` + ${supplierData.imported} leverantörsfakturor`
        }
      } catch {
        // Nätverksfel på det tredje anropet ska inte förstöra toasten för
        // de två som redan lyckades.
      }

      if (res.ok && data.success !== false) {
        setFortnoxToast(
          `Historik hämtad: ${data.imported} fakturor importerade, ${data.updated || 0} uppdaterade${data.skipped ? `, ${data.skipped} redan kända` : ''}${supplierMessage}`
        )
      } else {
        setFortnoxToast(`Historik-hämtning misslyckades: ${data.error || data.errors?.[0]?.error || data.errors?.[0] || 'Alla fakturor kunde inte synkas. Kontrollera anslutningen och försök igen.'}`)
      }
      await refreshFortnox()
    } catch (err: any) {
      setFortnoxToast(`Historik-hämtning misslyckades: ${err.message || 'okänt fel'}`)
      await refreshFortnox()
    } finally {
      setFortnoxAction(null)
    }
  }

  async function handleFortnoxDisconnect() {
    if (!confirm('Koppla från Fortnox? Anslutningen avslutas. Importerade kunder och fakturor finns kvar i Handymate.')) return
    setFortnoxAction('disconnecting')
    try {
      await fetch('/api/integrations/fortnox/disconnect', { method: 'POST' })
      await refreshFortnox()
      setFortnoxToast('Fortnox frånkopplad')
    } catch (err: any) {
      setFortnoxToast(`Misslyckades: ${err.message}`)
    } finally {
      setFortnoxAction(null)
    }
  }

  async function handleActivateEmailLead() {
    setEmailLeadActivating(true)
    setEmailLeadError(null)
    try {
      const res = await fetch('/api/integrations/email-lead', { method: 'POST' })
      if (res.status === 503) {
        setEmailLeadUnavailable(true)
        return
      }
      const data = await res.json()
      if (res.ok) {
        setEmailLead({ address: data.address || null, last_received_at: data.last_received_at || null })
      } else {
        setEmailLeadError(data.error || 'Något gick fel')
      }
    } catch (err: any) {
      setEmailLeadError(err.message || 'Något gick fel')
    } finally {
      setEmailLeadActivating(false)
    }
  }

  function handleCopyEmailLead() {
    if (!emailLead?.address) return
    navigator.clipboard.writeText(emailLead.address)
    setEmailLeadCopied(true)
    setTimeout(() => setEmailLeadCopied(false), 2000)
  }

  if (!business.business_id) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-10 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-5xl mx-auto">
        <header className="mb-9">
          <Link href="/dashboard/settings" className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Inställningar
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Integrationer</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-500">Dina verktyg, samlade i arbetsflödet. Hantera anslutningar och följ vad som hämtas till Handymate.</p>
        </header>

        {/* Integration cards */}
        <div className="space-y-4 mb-8">
          <div className="pb-1"><h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Ekonomi</h2></div>
          {/* Fortnox */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
              <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-teal-800 bg-teal-50 border border-teal-100">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-950">Fortnox</h3>
                  {statusLoading ? (
                    <span className="text-xs text-slate-500">Hämtar anslutning…</span>
                  ) : fortnox?.connected ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-medium">
                      Ansluten
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Ej kopplad</span>
                  )}
                </div>
                {fortnox?.connected ? (
                  <div className="mt-2 space-y-1 text-sm text-slate-500">
                    <p className="font-medium text-slate-700">{fortnox.company_name || 'Företagsnamn saknas'}</p>
                    <p>Senast synkad: {relativeTime(fortnox.last_synced_at)}</p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    Hämta fakturor och håll dem uppdaterade från Fortnox.
                  </p>
                )}
              </div>
              {statusLoading ? null : !fortnox?.connected ? (
                <a
                  href="/api/integrations/fortnox/connect"
                  className="text-xs font-medium text-white bg-[#0F766E] hover:bg-[#0D9488] px-4 py-2 rounded-lg flex-shrink-0"
                >
                  Koppla Fortnox
                </a>
              ) : (
                <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-4 sm:mt-1">
                  <button
                    onClick={handleFortnoxSyncNow}
                    disabled={fortnoxAction !== null}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
                  >
                    {fortnoxAction === 'syncing' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {fortnoxAction === 'syncing' ? 'Synkar fakturor…' : 'Synka nu'}
                  </button>
                  <button
                    onClick={handleFortnoxImportHistory}
                    disabled={fortnoxAction !== null}
                    title="Hämta betalda och obetalda fakturor senaste 12 månaderna, plus alla öppna oavsett ålder"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
                  >
                    {fortnoxAction === 'importing' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {fortnoxAction === 'importing' ? 'Hämtar historik…' : 'Hämta historik'}
                  </button>
                  <button
                    onClick={handleFortnoxDisconnect}
                    disabled={fortnoxAction !== null}
                    className="sm:ml-auto min-h-11 rounded-lg px-3 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50"
                  >
                    Koppla från
                  </button>
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
              <p className="text-sm leading-relaxed text-slate-600">Ändra fakturorna i Fortnox. Synka sedan för att hämta nya fakturor, ändrade belopp och betalstatus till Handymate.</p>
            </div>
            {fortnoxToast && (
              <div role="status" aria-live="polite" className={`border-t px-5 py-4 text-sm leading-relaxed sm:px-6 ${/misslyckades|fel|Fortnox:/i.test(fortnoxToast) ? 'border-red-100 bg-red-50 text-red-800' : 'border-teal-100 bg-teal-50 text-teal-900'}`}>
                {fortnoxToast}
              </div>
            )}
          </div>

          <ContactReadiness key={business.business_id} />
          <div className="pt-7 pb-1"><h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Planering & kundkontakt</h2></div>
          {/* Hemsida-widget */}
          <Link
            href="/dashboard/settings/website-widget"
            className="group flex items-start sm:items-center gap-4 p-5 sm:p-6 bg-white rounded-xl border border-slate-200 transition-colors hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <div className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 bg-slate-50">
              <Globe className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">Hemsida-widget</span>
                {!statusLoading && widgetStatus && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${WIDGET_BADGE[widgetStatus.state]}`}>
                    {widgetStatus.label}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                {widgetStatus?.state === 'installed' && widgetStatus.last_seen_host
                  ? `Senast sedd på ${widgetStatus.last_seen_host} ${relativeTime(widgetStatus.last_seen_at)}`
                  : widgetStatus?.state === 'tested'
                    ? `Senast testad ${relativeTime(widgetStatus.last_tested_at)}`
                    : widgetStatus?.state === 'lead_verified'
                      ? `Leadflödet verifierades ${relativeTime(widgetStatus.lead_verified_at)}`
                      : 'Lägg till en chattwidget på din hemsida så kunder kan kontakta dig direkt'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>

          {/* Google Calendar. ?tab= krävs (buggfix 2026-08-11): utan den
              landade klicket på inställnings-hubben utan vald flik och
              kopplingsknappen gick inte att hitta. */}
          <Link
            href="/dashboard/settings?tab=integrations"
            className="group flex items-start sm:items-center gap-4 p-5 sm:p-6 bg-white rounded-xl border border-slate-200 transition-colors hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <div className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 bg-slate-50">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">Google Calendar</span>
                {!statusLoading && calendarConnected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-medium">Kopplad</span>
                )}
                {!statusLoading && !calendarConnected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Ej kopplad</span>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">Synka bokningar automatiskt med din Google Kalender</p>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Behörighet: Kalender (läsa och skriva bokningar)
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>

          {/* Företagsmail → förfrågningar */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
              <div className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 bg-slate-50">
                <Mail className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">Företagsmail → förfrågningar</span>
                  {!emailLeadLoading && emailLead?.address && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-medium">Aktiv</span>
                  )}
                  {!emailLeadLoading && !emailLead?.address && !emailLeadUnavailable && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Ej aktiverad</span>
                  )}
                </div>
                {emailLeadUnavailable ? (
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">Funktionen aktiveras inom kort</p>
                ) : emailLead?.address ? (
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">Kundförfrågningar som kommer via mail hamnar direkt i din kö</p>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">Få förfrågningar som skickas till din mail direkt i din kö</p>
                )}
              </div>
              {!emailLeadUnavailable && !emailLeadLoading && !emailLead?.address && (
                <button
                  onClick={handleActivateEmailLead}
                  disabled={emailLeadActivating}
                  className="text-xs font-medium text-white bg-[#0F766E] hover:bg-[#0D9488] px-4 py-2 rounded-lg flex-shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {emailLeadActivating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Aktivera
                </button>
              )}
            </div>
            {emailLead?.address && (
              <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="flex items-center gap-2 bg-gray-50 border border-[#E2E8F0] rounded-lg px-3 py-2">
                  <span className="text-sm font-mono text-gray-800 break-all min-w-0 flex-1">{emailLead.address}</span>
                  <button
                    onClick={handleCopyEmailLead}
                    className="p-1.5 rounded-md text-gray-500 hover:text-[#0F766E] hover:bg-white transition-colors flex-shrink-0"
                    title="Kopiera"
                    aria-label={emailLeadCopied ? 'Adress kopierad' : 'Kopiera e-postadress'}
                  >
                    {emailLeadCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Vidarebefordra din företagsmail (t.ex. info@dittbolag.se) till adressen ovan så fångar Handymate förfrågningar automatiskt. Mail som inte är förfrågningar ignoreras.
                </p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {emailLead.last_received_at ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-medium">
                      Senast mottaget: {relativeTime(emailLead.last_received_at)}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                      Väntar på första mailet
                    </span>
                  )}
                </div>
              </div>
            )}
            {emailLeadError && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
                {emailLeadError}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
