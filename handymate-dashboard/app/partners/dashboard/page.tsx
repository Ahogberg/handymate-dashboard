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
  ExternalLink,
} from 'lucide-react'

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
}

interface Stats {
  total_referred: number
  active_customers: number
  pending_conversion: number
  pending_commission_sek: number
  total_earned_sek: number
}

interface Referral {
  id: string
  email: string | null
  business_name: string | null
  plan: string | null
  status: string
  created_at: string
  converted_at: string | null
  commission_month: number
  monthly_commission: number
}

function formatSek(amount: number): string {
  return amount.toLocaleString('sv-SE') + ' kr'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sv-SE')
}

function statusLabel(status: string): { text: string; color: string } {
  switch (status) {
    case 'pending': return { text: 'Väntar', color: 'bg-yellow-50 text-yellow-700' }
    case 'active': return { text: 'Aktiv', color: 'bg-green-50 text-green-700' }
    case 'rewarded': return { text: 'Klar (12 mån)', color: 'bg-blue-50 text-blue-700' }
    default: return { text: status, color: 'bg-gray-50 text-gray-700' }
  }
}

function planLabel(plan: string | null): string {
  if (!plan) return '—'
  const map: Record<string, string> = { starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise', trial: 'Trial' }
  return map[plan] || plan
}

export default function PartnerDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<PartnerData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [copied, setCopied] = useState(false)

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

  function copyLink() {
    if (partner?.referral_url) {
      navigator.clipboard.writeText(partner.referral_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-700 animate-spin" />
      </div>
    )
  }

  if (!partner || !stats) return null

  const statCards = [
    { label: 'Hänvisade', value: stats.total_referred, icon: Users, color: 'text-blue-600' },
    { label: 'Aktiva kunder', value: stats.active_customers, icon: TrendingUp, color: 'text-green-600' },
    { label: 'Väntande provision', value: formatSek(stats.pending_commission_sek), icon: Clock, color: 'text-amber-600' },
    { label: 'Totalt tjänat', value: formatSek(stats.total_earned_sek), icon: Banknote, color: 'text-teal-600' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <Link href="https://handymate.se/partners" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-700 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">Handymate</span>
            <span className="text-sm text-teal-700 font-medium ml-1">Partners</span>
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

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {/* Header + referral link */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Välkommen {partner.name}!
          </h1>
          <p className="text-gray-500 mt-1">
            Din kod: <span className="font-mono font-semibold text-teal-700">{partner.referral_code}</span>
          </p>

          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-1">Din referrallänk</p>
              <p className="text-sm text-gray-900 font-mono truncate">{partner.referral_url}</p>
            </div>
            <button
              onClick={copyLink}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Kopierad!' : 'Kopiera länk'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map(stat => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-gray-500">{stat.label}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Referrals table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Hänvisade kunder</h2>
          </div>
          {referrals.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Inga hänvisningar ännu</p>
              <p className="text-sm text-gray-400 mt-1">Dela din länk med hantverkare du känner</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Kund</th>
                    <th className="px-5 py-3">Datum</th>
                    <th className="px-5 py-3">Plan</th>
                    <th className="px-5 py-3">Månad</th>
                    <th className="px-5 py-3">Provision/mån</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referrals.map(ref => {
                    const status = statusLabel(ref.status)
                    return (
                      <tr key={ref.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-gray-900">
                            {ref.business_name || ref.email || '—'}
                          </p>
                          {ref.business_name && ref.email && (
                            <p className="text-xs text-gray-400">{ref.email}</p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          {ref.converted_at ? formatDate(ref.converted_at) : formatDate(ref.created_at)}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">{planLabel(ref.plan)}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          {ref.status === 'active' || ref.status === 'rewarded'
                            ? `${ref.commission_month}/12`
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-sm font-medium text-teal-700">
                          {ref.monthly_commission > 0 ? formatSek(ref.monthly_commission) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.color}`}>
                            {status.text}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Commission info */}
        <div className="mt-6 bg-teal-50 border border-teal-200 rounded-xl p-5">
          <h3 className="font-semibold text-teal-800 mb-2">Om provisionsutbetalning</h3>
          <p className="text-sm text-teal-700">
            Provisionen beräknas automatiskt varje månad baserat på dina kunders aktiva prenumerationer.
            Utbetalning sker månadsvis i efterskott. Kontakta oss om du har frågor om din provision.
          </p>
        </div>
      </div>
    </div>
  )
}
