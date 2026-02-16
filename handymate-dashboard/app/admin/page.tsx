'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Building2,
  Users,
  TrendingUp,
  TrendingDown,
  FileText,
  Receipt,
  Phone,
  MessageSquare,
  Loader2,
  AlertCircle,
  RefreshCw,
  UserPlus,
  ArrowRight,
  Calendar,
} from 'lucide-react'

interface Metrics {
  total_businesses: number
  active_businesses: number
  total_revenue_sek: number
  new_this_month: number
  churn_this_month: number
  total_quotes: number
  total_invoices: number
  total_calls: number
  sms_this_month: number
  plan_distribution: Record<string, number>
  recent_signups: Array<{
    business_name: string
    created_at: string
    billing_plan: string
  }>
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  business: 'Business',
}

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-blue-500',
  professional: 'bg-cyan-500',
  business: 'bg-violet-500',
}

const PLAN_BADGE_STYLES: Record<string, string> = {
  starter: 'bg-blue-100 text-blue-700 border-blue-200',
  professional: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  business: 'bg-violet-100 text-violet-700 border-violet-200',
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchMetrics()
  }, [])

  async function fetchMetrics() {
    try {
      const response = await fetch('/api/admin/metrics')

      if (response.status === 403) {
        setIsAdminUser(false)
        router.push('/login?error=admin_required')
        return
      }

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Kunde inte hämta metrics')
      }

      setIsAdminUser(true)
      const data = await response.json()
      setMetrics(data)
    } catch (err: any) {
      console.error('Fetch metrics error:', err)
      setError(err.message || 'Något gick fel')
      setIsAdminUser(true) // Don't redirect on generic errors
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    setError('')
    await fetchMetrics()
    setRefreshing(false)
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  // --- Access denied ---
  if (isAdminUser === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Åtkomst nekad</h1>
          <p className="text-gray-500">Du har inte admin-behörighet.</p>
        </div>
      </div>
    )
  }

  // --- Plan distribution bar chart ---
  const planTotal = metrics
    ? Object.values(metrics.plan_distribution).reduce((a, b) => a + b, 0)
    : 0

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-500">Plattformsöversikt och nyckeltal</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Uppdatera
            </button>
            <a
              href="/admin/onboard"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90 transition-opacity shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Onboarda pilot
            </a>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {metrics && (
          <>
            {/* Key metric cards - grid of 4 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Total businesses */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Totalt</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{metrics.total_businesses}</p>
                <p className="text-sm text-gray-500 mt-1">Registrerade företag</p>
              </div>

              {/* Active businesses */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Aktiva</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{metrics.active_businesses}</p>
                <p className="text-sm text-gray-500 mt-1">Aktiva / trial-företag</p>
              </div>

              {/* MRR */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-cyan-600" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">MRR</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{formatSEK(metrics.total_revenue_sek)}</p>
                <p className="text-sm text-gray-500 mt-1">Månatlig intäkt</p>
              </div>

              {/* New this month */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-violet-600" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Denna månad</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  +{metrics.new_this_month}
                </p>
                <p className="text-sm text-gray-500 mt-1">Nya registreringar</p>
              </div>
            </div>

            {/* Second row: Platform activity + churn */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-gray-400 font-medium">Offerter</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_quotes}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-cyan-500" />
                  <span className="text-xs text-gray-400 font-medium">Fakturor</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_invoices}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs text-gray-400 font-medium">Samtal</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_calls}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-violet-500" />
                  <span className="text-xs text-gray-400 font-medium">SMS (månad)</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{metrics.sms_this_month}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-gray-400 font-medium">Churn</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{metrics.churn_this_month}</p>
              </div>
            </div>

            {/* Plan distribution + Recent signups */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Plan distribution bar chart */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Planfördelning</h2>

                {planTotal === 0 ? (
                  <p className="text-gray-400 text-sm">Inga företag ännu</p>
                ) : (
                  <div className="space-y-5">
                    {(['starter', 'professional', 'business'] as const).map((planKey) => {
                      const count = metrics.plan_distribution[planKey] || 0
                      const pct = planTotal > 0 ? Math.round((count / planTotal) * 100) : 0
                      return (
                        <div key={planKey}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">
                              {PLAN_LABELS[planKey]}
                            </span>
                            <span className="text-sm text-gray-500">
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${PLAN_COLORS[planKey]}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Summary below chart */}
                {planTotal > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Totalt antal företag</span>
                      <span className="font-semibold text-gray-900">{planTotal}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Recent signups table */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900">Senaste registreringar</h2>
                  <p className="text-sm text-gray-500 mt-1">De 10 senaste företagen som registrerat sig</p>
                </div>

                {metrics.recent_signups.length === 0 ? (
                  <div className="p-12 text-center">
                    <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Inga registreringar ännu</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Företag
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Plan
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Registrerad
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {metrics.recent_signups.map((signup, index) => (
                          <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-medium text-gray-900">{signup.business_name}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${
                                  PLAN_BADGE_STYLES[signup.billing_plan] || 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}
                              >
                                {PLAN_LABELS[signup.billing_plan] || signup.billing_plan}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDate(signup.created_at)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Quick links */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Adminverktyg</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <a
                  href="/admin/onboard"
                  className="group flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                      <UserPlus className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Pilot Onboarding</p>
                      <p className="text-xs text-gray-500">Skapa och hantera pilotkonton</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
