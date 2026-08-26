'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import {
  CreditCard,
  Zap,
  BarChart3,
  MessageSquare,
  ArrowLeft,
  Check,
  AlertTriangle,
  Loader2,
  ExternalLink,
  ChevronRight,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Receipt
} from 'lucide-react'
import { FuelBillingCard } from '@/components/fuel/FuelBillingCard'
import {
  FOUNDERS_GUARANTEE_DAYS,
  STANDARD_GUARANTEE_DAYS,
  getPlanCommercialFacts,
  YEARLY_MONTHS_FREE,
  type PlanType,
} from '@/lib/feature-gates'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })
}

const formatShortDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Matchar den faktiska formen från GET /api/billing (app/api/billing/route.ts).
// Komponenten läste tidigare billing.plan.status/price/trialEndsAt/
// currentPeriodEnd — fält som aldrig fanns i svaret. Statusen visade därför
// alltid fallback-värdet "Aktiv", trial/förnyelsedatum renderades aldrig, och
// priset föll alltid tillbaka på den lokala PLANS-konstanten.
interface BillingData {
  // Lanseringserbjudandet "Grundarkunderna" (Andreas-beslut 2026-08-19) —
  // server-härlett, se lib/billing/founders-offer.ts. undefined/false =
  // ingen banner.
  founders_available?: boolean
  plan: {
    /** plan_id från billing_plan (starter/professional/business) — stabil
        nyckel för matchning; name är visningsnamn och kan bytas fritt. */
    id?: string
    name: string
    price_sek: number
    features?: unknown
    limits?: unknown
  }
  subscription: {
    status: 'active' | 'trialing' | 'past_due' | 'cancelled' | string
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    period_start: string | null
    period_end: string | null
  }
  trial: {
    is_trialing: boolean
    ends_at: string | null
    days_left: number
  }
  // OBS: API:et returnerar inget history-fält idag — fältet är kvar här så
  // att UI:t har ett säkert fallback-läge ("Ingen betalningshistorik ännu")
  // istället för att krascha, men listan blir alltid tom tills en riktig
  // källa kopplas på. Utanför den här etappens scope.
  history?: Array<{
    id: string
    date: string
    type: string
    amount: number
    description: string
  }>
}

const STARTER_FACTS = getPlanCommercialFacts('starter')
const FIRMAN_FACTS = getPlanCommercialFacts('professional')
const STORFIRMAN_FACTS = getPlanCommercialFacts('business')

const PLANS = [
  {
    id: 'starter',
    name: STARTER_FACTS.label,
    price: STARTER_FACTS.monthlyPriceSek,
    yearlyPrice: STARTER_FACTS.yearlyPriceSek,
    features: [
      `${STARTER_FACTS.smsPerMonth} SMS/mån (0,89 kr/extra)`,
      `${STARTER_FACTS.callsPerMonth} samtal/mån`,
      `${STARTER_FACTS.users} användare`,
      '5 offertmallar',
      '3 automationer',
      'Bara Matte (chefsagent)',
      'Samtalsfångst med Lisa',
      'Offerter & fakturor',
      'Kundhantering (CRM)',
      'Pipeline',
      'Tidrapportering',
    ],
    limits: { sms: STARTER_FACTS.smsPerMonth, calls: STARTER_FACTS.callsPerMonth, automations: 3, users: STARTER_FACTS.users, templates: 5 },
  },
  {
    id: 'professional',
    name: FIRMAN_FACTS.label,
    price: FIRMAN_FACTS.monthlyPriceSek,
    yearlyPrice: FIRMAN_FACTS.yearlyPriceSek,
    features: [
      `${FIRMAN_FACTS.smsPerMonth} SMS/mån (0,79 kr/extra)`,
      `${FIRMAN_FACTS.callsPerMonth} samtal/mån`,
      `Upp till ${FIRMAN_FACTS.users} användare`,
      '10 offertmallar',
      'Alla automationer + custom',
      'Hela AI-teamet — sex medarbetare',
      'AI-minne (agenten lär sig)',
      'Allt i Starter',
      'Uppföljningssekvenser',
      'AI-offertgenerering',
      'Fortnox-integration',
    ],
    limits: { sms: FIRMAN_FACTS.smsPerMonth, calls: FIRMAN_FACTS.callsPerMonth, automations: null, users: FIRMAN_FACTS.users, templates: 10 },
  },
  {
    id: 'business',
    name: STORFIRMAN_FACTS.label,
    price: STORFIRMAN_FACTS.monthlyPriceSek,
    yearlyPrice: STORFIRMAN_FACTS.yearlyPriceSek,
    features: [
      `${STORFIRMAN_FACTS.smsPerMonth.toLocaleString('sv-SE')} SMS/mån (0,69 kr/extra)`,
      'Obegränsade samtal',
      'Obegränsade användare',
      'Obegränsade mallar',
      'Allt i Firman',
      'Leads-addon inkluderat',
      'Skräddarsydda företagsregler',
      'Dedikerad support',
      'Egen domän',
    ],
    limits: { sms: STORFIRMAN_FACTS.smsPerMonth, calls: STORFIRMAN_FACTS.callsPerMonth, automations: null, users: STORFIRMAN_FACTS.users, templates: null },
  },
]

