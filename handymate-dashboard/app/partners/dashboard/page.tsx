'use client'

// Partnerportalen (omskriven 2026-08-11, partnerprogram v2).
// Orkestrerare — kortlogiken bor i ./components/. Nytt mot v1:
//  - Kundkort med aktivitetsnivå + Uppföljning 1/2/3 + provisionsläge
//  - Provisionsunderlag per månad (kund × månad × sats × belopp) ur liggaren
//  - Partnerns FAKTISKA trappa visas — ingen hårdkodad "20 % i 12 månader"
//  - Hemligheter (api-nyckel/webhook-secret) hämtas på begäran, ligger
//    inte i sidans standardpayload

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Zap, Copy, Check, Users, TrendingUp, Banknote, Wallet, LogOut,
  Loader2, Eye, EyeOff, Share2, Settings, X,
} from 'lucide-react'
import ReferralCard from './components/ReferralCard'
import AgreementGate from '../components/AgreementGate'
import StatementSection from './components/StatementSection'
import {
  formatSek,
  type PartnerData, type Stats, type Referral, type Statement, type PartnerEvent,
} from './components/types'

const WEBHOOK_EVENT_OPTIONS = [
  { key: 'trial_started', label: 'Registrering via din länk' },
  { key: 'converted', label: 'Konverterad till betalande' },
  { key: 'plan_upgraded', label: 'Plan uppgraderad' },
  { key: 'churned', label: 'Kund avslutad' },
]

