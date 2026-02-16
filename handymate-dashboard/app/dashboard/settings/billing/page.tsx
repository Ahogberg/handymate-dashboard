'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import {
  CreditCard,
  Zap,
  BarChart3,
  MessageSquare,
  Phone,
  Bot,
  HardDrive,
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

interface BillingData {
  plan: {
    name: string
    status: 'active' | 'trialing' | 'past_due' | 'cancelled'
    trialEndsAt: string | null
    currentPeriodStart: string
    currentPeriodEnd: string
    price: number
  }
  history: Array<{
    id: string
    date: string
    type: string
    amount: number
    description: string
  }>
}

interface UsageData {
  sms: { used: number; limit: number }
  calls: { used: number; limit: number }
  ai: { used: number; limit: number }
  storage: { used: number; limit: number }
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 1995,
    features: [
      '75 samtal/man',
      '200 SMS/man',
      '500 AI-forfrågningar/man',
      '5 GB lagring',
      'AI-samtalsanalys',
      'Offert- & fakturahantering',
      'ROT/RUT-avdrag',
      'Grundläggande CRM',
    ],
    limits: { sms: 200, calls: 75, ai: 500, storage: 5 },
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 4995,
    features: [
      '250 samtal/man',
      '600 SMS/man',
      '2 000 AI-forfrågningar/man',
      '25 GB lagring',
      'Allt i Starter',
      'Prioriterad support',
      'Avancerat CRM & pipeline',
      'Kampanjhantering',
      'Grossistintegration',
    ],
    limits: { sms: 600, calls: 250, ai: 2000, storage: 25 },
  },
  {
    id: 'business',
    name: 'Business',
    price: 9995,
    features: [
      '800 samtal/man',
      '2 000 SMS/man',
      '10 000 AI-forfrågningar/man',
      '100 GB lagring',
      'Allt i Professional',
      'Dedikerad kontaktperson',
      'Anpassad AI-traning',
      'API-åtkomst',
      'Teamhantering',
      'Fortnox-integration',
    ],
    limits: { sms: 2000, calls: 800, ai: 10000, storage: 100 },
  },
]

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
      return { text: 'Provperiod', className: 'bg-blue-100 text-blue-700 border-blue-200' }
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
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!business?.business_id) return

    async function fetchData() {
      setLoading(true)
      try {
        const [billingRes, usageRes] = await Promise.all([
          fetch('/api/billing'),
          fetch('/api/billing/usage'),
        ])

        if (billingRes.ok) {
          const data = await billingRes.json()
          setBilling(data)
        }
        if (usageRes.ok) {
          const data = await usageRes.json()
          setUsage(data)
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
        body: JSON.stringify({ planId }),
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

  const currentPlanName = billing?.plan?.name || 'Starter'
  const currentPlan = PLANS.find((p) => p.name === currentPlanName)
  const trialDaysLeft =
    billing?.plan?.status === 'trialing' && billing.plan.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(billing.plan.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null
  const status = getStatusLabel(billing?.plan?.status || 'active')

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/settings"
            className="flex items-center justify-center w-10 h-10 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
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
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
              {/* Past due warning banner */}
              {billing?.plan?.status === 'past_due' && (
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
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-xl font-bold text-gray-900">{currentPlanName}</h2>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.className}`}>
                          {status.text}
                        </span>
                      </div>
                      {billing?.plan?.status === 'trialing' && trialDaysLeft !== null && (
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="w-4 h-4 text-amber-500" />
                          <p className="text-amber-600 text-sm font-medium">
                            Provperioden avslutas om {trialDaysLeft} {trialDaysLeft === 1 ? 'dag' : 'dagar'}
                            {billing.plan.trialEndsAt && (
                              <span className="text-gray-400 font-normal"> ({formatDate(billing.plan.trialEndsAt)})</span>
                            )}
                          </p>
                        </div>
                      )}
                      {billing?.plan?.status === 'active' && billing.plan.currentPeriodEnd && (
                        <p className="text-gray-500 text-sm mt-1">
                          Fornyelse: {formatDate(billing.plan.currentPeriodEnd)}
                        </p>
                      )}
                      {billing?.plan?.status === 'cancelled' && (
                        <p className="text-gray-500 text-sm mt-1">
                          Prenumerationen ar avslutad
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right mr-2">
                      <p className="text-2xl font-bold text-gray-900">{formatCurrency(billing?.plan?.price || currentPlan?.price || 1995)}</p>
                      <p className="text-xs text-gray-400">per manad</p>
                    </div>
                    <button
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
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
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-gray-700" />
                  <h2 className="text-lg font-semibold text-gray-900">Anvandning</h2>
                </div>
                {billing?.plan?.currentPeriodStart && billing?.plan?.currentPeriodEnd && (
                  <p className="text-xs text-gray-400">
                    Aktuell period: {formatShortDate(billing.plan.currentPeriodStart)} &ndash;{' '}
                    {formatShortDate(billing.plan.currentPeriodEnd)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UsageBar
                  icon={<MessageSquare className="w-4 h-4" />}
                  label="SMS"
                  used={usage?.sms?.used ?? 0}
                  limit={usage?.sms?.limit ?? currentPlan?.limits.sms ?? 200}
                  unit="anvanda"
                />
                <UsageBar
                  icon={<Phone className="w-4 h-4" />}
                  label="Samtalstid"
                  used={usage?.calls?.used ?? 0}
                  limit={usage?.calls?.limit ?? currentPlan?.limits.calls ?? 75}
                  unit="minuter"
                />
                <UsageBar
                  icon={<Bot className="w-4 h-4" />}
                  label="AI-forfragningar"
                  used={usage?.ai?.used ?? 0}
                  limit={usage?.ai?.limit ?? currentPlan?.limits.ai ?? 500}
                  unit=""
                />
                <UsageBar
                  icon={<HardDrive className="w-4 h-4" />}
                  label="Lagring"
                  used={usage?.storage?.used ?? 0}
                  limit={usage?.storage?.limit ?? currentPlan?.limits.storage ?? 5}
                  unit="GB"
                />
              </div>
            </div>

            {/* ===== PLAN COMPARISON ===== */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-5 h-5 text-gray-700" />
                <h2 className="text-lg font-semibold text-gray-900">Valj plan</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANS.map((plan) => {
                  const isCurrent = plan.name === currentPlanName
                  const currentIndex = PLANS.findIndex((p) => p.name === currentPlanName)
                  const planIndex = PLANS.findIndex((p) => p.name === plan.name)
                  const isUpgrade = planIndex > currentIndex
                  const isDowngrade = planIndex < currentIndex

                  return (
                    <div
                      key={plan.id}
                      className={`relative bg-white rounded-2xl border-2 p-6 transition-all ${
                        isCurrent
                          ? 'border-cyan-400 shadow-md shadow-cyan-100'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                            Nuvarande plan
                          </span>
                        </div>
                      )}

                      <div className="mb-4">
                        <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-3xl font-bold text-gray-900">{formatCurrency(plan.price)}</span>
                          <span className="text-sm text-gray-400">/man</span>
                        </div>
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
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
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
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
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
}: {
  icon: React.ReactNode
  label: string
  used: number
  limit: number
  unit: string
}) {
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const barColor = getProgressColor(percentage)
  const bgColor = getProgressBgColor(percentage)

  return (
    <div className="p-4 bg-gray-50 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          {icon}
          {label}
        </div>
        <span className="text-xs text-gray-500">
          {used} / {limit} {unit}
        </span>
      </div>
      <div className={`w-full h-2 rounded-full ${bgColor}`}>
        <div
          className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-end mt-1">
        <span className="text-xs text-gray-400">{percentage}%</span>
      </div>
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
      return <ArrowUpRight className="w-4 h-4 text-blue-500" />
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
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
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
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
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
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
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
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
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