// Andreas-beslut 2026-07-31: Starter borttagen ur köpflödet (se
// lib/feature-gates.ts). Befintliga starter-kunder ska fortfarande SE sin
// nuvarande plan korrekt i statuskortet ovan (som läser billing.plan.name
// direkt, opåverkat av detta) — men Starter ska inte gå att VÄLJA för
// uppgradering/nedgradering. SELECTABLE_PLANS styr bara "Välj plan"-rutnätet.
const SELECTABLE_PLANS = PLANS.filter((p) => p.id !== 'starter')

function getProgressColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-500'
  if (percentage >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function getProgressBgColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-100'
  if (percentage >= 70) return 'bg-amber-100'
  return 'bg-emerald-100'
}

function getStatusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case 'active':
      return { text: 'Aktiv', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
    case 'trialing':
      return { text: 'Provperiod', className: 'bg-primary-100 text-primary-700 border-primary-300' }
    case 'past_due':
      return { text: 'Forfallt', className: 'bg-red-100 text-red-700 border-red-200' }
    case 'cancelled':
      return { text: 'Avslutad', className: 'bg-gray-100 text-gray-700 border-gray-200' }
    default:
      return { text: status, className: 'bg-gray-100 text-gray-700 border-gray-200' }
  }
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-xl ${className || ''}`} />
}

export default function BillingPage() {
  const business = useBusiness()
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [smsUsage, setSmsUsage] = useState<{ sent: number; quota: number; extraSent: number; extraCostSek: number; hardCap: number; percentUsed: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  // Årsavtal (Andreas-beslut 2026-08-19): default Månadsvis vid plan-byte.
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')
  const guaranteeDays = billing?.founders_available
    ? FOUNDERS_GUARANTEE_DAYS
    : STANDARD_GUARANTEE_DAYS

  useEffect(() => {
    if (!business?.business_id) return

    async function fetchData() {
      setLoading(true)
      try {
        // /api/billing/usage anropas inte längre: den läste den avvecklade
        // usage_record och gav siffror som alltid var 0. Rutten finns kvar
        // (permission-contract-facit refererar den), men ingen yta läser den.
        const [billingRes, smsRes] = await Promise.all([
          fetch('/api/billing'),
          fetch('/api/sms/usage'),
        ])

        if (billingRes.ok) {
          const data = await billingRes.json()
          setBilling(data)
        }
        if (smsRes.ok) {
          const data = await smsRes.json()
          setSmsUsage(data)
        }
      } catch (err) {
        console.error('Failed to fetch billing data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business?.business_id])

  const handleManageSubscription = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.url) {
          window.location.href = data.url
        }
      }
    } catch (err) {
      console.error('Failed to open portal:', err)
    } finally {
      setPortalLoading(false)
    }
  }

  const handleCheckout = async (planId: string) => {
    setCheckoutLoading(planId)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval: billingInterval }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.url) {
          window.location.href = data.url
        }
      }
    } catch (err) {
      console.error('Failed to create checkout:', err)
    } finally {
      setCheckoutLoading(null)
    }
  }

  // Matcha på plan_id (stabil nyckel) — inte på visningsnamnet, som numera
  // kan skilja mellan DB (billing_plan.name) och koden under namnbyten.
  const currentPlanId = (billing?.plan?.id || 'starter') as PlanType
  const currentPlan = PLANS.find((p) => p.id === currentPlanId)
  // Läses ur API:ets faktiska svarsform (subscription/trial) — inte
  // billing.plan, som aldrig bar dessa fält.
  const trialDaysLeft = billing?.trial?.is_trialing ? billing.trial.days_left : null
  const status = getStatusLabel(billing?.subscription?.status || 'active')
  const currentPlanFacts = getPlanCommercialFacts(currentPlanId)
  const planPrice = billing?.plan?.price_sek ?? currentPlanFacts.monthlyPriceSek

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-primary-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/settings"
            className="flex items-center justify-center w-10 h-10 bg-white border border-[#E2E8F0] rounded-xl hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Prenumeration & Fakturering</h1>
            <p className="text-gray-500 text-sm mt-1">Hantera din plan, se anvandning och betalningshistorik</p>
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : (
          <div className="space-y-8">
            {/* ===== CURRENT PLAN CARD ===== */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              {/* Past due warning banner */}
              {billing?.subscription?.status === 'past_due' && (
                <div className="bg-red-50 border-b border-red-200 px-6 py-4 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-red-800 font-medium text-sm">Betalning forsenad</p>
                    <p className="text-red-600 text-sm">
                      Din senaste betalning misslyckades. Uppdatera din betalningsmetod for att undvika avbrott i tjansten.
                    </p>
                  </div>
                </div>
              )}

              <div className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary-700 flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-xl font-bold text-gray-900">{currentPlan?.name || billing?.plan?.name || STARTER_FACTS.label}</h2>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.className}`}>
                          {status.text}
                        </span>
                      </div>
                      {billing?.subscription?.status === 'trialing' && trialDaysLeft !== null && (
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="w-4 h-4 text-amber-500" />
                          <p className="text-amber-600 text-sm font-medium">
                            Provperioden avslutas om {trialDaysLeft} {trialDaysLeft === 1 ? 'dag' : 'dagar'}
                            {billing?.trial?.ends_at && (
                              <span className="text-gray-400 font-normal"> ({formatDate(billing.trial.ends_at)})</span>
                            )}
                          </p>
                        </div>
                      )}
                      {billing?.subscription?.status === 'active' && billing.subscription.period_end && (
                        <p className="text-gray-500 text-sm mt-1">
                          Fornyelse: {formatDate(billing.subscription.period_end)}
                        </p>
                      )}
                      {billing?.subscription?.status === 'cancelled' && (
                        <p className="text-gray-500 text-sm mt-1">
                          Prenumerationen ar avslutad
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right mr-2">
                      <p className="text-2xl font-bold text-gray-900">{formatCurrency(planPrice)}</p>
                      <p className="text-xs text-gray-400">per manad</p>
                    </div>
                    <button
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary-700 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {portalLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                      Hantera prenumeration
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== USAGE OVERVIEW ===== */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-gray-700" />
                  <h2 className="text-lg font-semibold text-gray-900">Anvandning</h2>
                </div>
                {billing?.subscription?.period_start && billing?.subscription?.period_end && (
                  <p className="text-xs text-gray-400">
                    Aktuell period: {formatShortDate(billing.subscription.period_start)} &ndash;{' '}
                    {formatShortDate(billing.subscription.period_end)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UsageBar
                  icon={<MessageSquare className="w-4 h-4" />}
                  label="SMS"
                  used={smsUsage?.sent ?? 0}
                  limit={smsUsage?.quota ?? currentPlan?.limits.sms ?? 50}
                  unit="skickade"
                  extraInfo={smsUsage && smsUsage.extraSent > 0
                    ? `Extra SMS: ${smsUsage.extraSent.toLocaleString('sv-SE')} st = ${Math.round(smsUsage.extraCostSek).toLocaleString('sv-SE')} kr`
                    : undefined}
                />
                {/* ═══ SAMTAL, AUTOMATIONER OCH OFFERTMALLAR ÄR BORTTAGNA ═══
                    (2026-08-08)

                    De visade alltid 0. Två oberoende fel samtidigt: tabellen
                    de läste (usage_record) fylldes aldrig — incrementUsage
                    hade noll callsites — OCH formen matchade inte, eftersom
                    setUsage får {'{ period, usage: {...} }'} medan renderingen
                    läste usage?.calls?.used. De hade alltså visat 0 även med
                    full tabell.

                    En tom yta är bättre än en falsk siffra: en kund som ser
                    "0 minuter" när hen ringt i en timme slutar tro på hela
                    sidan. Mätarna kommer tillbaka när de matas av en riktig
                    kvotkälla — se planen, avsnittet om kundvända gränser.
                    SMS-mätaren ovan är kvar: den läser sms_usage och är sann. */}
              </div>
            </div>

            {/* ===== BRÄNSLE ===== */}
            <FuelBillingCard />

            {/* ===== PLAN COMPARISON ===== */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-5 h-5 text-gray-700" />
                <h2 className="text-lg font-semibold text-gray-900">Valj plan</h2>
              </div>

              {/* Lanseringserbjudandet "Grundarkunderna" (Andreas-beslut
                  2026-08-19) — server-härlett via billing.founders_available
                  (GET /api/billing, lib/billing/founders-offer.ts). Ingen
                  banner alls när flaggan är false/undefined. */}
              {billing?.founders_available && (
                <div className="bg-gradient-to-br from-amber-50 to-primary-50 border border-amber-200 rounded-xl p-4 mb-4">
                  <strong className="block text-sm text-primary-700 mb-1">
                    Lanseringserbjudande — Grundarkunderna
                  </strong>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Just nu finns grundarkundsplatser kvar: ditt pris låses för alltid, du får {FOUNDERS_GUARANTEE_DAYS} dagars pengarna-tillbaka-garanti och en direktlinje till grundaren under hela första året.
                  </p>
                </div>
              )}

              {/* Månadsvis/Årsvis (Andreas-beslut 2026-08-19) */}
              <div className="inline-flex items-center gap-1 p-1 mb-2 bg-gray-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setBillingInterval('monthly')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    billingInterval === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Månadsvis
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval('yearly')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    billingInterval === 'yearly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Årsvis
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700">
                    {YEARLY_MONTHS_FREE} månader på köpet
                  </span>
                </button>
              </div>

              {billingInterval === 'yearly' && (
                <p className="text-xs text-primary-700 font-medium mb-4">
                  {guaranteeDays} dagars pengarna-tillbaka-garanti. Inga frågor. Gäller även årsavtal.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SELECTABLE_PLANS.map((plan) => {
                  const isCurrent = plan.id === currentPlanId
                  const showYearly = billingInterval === 'yearly' && plan.yearlyPrice != null
                  const displayPrice = showYearly ? (plan.yearlyPrice as number) : plan.price
                  const monthlyEquivalent = showYearly ? Math.round((plan.yearlyPrice as number) / 12) : null
                  // currentIndex blir -1 för Bas-kunder (starter finns inte i
                  // SELECTABLE_PLANS) — då räknas båda kvarvarande planerna korrekt
                  // som uppgraderingar, vilket stämmer (Bas är alltid lägst).
                  const currentIndex = SELECTABLE_PLANS.findIndex((p) => p.id === currentPlanId)
                  const planIndex = SELECTABLE_PLANS.findIndex((p) => p.id === plan.id)
                  const isUpgrade = planIndex > currentIndex
                  const isDowngrade = planIndex < currentIndex

                  return (
                    <div
                      key={plan.id}
                      className={`relative bg-white rounded-xl border-2 p-6 transition-all ${
                        isCurrent
                          ? 'border-primary-500 shadow-md shadow-cyan-100'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-primary-700 text-white text-xs font-semibold px-3 py-1 rounded-full">
                            Nuvarande plan
                          </span>
                        </div>
                      )}

                      <div className="mb-4">
                        <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-3xl font-bold text-gray-900">{formatCurrency(displayPrice)}</span>
                          <span className="text-sm text-gray-400">{showYearly ? '/år' : '/man'}</span>
                        </div>
                        {monthlyEquivalent !== null && (
                          <p className="text-xs text-gray-400 mt-1">
                            motsvarar ~{monthlyEquivalent.toLocaleString('sv-SE')} kr/mån — {YEARLY_MONTHS_FREE} månader på köpet
                          </p>
                        )}
                      </div>

                      <ul className="space-y-2 mb-6">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                            <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      {isCurrent ? (
                        <button
                          disabled
                          className="w-full py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed"
                        >
                          Nuvarande plan
                        </button>
                      ) : isUpgrade ? (
                        <button
                          onClick={() => handleCheckout(plan.id)}
                          disabled={checkoutLoading === plan.id}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-primary-700 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {checkoutLoading === plan.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                          Uppgradera
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCheckout(plan.id)}
                          disabled={checkoutLoading === plan.id}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {checkoutLoading === plan.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4" />
                          )}
                          Nedgradera
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ===== BILLING HISTORY ===== */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center gap-3 mb-6">
                <Receipt className="w-5 h-5 text-gray-700" />
                <h2 className="text-lg font-semibold text-gray-900">Betalningshistorik</h2>
              </div>

              {billing?.history && billing.history.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {billing.history.map((event) => (
                    <div key={event.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                          <BillingEventIcon type={event.type} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{event.description || event.type}</p>
                          <p className="text-xs text-gray-400">{formatDate(event.date)}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(event.amount)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Ingen betalningshistorik annu</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ===== SUB-COMPONENTS ===== */

function UsageBar({
  icon,
  label,
  used,
  limit,
  unit,
  extraInfo,
}: {
  icon: React.ReactNode
  label: string
  used: number
  limit: number | null
  unit: string
  extraInfo?: string
}) {
  if (limit === null || limit === undefined) {
    return (
      <div className="p-4 bg-gray-50 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            {icon}
            {label}
          </div>
          <span className="text-xs text-emerald-600 font-medium">Obegränsat</span>
        </div>
        <div className="w-full h-2 rounded-full bg-emerald-100">
          <div className="h-2 rounded-full bg-emerald-400 w-0" />
        </div>
      </div>
    )
  }

  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const barColor = getProgressColor(percentage)
  const bgColor = getProgressBgColor(percentage)
  const isAtLimit = percentage >= 100

  return (
    <div className="p-4 bg-gray-50 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          {icon}
          {label}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {used} / {limit} {unit}
          </span>
          {isAtLimit && (
            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
              Full
            </span>
          )}
        </div>
      </div>
      <div className={`w-full h-2 rounded-full ${bgColor}`}>
        <div
          className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        {extraInfo ? (
          <span className="text-xs text-amber-600">{extraInfo}</span>
        ) : (
          <span />
        )}
        <span className={`text-xs ${percentage >= 80 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
          {percentage}%
          {percentage >= 80 && percentage < 100 && ' ⚠️'}
          {percentage >= 100 && ' 🔴'}
        </span>
      </div>
      {isAtLimit && (
        <Link
          href="/dashboard/settings/billing"
          className="mt-2 text-xs text-primary-700 hover:underline flex items-center gap-1"
        >
          Uppgradera för mer <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

function BillingEventIcon({ type }: { type: string }) {
  switch (type) {
    case 'payment':
    case 'charge':
      return <CreditCard className="w-4 h-4 text-gray-500" />
    case 'refund':
      return <ArrowDownRight className="w-4 h-4 text-emerald-500" />
    case 'upgrade':
      return <ArrowUpRight className="w-4 h-4 text-primary-700" />
    case 'downgrade':
      return <ArrowDownRight className="w-4 h-4 text-amber-500" />
    default:
      return <Receipt className="w-4 h-4 text-gray-500" />
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Current plan skeleton */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <SkeletonBlock className="w-12 h-12" />
            <div className="space-y-2">
              <SkeletonBlock className="w-40 h-6" />
              <SkeletonBlock className="w-56 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SkeletonBlock className="w-24 h-8" />
            <SkeletonBlock className="w-48 h-10 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Usage skeleton */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <SkeletonBlock className="w-32 h-6 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 bg-gray-50 rounded-xl space-y-2">
              <div className="flex justify-between">
                <SkeletonBlock className="w-24 h-4" />
                <SkeletonBlock className="w-16 h-4" />
              </div>
              <SkeletonBlock className="w-full h-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Plans skeleton */}
      <div>
        <SkeletonBlock className="w-28 h-6 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-3">
              <SkeletonBlock className="w-24 h-6" />
              <SkeletonBlock className="w-32 h-8" />
              <div className="space-y-2 pt-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <SkeletonBlock key={j} className="w-full h-4" />
                ))}
              </div>
              <SkeletonBlock className="w-full h-10 mt-4 rounded-xl" />
            </div>
          ))}
        </div>
      </div>

      {/* History skeleton */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <SkeletonBlock className="w-40 h-6 mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="w-9 h-9 rounded-lg" />
                <div className="space-y-1">
                  <SkeletonBlock className="w-32 h-4" />
                  <SkeletonBlock className="w-20 h-3" />
                </div>
              </div>
              <SkeletonBlock className="w-20 h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
