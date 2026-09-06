'use client'

// Partnerportalen (omdesignad 2026-09-07 efter Claude Design-mockupen,
// tidigare omskriven 2026-08-11 för partnerprogram v2).
// Orkestrerare — kortlogiken bor i ./components/.
//
// Sanningsregler för designen (avvikelser från mockupen är AVSIKTLIGA):
//  - Ingen "spåras i X dagar"-siffra på länken: ingen sådan TTL finns i koden.
//  - "Nästa utbetalning" heter Upplupen provision — upplupen är inte utbetald.
//  - Deemed-fristen (10 dagar, v193) visas bara vid faktisk pending-faktura.
//  - Trappan renderas bara när partnerns commission_tiers har steg; annars
//    fast sats. Aldrig en hårdkodad trappa.
//  - Avtalsrad ("Avtal X godkänt datum") är datadriven ur payloaden.
//  - Säljmaterial-sektionen väntar tills materialet finns publicerat.
//  - Hemligheter (api-nyckel/webhook-secret) hämtas på begäran, aldrig i
//    standardpayloaden.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Zap, Copy, Check, Users, LogOut, Loader2, Eye, EyeOff, Settings, X,
  Mail, MessageCircle, Smartphone,
} from 'lucide-react'
import ReferralCard from './components/ReferralCard'
import AgreementGate from '../components/AgreementGate'
import StatementSection from './components/StatementSection'
import BillingProfileCard from './components/BillingProfileCard'
import SelfBillingSection from './components/SelfBillingSection'
import {
  formatSek, formatDate, formatProcent,
  type PartnerData, type Stats, type Referral, type Statement, type PartnerEvent, type SelfBillingBatch,
} from './components/types'

const WEBHOOK_EVENT_OPTIONS = [
  { key: 'trial_started', label: 'Registrering via din länk' },
  { key: 'converted', label: 'Konverterad till betalande' },
  { key: 'plan_upgraded', label: 'Plan uppgraderad' },
  { key: 'churned', label: 'Kund avslutad' },
]

function halsning(): string {
  const h = new Date().getHours()
  if (h < 10) return 'God morgon'
  if (h < 18) return 'God dag'
  return 'God kväll'
}

function partnerSedan(createdAt: string | null): string | null {
  if (!createdAt) return null
  const d = new Date(createdAt)
  return `partner sedan ${d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}`
}

interface AttGoraPunkt {
  farg: string
  titel: string
  detalj: string
  knapp: string
  href: string
}

