'use client'

import { useEffect, useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  Zap,
  Target,
  Clock,
  Trophy,
  XCircle,
  Lightbulb,
  Loader2,
  ArrowRight,
  ChevronDown,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface SpeedData {
  avg_response_seconds: number
  median_response_seconds: number
  auto_response_count: number
  manual_response_count: number
  total_leads: number
  response_distribution: Record<string, number>
  win_rate_by_speed: Record<string, number>
  industry_avg_seconds: number
  trend: { week: string; avg_seconds: number }[]
}

interface WinLossData {
  period: string
  total_deals: number
  won: number
  lost: number
  active: number
  win_rate: number
  won_value: number
  lost_value: number
  avg_deal_size_won: number
  avg_deal_size_lost: number
  avg_days_to_win: number
  avg_days_to_loss: number
  loss_reasons: { reason: string; count: number; value: number }[]
  win_rate_by_source: { source: string; leads: number; won: number; rate: number }[]
  monthly_trend: { month: string; won: number; lost: number; rate: number }[]
}

function formatValue(v: number): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')}M kr`
  if (v >= 1000) return `${Math.round(v / 1000)}k kr`
  return `${v.toLocaleString('sv-SE')} kr`
}

function formatResponseTime(secs: number): string {
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const SPEED_BUCKETS = [
  { key: 'under_1_min', label: '< 1 min' },
  { key: '1_to_15_min', label: '1-15 min' },
  { key: '15_to_60_min', label: '15-60 min' },
  { key: '1_to_4_hours', label: '1-4 tim' },
  { key: 'over_4_hours', label: '> 4 tim' },
]

export default function AnalyticsPage() {
  const business = useBusiness()
  const { hasFeature: canAccess } = useBusinessPlan()

  const [period, setPeriod] = useState('90d')
  const [speedData, setSpeedData] = useState<SpeedData | null>(null)
  const [winLossData, setWinLossData] = useState<WinLossData | null>(null)
  const [insights, setInsights] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [econ, setEcon] = useState<{
    invoiced: number; unpaidCount: number; unpaidAmount: number
    estimatedMargin: number | null; overheadSet: boolean
    monthlyTrend: { month: string; amount: number }[]
    materialCost: number; laborCost: number; overhead: number
  } | null>(null)

  if (!canAccess('lead_intelligence')) {
    return <UpgradePrompt featureKey="lead_intelligence" />
  }

  useEffect(() => {
    fetchAll()
  }, [business.business_id, period])

  async function fetchAll() {
    setLoading(true)
    try {
      const [speedRes, winLossRes, insightsRes, econRes] = await Promise.all([
        fetch(`/api/analytics/speed-to-lead?period=${period}&business_id=${business.business_id}`),
        fetch(`/api/analytics/win-loss?period=${period}&business_id=${business.business_id}`),
        fetch(`/api/analytics/insights?business_id=${business.business_id}`),
        fetch(`/api/analytics/economics?business_id=${business.business_id}`),
      ])

      if (speedRes.ok) setSpeedData(await speedRes.json())
      if (winLossRes.ok) setWinLossData(await winLossRes.json())
      if (insightsRes.ok) {
        const data = await insightsRes.json()
        setInsights(data.insights || [])
      }
      if (econRes.ok) setEcon(await econRes.json())
    } catch { /* ignore */ }
    setLoading(false)
  }

  const speedChartData = SPEED_BUCKETS.map(b => ({
    name: b.label,
    leads: speedData?.response_distribution[b.key] || 0,
    winRate: speedData?.win_rate_by_speed[b.key] || 0,
  }))

  const trendData = (speedData?.trend || []).map(t => ({
    week: t.week.replace(/^\d{4}-/, ''),
    seconds: t.avg_seconds,
  }))

  const lossData = (winLossData?.loss_reasons || []).map(r => ({
    name: r.reason,
    count: r.count,
    value: r.value,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-sky-700" />
              Analys &amp; Ekonomi
            </h1>
            <p className="text-sm text-gray-500 mt-1">Försäljningsinsikter och ekonomiöversikt</p>
          </div>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-700 focus:outline-none focus:border-primary-500"
          >
            <option value="30d">Senaste 30 dagar</option>
            <option value="90d">Senaste 90 dagar</option>
            <option value="12m">Senaste 12 månader</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-sky-700 animate-spin" />
          </div>
        ) : (
          <>
            {/* ═══ Ekonomi ═══ */}
            {econ && (
              <>
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Ekonomi</h2>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Topprad: 3 metrikkort */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <span className="text-xs text-gray-400 uppercase tracking-wider">Fakturerat denna månad</span>
                    <p className="text-2xl font-bold text-gray-900 mt-1">~{econ.invoiced.toLocaleString('sv-SE')} kr</p>
                  </div>
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <span className="text-xs text-gray-400 uppercase tracking-wider">Uppskattad vinst</span>
                    <p className="text-2xl font-bold text-gray-900 mt-1">~{Math.max(0, econ.invoiced - econ.materialCost - econ.laborCost - econ.overhead).toLocaleString('sv-SE')} kr</p>
                  </div>
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <span className="text-xs text-gray-400 uppercase tracking-wider">Uppskattad marginal</span>
                    <p className={`text-2xl font-bold mt-1 ${(econ.estimatedMargin ?? 0) >= 50 ? 'text-emerald-600' : (econ.estimatedMargin ?? 0) >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                      {econ.estimatedMargin !== null ? `~${econ.estimatedMargin}%` : '—'}
                    </p>
                  </div>
                </div>

                {/* Kostnadsfördelning */}
                {econ.invoiced > 0 && (
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Kostnadsfördelning</h3>
                    <div className="space-y-2.5">
                      {[
                        { label: 'Din vinst (est.)', value: Math.max(0, econ.invoiced - econ.materialCost - econ.laborCost - econ.overhead), color: 'bg-emerald-500' },
                        { label: 'Material', value: econ.materialCost, color: 'bg-sky-500' },
                        { label: 'Din tid', value: econ.laborCost, color: 'bg-primary-600' },
                        { label: 'Overhead', value: econ.overhead, color: 'bg-gray-400' },
                      ].filter(r => r.value > 0).map(row => {
                        const pct = Math.round((row.value / econ.invoiced) * 100)
                        return (
                          <div key={row.label} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-28 shrink-0">{row.label}</span>
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
                            <span className="text-xs text-gray-400 w-16 text-right">~{(row.value / 1000).toFixed(0)}k kr</span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-gray-300 mt-3">Estimat baserat på dina kostnadsinställningar</p>
                  </div>
                )}

                {/* Månadsöversikt */}
                {econ.monthlyTrend.length > 1 && (
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Fakturerat per månad</h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={econ.monthlyTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString('sv-SE')} kr`, 'Fakturerat']} />
                          <Bar dataKey="amount" fill="#0F766E" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {!econ.overheadSet && (
                  <a href="/dashboard/settings" className="block text-xs text-gray-400 hover:text-primary-700 transition-colors">
                    Justera kostnadsinställningar för bättre estimat →
                  </a>
                )}
              </>
            )}

            {/* ═══ Försäljningsinsikter ═══ */}
            <div className="flex items-center gap-3 pt-2">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Försäljningsinsikter</h2>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Overview KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-green-100"><Trophy className="w-4 h-4 text-green-600" /></div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Win-rate</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{winLossData?.win_rate || 0}%</p>
                <p className="text-xs text-gray-400 mt-1">{winLossData?.won || 0} vunna / {(winLossData?.won || 0) + (winLossData?.lost || 0)} avslutade</p>
              </div>
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-primary-100"><TrendingUp className="w-4 h-4 text-sky-700" /></div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Vunnet totalt</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatValue(winLossData?.won_value || 0)}</p>
                <p className="text-xs text-gray-400 mt-1">Snitt: {formatValue(winLossData?.avg_deal_size_won || 0)}/deal</p>
              </div>
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-amber-100"><Clock className="w-4 h-4 text-amber-600" /></div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Tid till vinst</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{winLossData?.avg_days_to_win || 0} dagar</p>
                <p className="text-xs text-gray-400 mt-1">Snitt från lead till avslut</p>
              </div>
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-purple-100"><Zap className="w-4 h-4 text-purple-600" /></div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Svarstid</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{speedData ? formatResponseTime(speedData.avg_response_seconds) : '-'}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {speedData && speedData.avg_response_seconds > 0
                    ? `${Math.round(speedData.industry_avg_seconds / speedData.avg_response_seconds)}x snabbare`
                    : 'Ingen data'
                  }
                </p>
              </div>
            </div>

            {/* AI Insights */}
            {insights.length > 0 && (
              <div className="bg-gradient-to-r from-primary-50 to-primary-50 rounded-xl border border-[#E2E8F0] p-5">
                <h3 className="text-sm font-semibold text-primary-900 flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-sky-700" />
                  AI-insikter
                </h3>
                <div className="space-y-2">
                  {insights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-primary-600 mt-0.5">•</span>
                      <p className="text-sm text-primary-800">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Two column: Speed-to-Lead + Win/Loss */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Speed-to-Lead */}
              <div className="bg-white rounded-xl border border-[#E2E8F0]">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Svarstid
                  </h3>
                </div>
                <div className="p-5 space-y-6">
                  {/* Distribution */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Fördelning</p>
                    <div className="space-y-2">
                      {SPEED_BUCKETS.map(bucket => {
                        const count = speedData?.response_distribution[bucket.key] || 0
                        const total = speedData?.total_leads || 1
                        const pct = (count / total) * 100
                        return (
                          <div key={bucket.key} className="flex items-center gap-2 text-sm">
                            <span className="w-16 text-gray-500 text-right text-xs">{bucket.label}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-3">
                              <div className="h-3 rounded-full bg-primary-700 transition-all" style={{ width: `${Math.max(pct, 1)}%` }} />
                            </div>
                            <span className="w-8 text-gray-600 text-xs text-right font-medium">{count}</span>
                            <span className="w-12 text-gray-400 text-xs text-right">({Math.round(pct)}%)</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Win-rate by speed */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Win-rate per svarstid</p>
                    {speedChartData.some(d => d.winRate > 0) ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={speedChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} unit="%" />
                          <Tooltip formatter={(value: any) => [`${value}%`, 'Win-rate']} />
                          <Bar dataKey="winRate" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-8">Inte tillräckligt med data</p>
                    )}
                  </div>

                  {/* Trend */}
                  {trendData.length > 1 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Svarstid-trend (veckosnitt)</p>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} unit="s" />
                          <Tooltip formatter={(value: any) => [formatResponseTime(value), 'Svarstid']} />
                          <ReferenceLine y={14400} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Bransch 4h', position: 'right', fontSize: 10 }} />
                          <Line type="monotone" dataKey="seconds" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* Win/Loss Analysis */}
              <div className="bg-white rounded-xl border border-[#E2E8F0]">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Target className="w-4 h-4 text-sky-700" />
                    Win/Loss-analys
                  </h3>
                </div>
                <div className="p-5 space-y-6">
                  {/* Loss reasons */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Förlustorsaker</p>
                    {lossData.length > 0 ? (
                      <div className="space-y-2">
                        {lossData.slice(0, 6).map(r => {
                          const maxCount = Math.max(...lossData.map(d => d.count), 1)
                          return (
                            <div key={r.name} className="flex items-center gap-2 text-sm">
                              <span className="w-32 text-gray-600 text-xs truncate">{r.name}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-3">
                                <div className="h-3 rounded-full bg-red-400 transition-all" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                              </div>
                              <span className="w-6 text-gray-600 text-xs text-right font-medium">{r.count}</span>
                              <span className="w-16 text-gray-400 text-xs text-right">{formatValue(r.value)}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Inga förlorade deals ännu</p>
                    )}
                  </div>

                  {/* Win-rate by source */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Win-rate per källa</p>
                    {(winLossData?.win_rate_by_source || []).length > 0 ? (
                      <div className="rounded-lg border border-[#E2E8F0] overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 text-gray-400">
                              <th className="text-left px-3 py-2 font-medium">Källa</th>
                              <th className="text-right px-3 py-2 font-medium">Leads</th>
                              <th className="text-right px-3 py-2 font-medium">Vunna</th>
                              <th className="text-right px-3 py-2 font-medium">Win %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(winLossData?.win_rate_by_source || []).slice(0, 8).map(s => (
                              <tr key={s.source} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-700 font-medium">{s.source}</td>
                                <td className="px-3 py-2 text-gray-500 text-right">{s.leads}</td>
                                <td className="px-3 py-2 text-gray-500 text-right">{s.won}</td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`font-medium ${s.rate >= 50 ? 'text-green-600' : s.rate >= 25 ? 'text-amber-600' : 'text-gray-500'}`}>{s.rate}%</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Ingen data</p>
                    )}
                  </div>

                  {/* Monthly trend */}
                  {(winLossData?.monthly_trend || []).length > 1 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Månadsvis trend</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={winLossData?.monthly_trend || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="won" name="Vunna" fill="#22c55e" radius={[4, 4, 0, 0]} stackId="a" />
                          <Bar dataKey="lost" name="Förlorade" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