export default function PartnerDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<PartnerData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [statements, setStatements] = useState<Statement[]>([])
  const [eventsByBusiness, setEventsByBusiness] = useState<Record<string, PartnerEvent[]>>({})

  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // Hemligheter hämtas på begäran (GET /api/partners/webhook), aldrig i standardpayloaden.
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const [webhookOpen, setWebhookOpen] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>([])
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null)

  const [expandedRef, setExpandedRef] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    fetchDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchDashboard() {
    try {
      const res = await fetch('/api/partners/dashboard')
      if (res.status === 401) {
        router.push('/partners/login')
        return
      }
      const data = await res.json()
      setPartner(data.partner)
      setStats(data.stats)
      setReferrals(data.referrals || [])
      setStatements(data.statements || [])
      setEventsByBusiness(data.events_by_business || {})

      if (data.partner) {
        setWebhookUrl(data.partner.webhook_url || '')
        setWebhookEvents(data.partner.webhook_events || ['trial_started', 'converted', 'plan_upgraded', 'churned'])
      }
    } catch {
      router.push('/partners/login')
    } finally {
      setLoading(false)
    }
  }

  async function fetchSecrets(): Promise<{ api_key: string | null; webhook_secret: string | null } | null> {
    try {
      const res = await fetch('/api/partners/webhook')
      if (!res.ok) return null
      const data = await res.json()
      setRevealedKey(data.api_key || null)
      setRevealedSecret(data.webhook_secret || null)
      return data
    } catch {
      return null
    }
  }

  async function toggleShowKey() {
    if (!showKey && revealedKey === null) await fetchSecrets()
    setShowKey(v => !v)
  }

  async function openWebhookModal() {
    if (revealedSecret === null) await fetchSecrets()
    setWebhookOpen(true)
  }

  async function handleLogout() {
    await fetch('/api/partners/logout', { method: 'POST' })
    router.push('/partners/login')
  }

  function copyToClipboard(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  async function saveWebhook() {
    setWebhookSaving(true)
    setWebhookTestResult(null)
    try {
      const res = await fetch('/api/partners/webhook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: webhookUrl, webhook_events: webhookEvents }),
      })
      if (res.ok) {
        await fetchDashboard()
        setWebhookTestResult('Sparat!')
      } else {
        const data = await res.json()
        setWebhookTestResult(data.error || 'Något gick fel')
      }
    } catch {
      setWebhookTestResult('Nätverksfel')
    } finally {
      setWebhookSaving(false)
    }
  }

  async function testWebhook() {
    setWebhookTesting(true)
    setWebhookTestResult(null)
    try {
      const res = await fetch('/api/partners/webhook', { method: 'POST' })
      const data = await res.json()
      setWebhookTestResult(data.message || (data.success ? 'OK' : 'Misslyckades'))
    } catch {
      setWebhookTestResult('Nätverksfel')
    } finally {
      setWebhookTesting(false)
    }
  }

  function toggleWebhookEvent(key: string) {
    setWebhookEvents(prev =>
      prev.includes(key) ? prev.filter(e => e !== key) : [...prev, key]
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (!partner || !stats) return null

  // Avtalsgrind (P0-9): ingen portal förrän gällande partneravtal är accepterat.
  if (partner.agreement_required) {
    return (
      <AgreementGate
        partnerName={partner.name}
        agreementVersion={partner.current_agreement_version}
        onAccepted={fetchDashboard}
      />
    )
  }

  const referralUrl = partner.referral_url || `https://app.handymate.se/registrera?ref=${partner.referral_code}`

  const statCards = [
    { label: 'Hänvisade företag', value: String(stats.total_referred), icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Aktiva kunder', value: String(stats.active_customers), icon: TrendingUp, color: 'text-green-600 bg-green-50' },
    { label: 'Upplupen provision', value: formatSek(stats.pending_commission_sek), icon: Wallet, color: 'text-amber-600 bg-amber-50' },
    { label: 'Utbetalt totalt', value: formatSek(stats.total_earned_sek), icon: Banknote, color: 'text-primary-700 bg-primary-50' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── Nav ─── */}
      <nav className="border-b border-gray-100 bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <Link href="https://handymate.se/partners" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-800 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">Handymate</span>
            <span className="text-sm text-primary-700 font-medium ml-1">Partner</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logga ut
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        {/* ─── Header ─── */}
        <div>
          <p className="text-sm text-primary-700 font-medium">🤝 Handymate Partner</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            Välkommen, {partner.name}!
          </h1>
        </div>

        {/* ─── Stat cards ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(stat => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ─── Referral link + API key ─── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Din unika länk</p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-900 font-mono truncate">{referralUrl}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(referralUrl, setCopiedLink)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-800 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedLink ? 'Kopierad!' : 'Kopiera'}
                </button>
                <button
                  onClick={() => setShareOpen(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <Share2 className="w-4 h-4" />
                  Dela
                </button>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Din API-nyckel</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-sm font-mono text-gray-900">
                  {showKey && revealedKey ? revealedKey : (partner.api_key_masked || '••••••••••••••••••••')}
                </p>
              </div>
              <button
                onClick={toggleShowKey}
                className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
                title={showKey ? 'Dölj' : 'Visa'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={async () => {
                  const key = revealedKey ?? (await fetchSecrets())?.api_key ?? null
                  if (key) copyToClipboard(key, setCopiedKey)
                }}
                className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
                title="Kopiera"
              >
                {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Kundlista ─── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Dina kunder</h2>
            <p className="text-sm text-gray-500 mt-0.5">Klicka på Uppföljning 1/2/3 när du haft kontakt — så håller vi koll tillsammans</p>
          </div>

          {referrals.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Inga hänvisningar ännu</p>
              <p className="text-sm text-gray-400 mt-1">Dela din länk med hantverkare du känner</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {referrals.map(ref => (
                <ReferralCard
                  key={ref.id}
                  referral={ref}
                  events={eventsByBusiness[ref.business_id] || []}
                  expanded={expandedRef === ref.id}
                  onToggle={() => setExpandedRef(expandedRef === ref.id ? null : ref.id)}
                  onFollowupChanged={fetchDashboard}
                />
              ))}
            </div>
          )}
        </div>

        {/* ─── Provisionsunderlag ─── */}
        <StatementSection
          statements={statements}
          tiers={partner.commission_tiers}
          legacyRate={partner.legacy_commission_rate}
          baseRateAfter={partner.base_rate_after}
          currentTierRate={stats.current_tier_rate}
          activeCustomers={stats.active_customers}
          ladderMonths={partner.ladder_months}
        />

        {/* ─── Webhook settings ─── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Webhook-inställningar</h3>
              <p className="text-sm text-gray-500 mt-1">Få notifikationer när dina leads konverterar</p>
            </div>
            <button
              onClick={openWebhookModal}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Konfigurera
            </button>
          </div>
          {partner.webhook_url && (
            <div className="mt-3 text-xs text-gray-500">
              Aktiv: <span className="font-mono">{partner.webhook_url}</span>
            </div>
          )}
        </div>

        {/* ─── Utbetalningsinfo ─── */}
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-5">
          <h3 className="font-semibold text-primary-800 mb-2">Om provisionsutbetalning</h3>
          <p className="text-sm text-primary-700">
            Provisionen räknas på vad dina kunder faktiskt betalat och ackrueras automatiskt
            månaden efter betalningen. Utbetalning sker via självfakturering: du fakturerar oss
            beloppet i underlaget ovan, månadsvis i efterskott. Dina exakta villkor ser du i
            provisionssektionen.
          </p>
        </div>
      </div>

      {/* ─── Share modal ─── */}
      {shareOpen && (
        <ModalOverlay onClose={() => setShareOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Dela din länk</h3>
              <button onClick={() => setShareOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">Dela din referrallänk via:</p>
            <div className="space-y-2">
              <a
                href={`mailto:?subject=Prova Handymate&body=Jag använder Handymate för mitt hantverksföretag. Registrera dig här: ${encodeURIComponent(referralUrl)}`}
                className="flex items-center gap-3 w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-sm text-gray-900"
                target="_blank"
                rel="noopener noreferrer"
              >
                📧 E-post
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Prova Handymate för ditt hantverksföretag! ${referralUrl}`)}`}
                className="flex items-center gap-3 w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-sm text-gray-900"
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 WhatsApp
              </a>
              <a
                href={`sms:?body=${encodeURIComponent(`Prova Handymate! ${referralUrl}`)}`}
                className="flex items-center gap-3 w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-sm text-gray-900"
              >
                📱 SMS
              </a>
              <button
                onClick={() => {
                  copyToClipboard(referralUrl, setCopiedLink)
                  setShareOpen(false)
                }}
                className="flex items-center gap-3 w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-sm text-gray-900"
              >
                📋 Kopiera länk
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ─── Webhook modal ─── */}
      {webhookOpen && (
        <ModalOverlay onClose={() => setWebhookOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Webhook-inställningar</h3>
              <button onClick={() => setWebhookOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://din-server.se/webhooks/handymate"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Händelser att notifiera</label>
                <div className="space-y-2">
                  {WEBHOOK_EVENT_OPTIONS.map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(opt.key)}
                        onChange={() => toggleWebhookEvent(opt.key)}
                        className="rounded border-gray-300 text-primary-700 focus:ring-primary-600"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook secret (för signaturverifiering)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-mono text-gray-600 truncate">
                      {revealedSecret || (partner.has_webhook_secret ? '••••••••' : '—')}
                    </p>
                  </div>
                  <button
                    onClick={() => revealedSecret && copyToClipboard(revealedSecret, setCopiedSecret)}
                    className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
                    title="Kopiera"
                  >
                    {copiedSecret ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {webhookTestResult && (
                <p className="text-sm text-gray-700 bg-slate-50 rounded-lg px-3 py-2">
                  {webhookTestResult}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={testWebhook}
                  disabled={webhookTesting || !partner.webhook_url}
                  className="flex-1 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {webhookTesting ? 'Skickar...' : 'Testa webhook'}
                </button>
                <button
                  onClick={saveWebhook}
                  disabled={webhookSaving}
                  className="flex-1 px-4 py-2 bg-primary-800 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {webhookSaving ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}
