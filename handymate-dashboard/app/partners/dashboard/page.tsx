'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Zap,
  Copy,
  Check,
  Users,
  TrendingUp,
  Clock,
  Banknote,
  LogOut,
  Loader2,
  Eye,
  EyeOff,
  Share2,
  Settings,
  X,
  ChevronDown,
  ChevronRight,
  Circle,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────

interface PartnerData {
  id: string
  name: string
  company: string | null
  email: string
  referral_code: string
  referral_url: string | null
  commission_rate: number
  total_earned_sek: number
  total_pending_sek: number
  api_key: string | null
  webhook_url: string | null
  webhook_secret: string | null
  webhook_events: string[]
}

interface Stats {
  total_referred: number
  active_customers: number
  total_converted: number
  pending_commission_sek: number
  total_earned_sek: number
  next_payout_sek: number
}

interface Referral {
  id: string
  email: string | null
  business_name: string | null
  plan: string | null
  subscription_status: string | null
  status: string
  created_at: string
  converted_at: string | null
  commission_month: number
  monthly_commission: number
  total_earned: number
}

interface PartnerEvent {
  id: string
  partner_id: string
  business_id: string | null
  event_type: string
  amount_sek: number | null
  meta: Record<string, unknown> | null
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────

function formatSek(amount: number): string {
  return amount.toLocaleString('sv-SE') + ' kr'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sv-SE')
}

function statusBadge(status: string): { text: string; color: string; icon: string } {
  switch (status) {
    case 'pending': return { text: 'Trial', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: '🔄' }
    case 'active': return { text: 'Aktiv', color: 'bg-green-50 text-green-700 border-green-200', icon: '✅' }
    case 'rewarded': return { text: 'Klar (12 mån)', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: '🏆' }
    case 'churned': return { text: 'Avslutad', color: 'bg-red-50 text-red-700 border-red-200', icon: '❌' }
    default: return { text: status, color: 'bg-gray-50 text-gray-700 border-gray-200', icon: '—' }
  }
}

function planLabel(plan: string | null): string {
  if (!plan) return '—'
  const map: Record<string, string> = {
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise',
    trial: 'Trial',
  }
  return map[plan] || plan
}

function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    referral_clicked: 'Klickade på din länk',
    trial_started: 'Startade trial',
    converted: 'Konverterade till betalande',
    plan_upgraded: 'Uppgraderade plan',
    provision_earned: 'Provision intjänad',
    provision_paid: 'Provision utbetald',
    churned: 'Avslutade prenumeration',
    test: 'Test-webhook',
  }
  return map[type] || type
}

const WEBHOOK_EVENT_OPTIONS = [
  { key: 'trial_started', label: 'Trial startad' },
  { key: 'converted', label: 'Konverterad till betalande' },
  { key: 'plan_upgraded', label: 'Plan uppgraderad' },
  { key: 'churned', label: 'Kund avslutad' },
]

// ─── Component ───────────────────────────────────────────────

