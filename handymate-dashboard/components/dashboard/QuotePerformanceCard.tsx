'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Clock } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'

interface QuotePerformanceData {
  period: string
  totals: {
    sent_count: number
    won_count: number
    lost_count: number
    open_count: number
    acceptance_rate: number | null
    won_value: number
    avg_hours_to_open: number | null
    avg_hours_to_win: number | null
    never_opened_pct: number
  }
  funnel: Array<{ label: string; count: number }>
  by_detail_level: Array<{
    level: string
    label: string
    sent: number
    won: number
    acceptance_rate: number | null
  }>
  by_opened: Array<{
    label: string
    sent: number
    won: number
    acceptance_rate: number | null
  }>
  loss_reasons: Array<{ reason: string; count: number }>
}

const PERIODS: Array<{ key: '30d' | '90d' | '365d'; label: string }> = [
  { key: '30d', label: '30 dagar' },
  { key: '90d', label: '90 dagar' },
  { key: '365d', label: '365 dagar' },
]

function formatHoursToWin(hours: number | null): string {
  if (hours === null) return '—'
  if (hours > 24) return `${Math.round((hours / 24) * 10) / 10} dagar`
  return `${Math.round(hours * 10) / 10} tim`
}

export default function QuotePerformanceCard() {
  const business = useBusiness()
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<'30d' | '90d' | '365d'>('90d')
  const [data, setData] = useState<QuotePerformanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Hämta först när användaren fällt ut — offert-listan är primär, analysen
  // är en frivillig fördjupning (undvik "på hög"-känslan + onödigt anrop).
  useEffect(() => {
    if (!open) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id, period, open])

  async function fetchData() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/analytics/quote-performance?period=${period}`)
      if (res.ok) {
        setData(await res.json())
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    }
    setLoading(false)
  }

  const { totals, funnel, by_detail_level, by_opened, loss_reasons } = data || {
    totals: null, funnel: [], by_detail_level: [], by_opened: [], loss_reasons: [],
  }
  const maxFunnelCount = Math.max(...funnel.map(f => f.count), 1)
  const maxLossCount = Math.max(...loss_reasons.map(r => r.count), 1)
  const [opened, neverOpened] = by_opened.length === 2 ? by_opened : [null, null]
  const showTakeaway =
    !!opened && !!neverOpened &&
    opened.sent > 0 && neverOpened.sent > 0 &&
    opened.acceptance_rate !== null && neverOpened.acceptance_rate !== null &&
    opened.acceptance_rate >= neverOpened.acceptance_rate * 1.5

  const isEmpty = !!data && totals !== null && totals.sent_count === 0

  return (
    <div className="mb-8">
      {/* Hopfällbar trigger — offert-listan äger sidan; analysen är valfri. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 text-left hover:border-gray-300 transition-colors"
      >
        <div className="p-1.5 rounded-lg bg-primary-100">
          <Clock className="w-4 h-4 text-primary-700" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-900">Offert-prestanda</span>
          <span className="text-xs text-gray-500 ml-2">Vad gör att kunder tackar ja?</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {!open ? null : loading ? (
        <div className="mt-3 bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse">
          <div className="h-3 w-40 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-3 bg-gray-100 rounded-full" />)}
          </div>
        </div>
      ) : error || isEmpty || !totals ? (
        <div className="mt-3 bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-sm text-gray-400 text-center py-2">
            {error ? 'Kunde inte ladda analysen just nu.' : 'Inga skickade offerter i perioden än.'}
          </p>
        </div>
      ) : (
      <div className="mt-3 space-y-4">
      {/* Period toggle + snittid till svar (enda KPI:n listsidan inte redan har) */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-gray-500">
          Snittid till svar: <b className="font-semibold text-gray-700">{formatHoursToWin(totals.avg_hours_to_win)}</b>
          {' · '}Vunnet värde: <b className="font-semibold text-gray-700">{totals.won_value.toLocaleString('sv-SE')} kr</b>
        </span>
        <div className="flex gap-1.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                period === p.key
                  ? 'bg-primary-700 text-white'
                  : 'bg-white border border-[#E2E8F0] text-gray-600 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Vad händer med dina offerter</h3>
        <div className="space-y-3">
          {funnel.map(step => {
            const pct = (step.count / maxFunnelCount) * 100
            return (
              <div key={step.label} className="flex items-center gap-3">
                <span className="w-32 text-xs text-gray-500 shrink-0">{step.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-primary-600 transition-all"
                    style={{ width: `${Math.max(pct, step.count > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-medium text-gray-600">{step.count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* By detail level */}
      {by_detail_level.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Vinst efter visningsnivå</h3>
          <div className="space-y-2.5">
            {by_detail_level.map(row => (
              <div key={row.level} className="flex items-center gap-3">
                <span className="w-32 text-xs text-gray-500 shrink-0 truncate">{row.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-primary-600 transition-all"
                    style={{ width: `${row.acceptance_rate ?? 0}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs font-medium text-gray-600">
                  {row.acceptance_rate !== null ? `${row.acceptance_rate}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opened vs never opened */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Öppnade vs aldrig öppnade</h3>
        <div className="space-y-2.5">
          {by_opened.map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-32 text-xs text-gray-500 shrink-0">{row.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div
                  className="h-3 rounded-full bg-primary-600 transition-all"
                  style={{ width: `${row.acceptance_rate ?? 0}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs font-medium text-gray-600">
                {row.acceptance_rate !== null ? `${row.acceptance_rate}%` : '—'}
              </span>
            </div>
          ))}
        </div>
        {showTakeaway && (
          <p className="text-xs text-gray-500 mt-3">
            Offerter kunden öppnat vinner betydligt oftare.
          </p>
        )}
      </div>

      {/* Loss reasons */}
      {loss_reasons.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Vanligaste nej-orsaker</h3>
          <div className="space-y-2">
            {loss_reasons.slice(0, 6).map(r => (
              <div key={r.reason} className="flex items-center gap-3">
                <span className="w-32 text-xs text-gray-600 shrink-0 truncate">{r.reason}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-red-400 transition-all"
                    style={{ width: `${(r.count / maxLossCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-medium text-gray-600">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  )
}