export default function PartnerDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<PartnerData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [statements, setStatements] = useState<Statement[]>([])
  const [selfBillingBatches, setSelfBillingBatches] = useState<SelfBillingBatch[]>([])
  const [eventsByBusiness, setEventsByBusiness] = useState<Record<string, PartnerEvent[]>>({})

  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // Hemligheter hämtas på begäran (GET /api/partners/webhook), aldrig i standardpayloaden.
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>([])
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null)

  const [expandedRef, setExpandedRef] = useState<string | null>(null)

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
      setSelfBillingBatches(data.self_billing_batches || [])
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

  async function openSettings() {
    if (revealedSecret === null) await fetchSecrets()
    setSettingsOpen(true)
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
  const tomtLage = referrals.length === 0
  const sedan = partnerSedan(partner.created_at)

  // Senaste självfaktura som väntar på partnerns granskning — driver hero-CTA:n.
  const pendingBatch = selfBillingBatches.find(b => b.review_status === 'pending' && b.status !== 'paid') || null

  const followupsFor = (ref: Referral) => new Set(ref.followups.map(f => f.nr))

  // "Behöver dig" — härlett ur riktig data, aldrig påhittade punkter.
  const attGora: AttGoraPunkt[] = []
  for (const b of selfBillingBatches) {
    if (b.review_status === 'pending' && b.status !== 'paid') {
      attGora.push({
        farg: '#f59e0b',
        titel: `Granska självfakturan ${b.invoice_number}`,
        detalj: `${formatSek(b.total_incl_vat_sek)} inkl. moms · förfaller ${formatDate(b.due_date)}`,
        knapp: 'Granska',
        href: '#sjalvfakturor',
      })
    }
  }
  if (!partner.billing_profile_complete) {
    attGora.push({
      farg: '#f59e0b',
      titel: 'Komplettera fakturauppgifterna',
      detalj: 'Självfakturan och utbetalningen behöver kompletta uppgifter',
      knapp: 'Komplettera',
      href: '#fakturauppgifter',
    })
  }
  for (const ref of referrals) {
    const done = followupsFor(ref)
    const namn = ref.business_name || ref.email || 'kund'
    if (ref.activity_level === 'onboardar' && !done.has(1)) {
      attGora.push({ farg: '#0f766e', titel: `Uppföljning 1 · ${namn}`, detalj: 'Registrerad och onboardar — hör hur starten går', knapp: 'Visa kund', href: '#kunder' })
    } else if (ref.activity_level === 'aktiv' && ref.customer_month >= 2 && !done.has(2)) {
      attGora.push({ farg: '#0f766e', titel: `Uppföljning 2 · ${namn}`, detalj: `Kund i ${ref.customer_month} månader — dags att höra hur det går`, knapp: 'Visa kund', href: '#kunder' })
    } else if (ref.activity_level === 'aktiv' && ref.customer_month >= 5 && !done.has(3)) {
      attGora.push({ farg: '#0f766e', titel: `Uppföljning 3 · ${namn}`, detalj: `Kund i ${ref.customer_month} månader`, knapp: 'Visa kund', href: '#kunder' })
    }
  }

  const tiers = Array.isArray(partner.commission_tiers) && partner.commission_tiers.length > 0
    ? [...partner.commission_tiers].sort((a, b) => a.min - b.min)
    : null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── Nav ─── */}
      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link href="https://handymate.se/partners" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary-800 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">Handymate</span>
            <span className="text-[11px] font-semibold tracking-widest text-primary-700 bg-teal-50 border border-primary-700/25 rounded-full px-2.5 py-0.5">PARTNER</span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={openSettings}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Inställningar</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logga ut</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {/* ─── Sidhuvud ─── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-primary-700 uppercase">Partnerportal</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-1">
              {halsning()}, {partner.name.split(' ')[0]}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {[partner.company, sedan].filter(Boolean).join(' · ')}
            </p>
          </div>
          {partner.agreement_version && (
            <div className="text-[13px] text-slate-500">
              Avtal {partner.agreement_version}
              {partner.agreement_accepted_at && <> godkänt {formatDate(partner.agreement_accepted_at)}</>}
              {' · '}
              <Link href="/partners/avtal" className="text-primary-700 hover:underline">Läs avtalet</Link>
            </div>
          )}
        </div>

        {tomtLage ? (
          /* ─── Tomt läge: kom igång ─── */
          <section className="bg-[#0f2e2a] text-white rounded-2xl p-7 sm:p-8 grid lg:grid-cols-[1.2fr,1fr] gap-8 items-center">
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-teal-300 uppercase">Kom igång</p>
              <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight mt-2 leading-snug">
                Din första hänvisning är det svåraste steget. Sen rullar det.
              </h2>
              <p className="text-white/65 text-[15px] mt-3 leading-relaxed">
                Du får {formatProcent(stats.current_tier_rate ?? partner.legacy_commission_rate)} av
                nettoabonnemanget varje månad, kundens första {partner.ladder_months} månader — per kund du hänvisar.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              {[
                ['Skriv ner tre hantverkare du känner', 'Kunder, leverantörer, grannen med firma.'],
                ['Berätta vad de slipper göra på kvällarna', 'Offerten, fakturan, uppföljningen — teamet tar det.'],
                ['Dela din länk nedan', 'Registrerar de sig via länken spåras kunden till dig.'],
              ].map(([titel, detalj], i) => (
                <div key={titel} className="flex items-start gap-3 bg-white/[.06] border border-white/10 rounded-xl px-4 py-3.5">
                  <span className="w-6 h-6 rounded-full bg-teal-400 text-[#0f2e2a] text-[13px] font-bold flex items-center justify-center flex-none mt-0.5">{i + 1}</span>
                  <div className="text-sm leading-relaxed">
                    <strong>{titel}</strong>
                    <div className="text-white/60">{detalj}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <>
            {/* ─── Hero: upplupet + nivå ─── */}
            <section className="grid lg:grid-cols-[1.25fr,1fr] gap-4">
              <div className="bg-[#0f2e2a] text-white rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-6 shadow-[0_8px_30px_rgba(15,118,110,.12)]">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest text-teal-300 uppercase">Upplupen provision</p>
                    <div className="text-4xl sm:text-[44px] font-bold tracking-tight mt-2 leading-none">
                      {formatSek(stats.pending_commission_sek)}
                    </div>
                    <p className="text-white/60 text-sm mt-2.5">
                      Ackruerat men ännu inte utbetalt — betalas när självfakturan är hanterad
                    </p>
                  </div>
                  {pendingBatch && (
                    <span className="flex-none text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/35">
                      Väntar på din granskning
                    </span>
                  )}
                </div>
                {pendingBatch ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <a
                      href="#sjalvfakturor"
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-br from-primary-700 to-teal-500 text-white text-sm font-medium shadow-lg shadow-primary-700/25 hover:opacity-90 transition-opacity"
                    >
                      Granska självfakturan {pendingBatch.invoice_number}
                    </a>
                    <span className="text-[13px] text-white/50">
                      Utan invändning kan utbetalningen ske 10 dagar efter utfärdandet
                    </span>
                  </div>
                ) : (
                  <p className="text-[13px] text-white/50">
                    Nästa självfaktura skapas när periodens underlag är klart
                  </p>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Din nivå</p>
                  <span className="text-[13px] text-slate-500">{stats.active_customers} aktiva kunder</span>
                </div>
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">
                    {stats.current_tier_rate !== null ? formatProcent(stats.current_tier_rate) : formatProcent(partner.legacy_commission_rate)}
                  </span>
                  <span className="text-[15px] text-slate-600">
                    av nettoabonnemanget, kundens första {partner.ladder_months} månader
                  </span>
                </div>
                {tiers ? (
                  <div className="flex flex-col gap-2">
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}>
                      {tiers.map(t => (
                        <div key={t.min} className={`h-2 rounded-full ${stats.active_customers >= t.min ? 'bg-primary-700' : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    <div className="grid gap-1.5 text-xs text-slate-500" style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}>
                      {tiers.map(t => (
                        <div key={t.min}>
                          <strong className={stats.active_customers >= t.min ? 'text-primary-700' : 'text-slate-400'}>{formatProcent(t.rate)}</strong>
                          {' · '}{t.min === 0 ? 'från start' : `från ${t.min} aktiva`}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Fast sats enligt avtal{partner.agreement_version ? ` ${partner.agreement_version}` : ''}. Därefter {formatProcent(partner.base_rate_after)}.
                  </p>
                )}
              </div>
            </section>

            {/* ─── Statrad ─── */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Hänvisade företag', value: String(stats.total_referred) },
                { label: 'Aktiva kunder', value: String(stats.active_customers) },
                { label: 'Utbetalt totalt', value: formatSek(stats.total_earned_sek) },
              ].map(s => (
                <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
                  <p className="text-[13px] text-slate-500">{s.label}</p>
                  <p className="text-[26px] font-bold tracking-tight text-slate-900 mt-1">{s.value}</p>
                </div>
              ))}
            </section>

            {/* ─── Behöver dig ─── */}
            {attGora.length > 0 && (
              <section className="bg-white border border-primary-700/30 rounded-2xl p-5 sm:p-6 shadow-[0_8px_30px_rgba(15,118,110,.08)] flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-[17px] font-semibold text-slate-900">Behöver dig</h2>
                  <span className="text-[13px] text-slate-500">{attGora.length} {attGora.length === 1 ? 'sak' : 'saker'}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {attGora.map(t => (
                    <div key={t.titel} className="flex items-center gap-3.5 px-3.5 py-3 border border-slate-200 rounded-xl bg-slate-50">
                      <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: t.farg }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{t.titel}</p>
                        <p className="text-[13px] text-slate-500">{t.detalj}</p>
                      </div>
                      <a
                        href={t.href}
                        className="flex-none text-[13px] font-medium text-primary-700 px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:border-teal-400 transition-colors"
                      >
                        {t.knapp}
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ─── Din länk ─── */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-3.5">
          <div>
            <h2 className="text-[17px] font-semibold text-slate-900">Din länk</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">Alla som registrerar sig via länken spåras till dig.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[220px] flex items-center px-3.5 h-11 bg-slate-50 border border-slate-200 rounded-xl min-w-0">
              <span className="block min-w-0 overflow-hidden whitespace-nowrap text-ellipsis font-mono text-[13px] text-slate-900">{referralUrl}</span>
            </div>
            <button
              onClick={() => copyToClipboard(referralUrl, setCopiedLink)}
              className="h-11 px-4.5 sm:px-5 rounded-xl bg-gradient-to-br from-primary-700 to-teal-500 text-white text-sm font-medium flex items-center gap-2 shadow-md shadow-primary-700/20 hover:opacity-90 transition-opacity"
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedLink ? 'Kopierad' : 'Kopiera länk'}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[13px] text-slate-500 mr-1">Dela via</span>
            <a
              href={`mailto:?subject=${encodeURIComponent('Prova Handymate')}&body=${encodeURIComponent(`Jag tror det här kan spara dig många kvällar: ${referralUrl}`)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-full text-[13px] text-slate-700 bg-white hover:border-teal-400 hover:text-primary-700 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> E-post
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Prova Handymate för din firma: ${referralUrl}`)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-full text-[13px] text-slate-700 bg-white hover:border-teal-400 hover:text-primary-700 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
            <a
              href={`sms:?body=${encodeURIComponent(`Prova Handymate! ${referralUrl}`)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-full text-[13px] text-slate-700 bg-white hover:border-teal-400 hover:text-primary-700 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" /> SMS
            </a>
            <span className="ml-auto text-[13px] text-slate-500">
              Kod <strong className="font-mono text-slate-900">{partner.referral_code}</strong>
            </span>
          </div>
        </section>

        {/* ─── Kundlista ─── */}
        <section id="kunder" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-[17px] font-semibold text-slate-900">Dina kunder</h2>
              <p className="text-[13px] text-slate-500 mt-0.5">
                Markera uppföljning 1, 2 och 3 när du haft kontakt. Vi visar bara din intjäning, aldrig kundens belopp.
              </p>
            </div>
            {referrals.length > 0 && <span className="text-[13px] text-slate-500">{referrals.length} företag</span>}
          </div>
          {referrals.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Inga hänvisningar ännu</p>
              <p className="text-sm text-slate-400 mt-1">Dela din länk med hantverkare du känner</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
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
        </section>

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

        {/* ─── Självfakturering ─── */}
        <div id="sjalvfakturor">
          <SelfBillingSection batches={selfBillingBatches} onChanged={fetchDashboard} />
        </div>
        <div id="fakturauppgifter">
          <BillingProfileCard
            profile={partner.billing_profile}
            complete={partner.billing_profile_complete}
            onSaved={fetchDashboard}
          />
        </div>

        {/* ─── Sanningsspråket ─── */}
        <p className="text-[13px] text-slate-500 leading-relaxed max-w-3xl">
          Provisionen räknas på vad dina kunder faktiskt betalat och ackrueras per tjänsteperiod.
          Upplupen är inte utbetald — språket i portalen följer status. Handymate skapar och numrerar
          självfakturan i ditt namn; du granskar, godkänner eller invänder innan utbetalning.
          API-nyckel och webhook hittar du under{' '}
          <button onClick={openSettings} className="text-primary-700 hover:underline">Inställningar</button>.
        </p>
      </main>

      {/* ─── Inställningar (API-nyckel + webhook) ─── */}
      {settingsOpen && (
        <ModalOverlay onClose={() => setSettingsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Inställningar</h3>
              <button onClick={() => setSettingsOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Din API-nyckel</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <p className="text-sm font-mono text-slate-900 truncate">
                      {showKey && revealedKey ? revealedKey : (partner.api_key_masked || '••••••••••••••••••••')}
                    </p>
                  </div>
                  <button onClick={toggleShowKey} className="p-2 text-slate-500 hover:text-slate-900 transition-colors" title={showKey ? 'Dölj' : 'Visa'}>
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={async () => {
                      const key = revealedKey ?? (await fetchSecrets())?.api_key ?? null
                      if (key) copyToClipboard(key, setCopiedKey)
                    }}
                    className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
                    title="Kopiera"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Webhook-URL</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://din-server.se/webhooks/handymate"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Händelser att notifiera</label>
                <div className="space-y-2">
                  {WEBHOOK_EVENT_OPTIONS.map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(opt.key)}
                        onChange={() => toggleWebhookEvent(opt.key)}
                        className="rounded border-slate-300 text-primary-700 focus:ring-primary-600"
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Webhook secret (för signaturverifiering)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-mono text-slate-600 truncate">
                      {revealedSecret || (partner.has_webhook_secret ? '••••••••' : '—')}
                    </p>
                  </div>
                  <button
                    onClick={() => revealedSecret && copyToClipboard(revealedSecret, setCopiedSecret)}
                    className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
                    title="Kopiera"
                  >
                    {copiedSecret ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {webhookTestResult && (
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{webhookTestResult}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={testWebhook}
                  disabled={webhookTesting || !partner.webhook_url}
                  className="flex-1 px-4 py-2 border border-slate-200 text-sm font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
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
