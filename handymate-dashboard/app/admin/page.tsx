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
  Search,
  ExternalLink,
  Shield,
  Zap,
  ChevronDown,
} from 'lucide-react'

interface Customer {
  business_id: string
  business_name: string
  contact_email: string | null
  contact_name: string | null
  subscription_plan: string
  subscription_status: string | null
  leads_addon: boolean | null
  created_at: string
  user_id: string | null
  sms_sent: number
  sms_quota: number
}

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
    subscription_plan: string
  }>
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  business: 'Business',
}

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-teal-600',
  professional: 'bg-teal-500',
  business: 'bg-teal-500',
}

const PLAN_BADGE_STYLES: Record<string, string> = {
  starter: 'bg-teal-100 text-teal-700 border-teal-200',
  professional: 'bg-teal-100 text-teal-700 border-teal-200',
  business: 'bg-teal-100 text-teal-700 border-teal-200',
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
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'overview' | 'customers'>('overview')
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetchMetrics()
    fetchCustomers()
  }, [])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

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
    await Promise.all([fetchMetrics(), fetchCustomers()])
    setRefreshing(false)
  }

  async function fetchCustomers() {
    try {
      const res = await fetch('/api/admin/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers || [])
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err)
    }
  }

  async function updateCustomerPlan(businessId: string, plan: string) {
    setUpdatingPlan(businessId)
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, subscription_plan: plan }),
      })
      const data = await res.json()
      if (res.ok && data.updated) {
        setCustomers(prev => prev.map(c => c.business_id === businessId
          ? { ...c, subscription_plan: data.updated.subscription_plan }
          : c))
        const biz = customers.find(c => c.business_id === businessId)
        setToast(`Plan uppdaterad till ${plan} för ${biz?.business_name || businessId}`)
      } else {
        setToast(`Fel: ${data.error || 'Kunde inte uppdatera'}`)
        // Revert dropdown by refetching
        await fetchCustomers()
      }
    } catch {
      setToast('Nätverksfel — försök igen')
      await fetchCustomers()
    }
    setUpdatingPlan(null)
  }

  async function toggleLeadsAddon(businessId: string, current: boolean) {
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, leads_addon: !current }),
      })
      const data = await res.json()
      if (res.ok && data.updated) {
        setCustomers(prev => prev.map(c => c.business_id === businessId ? { ...c, leads_addon: data.updated.leads_addon } : c))
        setToast(`Leads add-on ${data.updated.leads_addon ? 'aktiverad' : 'avaktiverad'}`)
      } else {
        setToast(`Fel: ${data.error || 'Kunde inte uppdatera'}`)
      }
    } catch { /* ignore */ }
  }

  async function impersonateBusiness(businessId: string, businessName: string) {
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, business_name: businessName }),
      })
      if (res.ok) {
        window.location.href = '/dashboard'
      }
    } catch { /* ignore */ }
  }

  async function setEnterpriseAll(businessId: string) {
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, subscription_plan: 'business', leads_addon: true }),
      })
      const data = await res.json()
      if (res.ok && data.updated) {
        setCustomers(prev => prev.map(c => c.business_id === businessId ? { ...c, subscription_plan: 'business', leads_addon: true } : c))
        setToast('Enterprise + alla add-ons aktiverat!')
      } else {
        setToast(`Fel: ${data.error || 'Kunde inte uppdatera'}`)
      }
    } catch { /* ignore */ }
  }

  const filteredCustomers = customers.filter(c => {
    if (planFilter !== 'all' && c.subscription_plan !== planFilter) return false
    if (customerSearch) {
      const q = customerSearch.toLowerCase()
      return (c.business_name || '').toLowerCase().includes(q) || (c.contact_email || '').toLowerCase().includes(q)
    }
    return true
  })

  // --- Loading state ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-700 animate-spin" />
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
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-teal-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-600 rounded-xl flex items-center justify-center">
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
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-xl hover:opacity-90 transition-opacity shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Onboarda pilot
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {(['overview', 'customers'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab === 'overview' ? 'Översikt' : `Kunder (${customers.length})`}
            </button>
          ))}
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* CUSTOMER TABLE TAB */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Sök företag eller mail..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400" />
              </div>
              <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
                className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-400">
                <option value="all">Alla planer</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="business">Enterprise</option>
              </select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Företag</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Plan</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Leads</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">SMS</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Registrerad</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCustomers.map(c => (
                      <tr key={c.business_id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-sm">{c.business_name || '—'}</p>
                          <p className="text-xs text-gray-400">{c.contact_email || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={c.subscription_plan || 'starter'}
                            onChange={e => updateCustomerPlan(c.business_id, e.target.value)}
                            disabled={updatingPlan === c.business_id}
                            className={`text-xs font-medium px-2 py-1 rounded-lg border bg-white cursor-pointer focus:outline-none focus:border-teal-400 ${
                              updatingPlan === c.business_id ? 'opacity-50' : ''
                            }`}
                          >
                            <option value="starter">Starter</option>
                            <option value="professional">Professional</option>
                            <option value="business">Enterprise</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => toggleLeadsAddon(c.business_id, !!c.leads_addon)}
                            className={`w-9 h-5 rounded-full transition-colors relative ${c.leads_addon ? 'bg-teal-500' : 'bg-gray-300'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${c.leads_addon ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">{c.sms_sent}/{c.sms_quota}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">{formatDate(c.created_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {c.contact_email === 'andreashogberg93@gmail.com' && (
                              <button onClick={() => setEnterpriseAll(c.business_id)}
                                title="Sätt Enterprise + alla add-ons"
                                className="px-2 py-1 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-md hover:bg-amber-200 transition-colors">
                                🔧 Enterprise
                              </button>
                            )}
                            <button onClick={() => impersonateBusiness(c.business_id, c.business_name)}
                              className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                              Impersonera
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredCustomers.length === 0 && (
                <div className="p-12 text-center text-gray-400 text-sm">Inga kunder matchar sökningen</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'overview' && metrics && (
          <>
            {/* Key metric cards - grid of 4 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Total businesses */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-sky-700" />
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
                  <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-teal-600" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">MRR</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{formatSEK(metrics.total_revenue_sek)}</p>
                <p className="text-sm text-gray-500 mt-1">Månatlig intäkt</p>
              </div>

              {/* New this month */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-teal-600" />
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
                  <FileText className="w-4 h-4 text-teal-600" />
                  <span className="text-xs text-gray-400 font-medium">Offerter</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_quotes}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-teal-500" />
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
                  <MessageSquare className="w-4 h-4 text-teal-500" />
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
                                  PLAN_BADGE_STYLES[signup.subscription_plan] || 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}
                              >
                                {PLAN_LABELS[signup.subscription_plan] || signup.subscription_plan}
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
                  className="group flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-teal-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                      <UserPlus className="w-5 h-5 text-sky-700" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Pilot Onboarding</p>
                      <p className="text-xs text-gray-500">Skapa och hantera pilotkonton</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-teal-600 transition-colors" />
                </a>
              </div>
            </div>
          </>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm z-50 animate-in fade-in slide-in-from-bottom-2">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