export default function PartnerDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<PartnerData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [events, setEvents] = useState<PartnerEvent[]>([])
  const [eventsByBusiness, setEventsByBusiness] = useState<Record<string, PartnerEvent[]>>({})

  // Clipboard states
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // API key visibility
  const [showKey, setShowKey] = useState(false)

  // Webhook modal
  const [webhookOpen, setWebhookOpen] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>([])
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null)

  // Expanded referral timelines
  const [expandedRef, setExpandedRef] = useState<string | null>(null)

  // Share modal
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    fetchDashboard()
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
      setEvents(data.events || [])
      setEventsByBusiness(data.events_by_business || {})

      // Initialize webhook form
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

  function getEventsForBusiness(businessId: string | undefined): PartnerEvent[] {
    if (!businessId) return []
    return eventsByBusiness[businessId] || []
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-700 animate-spin" />
      </div>
    )
  }

  if (!partner || !stats) return null

  const referralUrl = partner.referral_url || `https://app.handymate.se/registrera?ref=${partner.referral_code}`

  const statCards = [
    { label: 'Hänvisade företag', value: String(stats.total_referred), icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Aktiva kunder', value: String(stats.active_customers), icon: TrendingUp, color: 'text-green-600 bg-green-50' },
    { label: 'Intjänat totalt', value: formatSek(stats.total_earned_sek), icon: Banknote, color: 'text-teal-600 bg-teal-50' },
    { label: 'Nästa utbetalning', value: formatSek(stats.next_payout_sek), icon: Clock, color: 'text-amber-600 bg-amber-50' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── Nav ─── */}
      <nav className="border-b border-gray-100 bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <Link href="https://handymate.se/partners" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-700 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">Handymate</span>
            <span className="text-sm text-teal-700 font-medium ml-1">Partner</span>
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
          <p className="text-sm text-teal-700 font-medium">🤝 Handymate Partner</p>
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
          {/* Referral link */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Din unika länk</p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-900 font-mono truncate">{referralUrl}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(referralUrl, setCopiedLink)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap"
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

          {/* API key */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Din API-nyckel</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-sm font-mono text-gray-900">
                  {showKey ? (partner.api_key || '—') : '••••••••••••••••••••'}
                </p>
              </div>
              <button
                onClick={() => setShowKey(!showKey)}
                className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
                title={showKey ? 'Dölj' : 'Visa'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => partner.api_key && copyToClipboard(partner.api_key, setCopiedKey)}
                className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
                title="Kopiera"
              >
                {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Referrals list ─── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Hänvisade företag</h2>
          </div>

          {referrals.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Inga hänvisningar ännu</p>
              <p className="text-sm text-gray-400 mt-1">Dela din länk med hantverkare du känner</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {referrals.map(ref => {
                const badge = statusBadge(ref.status)
                const isExpanded = expandedRef === ref.id
                const bizEvents = getEventsForBusiness(ref.id)
                // Find events by matching business_id from the enriched referral
                const refEvents = events.filter(e =>
                  e.meta && (e.meta as Record<string, unknown>).business_name === ref.business_name
                )

                return (
                  <div key={ref.id}>
                    {/* Main row */}
                    <button
                      onClick={() => setExpandedRef(isExpanded ? null : ref.id)}
                      className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {ref.business_name || ref.email || '—'}
                          </p>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge.color}`}>
                            {badge.icon} {badge.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          {ref.plan && <span>{planLabel(ref.plan)}</span>}
                          <span>Registrerad: {formatDate(ref.created_at)}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {ref.status === 'active' || ref.status === 'rewarded' ? (
                          <>
                            <p className="text-sm font-semibold text-teal-700">
                              {formatSek(ref.monthly_commission)}/mån
                            </p>
                            <p className="text-xs text-gray-500">
                              × {ref.commission_month} mån = {formatSek(ref.total_earned)}
                            </p>
                          </>
                        ) : ref.status === 'pending' ? (
                          <p className="text-xs text-gray-400">Startar vid konvertering</p>
                        ) : (
                          <p className="text-xs text-gray-400">Avslutad</p>
                        )}
                      </div>

                      <div className="shrink-0 text-gray-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </button>

                    {/* Expanded timeline */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pl-8">
                        <div className="border-l-2 border-gray-200 pl-4 space-y-3">
                          {/* Registration event */}
                          <TimelineItem
                            date={ref.created_at}
                            text="Registrerade sig via din länk"
                          />
                          {/* Trial start */}
                          <TimelineItem
                            date={ref.created_at}
                            text="Startade 14-dagars trial"
                          />
                          {/* Conversion */}
                          {ref.converted_at && (
                            <TimelineItem
                              date={ref.converted_at}
                              text={`Konverterade → ${planLabel(ref.plan)}`}
                            />
                          )}
                          {/* Commission start */}
                          {ref.converted_at && ref.monthly_commission > 0 && (
                            <TimelineItem
                              date={ref.converted_at}
                              text={`Provision: ${formatSek(ref.monthly_commission)}/mån startade`}
                            />
                          )}
                          {/* Monthly commission progress */}
                          {ref.commission_month > 0 && (
                            <TimelineItem
                              date={new Date().toISOString()}
                              text={`${ref.commission_month} månader aktiva — ${formatSek(ref.total_earned)} intjänat`}
                              active
                            />
                          )}
                          {/* Dynamic events from partner_events */}
                          {refEvents.map(evt => (
                            <TimelineItem
                              key={evt.id}
                              date={evt.created_at}
                              text={`${eventTypeLabel(evt.event_type)}${evt.amount_sek ? ` (${formatSek(evt.amount_sek)})` : ''}`}
                            />
                          ))}
                          {/* Status if churned */}
                          {ref.status === 'churned' && (
                            <TimelineItem
                              date={new Date().toISOString()}
                              text="Prenumeration avslutad — provision stoppad"
                            />
                          )}
                          {/* Status if rewarded */}
                          {ref.status === 'rewarded' && (
                            <TimelineItem
                              date={new Date().toISOString()}
                              text="12 månader uppnådda — provision klar!"
                              active
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── Webhook settings ─── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Webhook-inställningar</h3>
              <p className="text-sm text-gray-500 mt-1">Få notifikationer när dina leads konverterar</p>
            </div>
            <button
              onClick={() => setWebhookOpen(true)}
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

        {/* ─── Commission info ─── */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
          <h3 className="font-semibold text-teal-800 mb-2">Om provisionsutbetalning</h3>
          <p className="text-sm text-teal-700">
            Du tjänar 20% löpande provision i 12 månader per hantverkare som registrerar sig via din länk.
            Provisionen beräknas automatiskt varje månad. Utbetalning sker månadsvis i efterskott.
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
              {/* URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://din-server.se/webhooks/handymate"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                />
              </div>

              {/* Events */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Händelser att notifiera</label>
                <div className="space-y-2">
                  {WEBHOOK_EVENT_OPTIONS.map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(opt.key)}
                        onChange={() => toggleWebhookEvent(opt.key)}
                        className="rounded border-gray-300 text-teal-700 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Webhook secret */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook secret (för signaturverifiering)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-mono text-gray-600 truncate">
                      {partner.webhook_secret || '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => partner.webhook_secret && copyToClipboard(partner.webhook_secret, setCopiedSecret)}
                    className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
                    title="Kopiera"
                  >
                    {copiedSecret ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Result message */}
              {webhookTestResult && (
                <p className="text-sm text-gray-700 bg-slate-50 rounded-lg px-3 py-2">
                  {webhookTestResult}
                </p>
              )}

              {/* Actions */}
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
                  className="flex-1 px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 transition-colors disabled:opacity-50"
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

function TimelineItem({ date, text, active }: { date: string; text: string; active?: boolean }) {
  return (
    <div className="relative flex items-start gap-3">
      <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
        active ? 'bg-teal-500 border-teal-500' : 'bg-white border-gray-300'
      }`} />
      <div className="min-w-0">
        <p className={`text-sm ${active ? 'font-medium text-teal-700' : 'text-gray-700'}`}>{text}</p>
        <p className="text-xs text-gray-400">{formatDate(date)}</p>
      </div>
    </div>
  )
}
