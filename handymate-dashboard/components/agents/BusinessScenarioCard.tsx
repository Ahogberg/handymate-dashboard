'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Eye, FlaskConical, Loader2, ShieldAlert } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import type { BusinessScenarioResult, ScenarioMetric } from '@/lib/business-twin/scenario-contract'
import { ForecastReceipt, type ForecastReceiptData } from '@/components/business-twin/ForecastReceipt'

function formatValue(value: number, unit: ScenarioMetric['unit']): string {
  if (unit === 'kr') return `${Math.round(value).toLocaleString('sv-SE')} kr`
  if (unit === 'pct') return `${value.toLocaleString('sv-SE')} %`
  return `${Math.round(value).toLocaleString('sv-SE')} dagar`
}

function deltaTone(metric: ScenarioMetric): string {
  if (metric.betterWhen === 'neutral' || metric.delta === 0) return 'text-slate-600 bg-slate-100'
  const improved = metric.betterWhen === 'higher' ? metric.delta > 0 : metric.delta < 0
  return improved ? 'text-emerald-700 bg-emerald-50' : 'text-amber-800 bg-amber-50'
}

function Delta({ metric }: { metric: ScenarioMetric }) {
  const sign = metric.delta > 0 ? '+' : ''
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${deltaTone(metric)}`}>
      {sign}{formatValue(metric.delta, metric.unit)}
    </span>
  )
}

/**
 * Samma scenarioyta i MatteChatModal och Jobbkompisen. Den visar bara
 * serverns strukturerade räkningsresultat — inga belopp räknas i UI:t.
 */
export function BusinessScenarioCard({ scenario }: { scenario: BusinessScenarioResult }) {
  const { isOwnerOrAdmin, loading: userLoading } = useCurrentUser()
  const [forecast, setForecast] = useState<ForecastReceiptData | null>(null)
  const [watchAvailable, setWatchAvailable] = useState(false)
  const [watchLoading, setWatchLoading] = useState(false)
  const [watchError, setWatchError] = useState<string | null>(null)

  useEffect(() => {
    if (userLoading || !isOwnerOrAdmin || !scenario.watch) return
    const controller = new AbortController()
    fetch(`/api/business-twin/forecasts?fingerprint=${encodeURIComponent(scenario.watch.fingerprint)}`, {
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('Kunde inte läsa bevakningen')
        return response.json()
      })
      .then(data => {
        setWatchAvailable(data.available === true)
        setForecast(data.forecast || null)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setWatchError('Kunde inte läsa bevakningen')
      })
    return () => controller.abort()
  }, [isOwnerOrAdmin, scenario.watch, userLoading])

  async function startWatching() {
    if (!scenario.watch || watchLoading) return
    setWatchLoading(true)
    setWatchError(null)
    try {
      const response = await fetch('/api/business-twin/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprint: scenario.watch.fingerprint,
          request: scenario.watch.request,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Bevakningen kunde inte startas')
      setWatchAvailable(data.available === true)
      setForecast(data.forecast || null)
    } catch (error) {
      setWatchError(error instanceof Error ? error.message : 'Bevakningen kunde inte startas')
    } finally {
      setWatchLoading(false)
    }
  }

  if (scenario.status === 'blocked') {
    return (
      <section className="mt-2 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70" aria-label="Blockerat scenario">
        <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3">
          <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden />
          <div>
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Kan inte räknas säkert</p>
            <h3 className="m-0 text-sm font-semibold text-slate-900">{scenario.title}</h3>
          </div>
        </div>
        <div className="space-y-3 px-4 py-3">
          <p className="m-0 text-sm text-slate-700">{scenario.summary}</p>
          <p className="m-0 text-xs font-medium text-slate-600">{scenario.recommendation}</p>
          {scenario.target && (
            <Link href={scenario.target.href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800">
              {scenario.target.label}<ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
      </section>
    )
  }

  const primary = scenario.metrics.find(metric => metric.key === scenario.primaryMetricKey) || scenario.metrics[0]

  return (
    <section className="mt-2 overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-white to-teal-50/70 shadow-sm" aria-label={scenario.title}>
      <div className="flex items-start justify-between gap-3 border-b border-teal-100 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
            <FlaskConical className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">Business Twin · uppskattat</p>
            <h3 className="m-0 truncate text-sm font-semibold text-slate-900">{scenario.title}</h3>
            <p className="m-0 truncate text-xs text-slate-500">{scenario.subject}</p>
          </div>
        </div>
      </div>

      {primary && (
        <div className="px-4 py-4">
          <p className="m-0 mb-2 text-xs font-medium text-slate-500">{primary.label}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tabular-nums text-slate-500">{formatValue(primary.baseline, primary.unit)}</span>
            <ArrowRight className="h-4 w-4 text-teal-500" aria-hidden />
            <span className="text-2xl font-bold tabular-nums text-slate-950">{formatValue(primary.scenario, primary.unit)}</span>
            <Delta metric={primary} />
          </div>
          <p className="m-0 mt-2 text-xs leading-relaxed text-slate-600">{scenario.summary}</p>
        </div>
      )}

      <div className="border-t border-teal-100 bg-white/70">
        {scenario.metrics.filter(metric => metric.key !== primary?.key).map(metric => (
          <div key={metric.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs last:border-b-0">
            <span className="text-slate-600">{metric.label}</span>
            <span className="tabular-nums text-slate-500">{formatValue(metric.baseline, metric.unit)} → {formatValue(metric.scenario, metric.unit)}</span>
            <Delta metric={metric} />
          </div>
        ))}
      </div>

      <details className="group border-t border-teal-100 bg-slate-50/70 px-4 py-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700 marker:hidden">
          Visa antaganden och underlag
        </summary>
        <div className="mt-3 space-y-3 text-xs text-slate-600">
          <ul className="m-0 space-y-1 pl-4">
            {scenario.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}
          </ul>
          <div className="space-y-1.5">
            {scenario.evidence.map(item => (
              <div key={`${item.label}:${item.value}`} className="flex items-start justify-between gap-3">
                <span>{item.label}</span>
                <span className="text-right font-medium text-slate-700">
                  <span className={`mr-1 text-[9px] font-bold uppercase tracking-wide ${item.truth === 'known' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {item.truth === 'known' ? 'Känt' : 'Uppskattat'}
                  </span>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </details>

      <div className="flex flex-col gap-2 border-t border-teal-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-xs font-medium leading-relaxed text-slate-700">{scenario.recommendation}</p>
        {scenario.target && (
          <Link href={scenario.target.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800">
            {scenario.target.label}<ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        )}
      </div>

      {scenario.watch && isOwnerOrAdmin && (
        <div className="border-t border-teal-100 bg-teal-50/60 px-4 py-3">
          {forecast ? (
            <ForecastReceipt forecast={forecast} />
          ) : watchAvailable ? (
            <button
              type="button"
              onClick={startWatching}
              disabled={watchLoading}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {watchLoading
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : <Eye className="h-4 w-4" aria-hidden />}
              {watchLoading ? 'Startar bevakning…' : 'Bevaka detta'}
            </button>
          ) : null}
          {watchError && <p className="m-0 mt-2 text-xs font-medium text-rose-700">{watchError}</p>}
        </div>
      )}
    </section>
  )
}
