'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { BarChart3, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Loader2, RefreshCw, Users, FileText, DollarSign, AlertCircle, Sparkles } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import type { MonthlyReviewData } from '@/lib/matte/monthly-review'

interface MonthlyReviewRow {
  id: string
  month: string
  data: MonthlyReviewData
  analysis: string
  recommendations: Array<{
    title: string
    description: string
    estimated_value_sek?: number
    action_type?: string
    target_customer_ids?: string[]
  }>
  sent_at: string | null
  viewed_at: string | null
  created_at: string
}

function formatSek(value: number): string {
  return new Intl.NumberFormat('sv-SE').format(value)
}

export default function MonthlyReviewPage() {
  const business = useBusiness()
  const toast = useToast()
  const [reviews, setReviews] = useState<MonthlyReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/monthly-reviews')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setReviews(json.reviews || [])
      // Auto-expandera senaste om inte tittat
      if (json.reviews?.[0] && !json.reviews[0].viewed_at) {
        setExpandedId(json.reviews[0].id)
      }
    } catch {
      toast.error('Kunde inte hämta månadsrapporter')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (business.business_id) fetchReviews()
  }, [business.business_id, fetchReviews])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/cron/monthly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Okänt fel' }))
        toast.error(err.error || 'Kunde inte generera rapport')
        return
      }
      toast.success('Månadsrapport genererad')
      await fetchReviews()
    } catch {
      toast.error('Något gick fel')
    } finally {
      setGenerating(false)
    }
  }

  async function handleExpand(id: string) {
    const newId = expandedId === id ? null : id
    setExpandedId(newId)
    if (newId) {
      // Markera som läst
      fetch('/api/monthly-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {})
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-5 h-5 text-primary-700" />
              <span className="text-[10px] tracking-[0.15em] uppercase text-primary-700 font-semibold">Matte • Månadsrapport</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Din affärsöversikt</h1>
            <p className="text-sm text-gray-500 mt-1">
              Varje månad 07:00 sammanställer Matte dina siffror och ger handlingsbara rekommendationer.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {generating ? 'Genererar...' : 'Generera nu'}
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Sparkles className="w-10 h-10 text-primary-700 mx-auto mb-3 opacity-60" />
            <p className="text-gray-700 font-medium">Ingen månadsrapport ännu</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">Klicka "Generera nu" för att skapa din första rapport.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(review => {
              const isExpanded = expandedId === review.id
              const d = review.data
              const momTrend = d.profitability.mom_change_pct
              return (
                <div key={review.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Row header */}
                  <button
                    onClick={() => handleExpand(review.id)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <div className="text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{d.month_label}</span>
                          {!review.viewed_at && (
                            <span className="text-[10px] uppercase tracking-wider bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded font-medium">Ny</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {d.profitability.invoiced_total.toLocaleString('sv-SE')} kr fakturerat · {review.recommendations.length} rekommendationer
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right shrink-0">
                      {d.profitability.invoiced_prev_month > 0 && (
                        <span className={`text-xs font-semibold flex items-center gap-1 ${momTrend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {momTrend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {momTrend >= 0 ? '+' : ''}{momTrend}%
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-100 space-y-5">
                      {/* KPI cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                        <KpiCard icon={DollarSign} label="Fakturerat" value={`${formatSek(d.profitability.invoiced_total)} kr`} color="primary" />
                        <KpiCard icon={DollarSign} label="Inbetalat" value={`${formatSek(d.profitability.paid_total)} kr`} color="emerald" />
                        <KpiCard icon={AlertCircle} label="Utestående" value={`${formatSek(d.profitability.outstanding_total)} kr`} color="amber" sub={`${d.profitability.outstanding_count} fakturor`} />
                        <KpiCard icon={Users} label="Konvertering" value={`${d.pipeline.conversion_rate_pct}%`} color="blue" sub={`${d.pipeline.won_leads}/${d.pipeline.new_leads} leads`} />
                      </div>

                      {/* AI analysis */}
                      <div className="bg-[#F8FAFC] rounded-xl p-5 border border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-primary-700" />
                          <span className="text-[11px] uppercase tracking-wider text-primary-700 font-semibold">Mattes analys</span>
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{review.analysis}</div>
                      </div>

                      {/* Rekommendationer */}
                      {review.recommendations.length > 0 && (
                        <div>
                          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Rekommendationer</h3>
                          <div className="space-y-2">
                            {review.recommendations.map((rec, idx) => (
                              <div key={idx} className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                                <div className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                                  {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800">{rec.description}</p>
                                  {rec.target_customer_ids && rec.target_customer_ids.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {rec.target_customer_ids.map(cid => {
                                        const cust = d.customers.inactive_60d_plus.find(c => c.customer_id === cid)
                                        return cust ? (
                                          <Link
                                            key={cid}
                                            href={`/dashboard/customers/${cid}`}
                                            className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded hover:bg-primary-100"
                                          >
                                            {cust.name}
                                          </Link>
                                        ) : null
                                      })}
                                    </div>
                                  )}
                                </div>
                                {rec.estimated_value_sek && (
                                  <span className="text-xs text-primary-700 font-semibold whitespace-nowrap">
                                    +{formatSek(rec.estimated_value_sek)} kr
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pipeline & kunder */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Pipeline</span>
                          </div>
                          <div className="space-y-1.5 text-sm">
                            <Row label="Nya leads" value={d.pipeline.new_leads} />
                            <Row label="Vunna" value={d.pipeline.won_leads} color="emerald" />
                            <Row label="Förlorade" value={d.pipeline.lost_leads} color="red" />
                            <Row label="Offerter skickade" value={d.pipeline.quotes_sent} />
                            <Row label="Offerter accepterade" value={d.pipeline.quotes_accepted} />
                            <Row label="Öppna offerter" value={d.pipeline.quotes_open} color="amber" />
                            {d.pipeline.avg_quote_amount > 0 && (
                              <Row label="Snittoffert" value={`${formatSek(d.pipeline.avg_quote_amount)} kr`} />
                            )}
                          </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4 text-gray-500" />
                            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Kunder</span>
                          </div>
                          <div className="space-y-1.5 text-sm">
                            <Row label="Nya kunder" value={d.customers.new_customers} />
                            <Row label="Inaktiva 60+ dagar" value={d.customers.inactive_60d_plus.length} color="amber" />
                            <Row label="Förfallna fakturor 30+" value={d.customers.overdue_invoice_30d_plus.length} color="red" />
                          </div>
                          {d.customers.overdue_invoice_30d_plus.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-[11px] text-gray-400 mb-1.5">Kunder att ringa:</p>
                              <div className="flex flex-wrap gap-1">
                                {d.customers.overdue_invoice_30d_plus.slice(0, 3).map(c => (
                                  <Link
                                    key={c.customer_id}
                                    href={`/dashboard/customers/${c.customer_id}`}
                                    className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded hover:bg-red-100"
                                  >
                                    {c.name} ({formatSek(c.overdue_amount)} kr)
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Projekt-lönsamhet */}
                      {(d.profitability.best_project || d.profitability.worst_project) && (
                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="w-4 h-4 text-gray-500" />
                            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Projekt-lönsamhet</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {d.profitability.best_project && (
                              <div className="p-3 bg-emerald-50 rounded-lg">
                                <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">Bäst marginal</p>
                                <p className="text-sm font-medium text-gray-900 truncate">{d.profitability.best_project.name}</p>
                                <p className="text-xs text-gray-600 mt-0.5">{d.profitability.best_project.margin_pct}% · {formatSek(d.profitability.best_project.revenue)} kr</p>
                              </div>
                            )}
                            {d.profitability.worst_project && d.profitability.worst_project !== d.profitability.best_project && (
                              <div className="p-3 bg-amber-50 rounded-lg">
                                <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">Sämst marginal</p>
                                <p className="text-sm font-medium text-gray-900 truncate">{d.profitability.worst_project.name}</p>
                                <p className="text-xs text-gray-600 mt-0.5">{d.profitability.worst_project.margin_pct}% · {formatSek(d.profitability.worst_project.revenue)} kr</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string; color: 'primary' | 'emerald' | 'amber' | 'blue' | 'red'; sub?: string }) {
  const colors: Record<string, string> = {
    primary: 'text-primary-700 bg-primary-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-700 bg-amber-50',
    blue: 'text-blue-700 bg-blue-50',
    red: 'text-red-700 bg-red-50',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className={`w-7 h-7 rounded-lg ${colors[color]} flex items-center justify-center mb-2`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</p>
      <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: number | string; color?: 'emerald' | 'red' | 'amber' }) {
  const colorCls = color === 'emerald' ? 'text-emerald-700' : color === 'red' ? 'text-red-700' : color === 'amber' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${colorCls}`}>{value}</span>
    </div>
  )
}
