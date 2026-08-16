'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck, Sparkles } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { ForecastReceipt, type ForecastReceiptData } from '@/components/business-twin/ForecastReceipt'

/**
 * EfterkalkylCard (Motor 1: Lärande prissättning — steg 1, 2026-07-16).
 *
 * Visar den frusna project_outcome-raden (offererat vs utfall) när ett
 * projekt är stängt. Självförsörjande — precis som ProjectEconomicsCard
 * hämtar den sin egen data (/api/projects/[id]/efterkalkyl), så den kan
 * placeras var som helst utan extra props från förälder.
 *
 * Rendrar INGENTING (return null) om:
 * - projektet inte är completed, eller
 * - ingen outcome-rad finns än (v73-migrationen ej körd, eller projektet
 *   stängdes innan Motor 1 fanns och lazy-backfill inte hunnit köras).
 *
 * Ärlighetsprincip (samma som MarginalCard/KostnadCard):
 * - Ingen offert kopplad → tomtext, ingen jämförelse påhittas.
 * - labor_cost_configured=false → visar timmar-diffen men ALDRIG marginal.
 */

interface ProjectOutcome {
  quote_id: string | null
  job_type: string | null
  quoted_amount: number | null
  quoted_hours: number | null
  actual_hours: number
  margin_kr: number | null
  margin_pct: number | null
  realized_margin_kr: number | null
  realized_margin_pct: number | null
  financial_learning_eligible: boolean
  learning_blockers: string[]
  labor_cost_configured: boolean
  hours_diff_pct: number | null
  amount_diff_pct: number | null
  closed_at: string
}

/** Fryst vid accept (v120, lib/quotes/margin-snapshot.ts) — kan saknas
    (kolumnen inte skapad än, eller offerten accepterad innan featuren fanns). */
interface ExpectedMarginSnapshot {
  margin_pct: number | null
}

interface EfterkalkylCardProps {
  projectId: string
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatHours(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n)} h`
}

/** grön ≤0, amber ≤15%, röd >15% (spec) — gäller absolutvärdet av diffen. */
function diffVariant(pct: number | null): 'neutral' | 'good' | 'warn' | 'bad' {
  if (pct == null) return 'neutral'
  const abs = Math.abs(pct)
  if (pct <= 0) return 'good'
  if (abs <= 15) return 'warn'
  return 'bad'
}

const VARIANT_TEXT: Record<string, string> = {
  neutral: 'text-slate-400',
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
}

const VARIANT_CARD: Record<string, string> = {
  neutral: 'bg-slate-50 border-slate-200',
  good: 'bg-emerald-50 border-emerald-200',
  warn: 'bg-amber-50 border-amber-200',
  bad: 'bg-red-50 border-red-200',
}

export function EfterkalkylCard({ projectId }: EfterkalkylCardProps) {
  const { isOwnerOrAdmin, loading: userLoading } = useCurrentUser()
  const [outcome, setOutcome] = useState<ProjectOutcome | null>(null)
  const [expectedMargin, setExpectedMargin] = useState<ExpectedMarginSnapshot | null>(null)
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [forecasts, setForecasts] = useState<ForecastReceiptData[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/efterkalkyl`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setOutcome(data.outcome || null)
        setExpectedMargin(data.expected_margin_snapshot || null)
        setProjectStatus(data.project_status || null)
      } catch {
        // Tyst degradering — sektionen visas bara inte.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (userLoading || !isOwnerOrAdmin) return
    const controller = new AbortController()
    fetch(`/api/business-twin/forecasts?project_id=${encodeURIComponent(projectId)}`, {
      signal: controller.signal,
    })
      .then(async response => response.ok ? response.json() : null)
      .then(data => setForecasts(data?.forecasts || []))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setForecasts([])
      })
    return () => controller.abort()
  }, [isOwnerOrAdmin, projectId, userLoading])

  if (loading || projectStatus !== 'completed' || !outcome) return null

  const hoursVariant = diffVariant(outcome.hours_diff_pct)
  const amountVariant = diffVariant(outcome.amount_diff_pct)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <ClipboardCheck className="w-3 h-3" />
          Efterkalkyl
        </span>
        <span className="text-[11px] text-slate-400">
          Fryst {new Date(outcome.closed_at).toLocaleDateString('sv-SE')}
        </span>
      </div>

      {!outcome.quote_id ? (
        <p className="text-sm text-slate-500">Ingen offert kopplad — ingen jämförelse.</p>
      ) : (
        <div className="space-y-3">
          {/* Timmar: offererat vs utfall */}
          {outcome.quoted_hours != null ? (
            <div className={`rounded-xl border p-3.5 ${VARIANT_CARD[hoursVariant]}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Timmar</span>
                {outcome.hours_diff_pct != null && (
                  <span className={`text-sm font-bold tabular-nums ${VARIANT_TEXT[hoursVariant]}`}>
                    {outcome.hours_diff_pct > 0 ? '+' : ''}
                    {outcome.hours_diff_pct}%
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                Offererat {formatHours(outcome.quoted_hours)} · Utfall {formatHours(outcome.actual_hours)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Ingen offererad tid registrerad — ingen tidsjämförelse.
            </p>
          )}

          {/* Marginal/belopp — ENDAST om arbetskostnad konfigurerad (ärlighetsprincipen) */}
          {outcome.labor_cost_configured ? (
            <div className={`rounded-xl border p-3.5 ${VARIANT_CARD[amountVariant]}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Kostnad vs offererat belopp</span>
                {outcome.amount_diff_pct != null && (
                  <span className={`text-sm font-bold tabular-nums ${VARIANT_TEXT[amountVariant]}`}>
                    {outcome.amount_diff_pct > 0 ? '+' : ''}
                    {outcome.amount_diff_pct}%
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {outcome.quoted_amount != null ? `Offererat ${formatKr(outcome.quoted_amount)} · ` : ''}
                {outcome.financial_learning_eligible
                  ? `Realiserad marginal ${formatKr(outcome.realized_margin_kr)}`
                  : `Förväntad marginal ${formatKr(outcome.margin_kr)}`}
                {outcome.financial_learning_eligible && outcome.realized_margin_pct != null
                  ? ` (${outcome.realized_margin_pct}%)`
                  : !outcome.financial_learning_eligible && outcome.margin_pct != null
                    ? ` (${outcome.margin_pct}%)`
                    : ''}
              </p>
              {!outcome.financial_learning_eligible && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Realiserad marginal visas först när utfärdad faktura och kostnadsunderlag är kompletta.
                </p>
              )}
              {expectedMargin?.margin_pct != null && (
                <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                  Förväntad vid accept: {expectedMargin.margin_pct}%
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700">
              Intern timkostnad ej konfigurerad — marginal visas inte (samma princip som
              ekonomikorten ovan).
            </p>
          )}
        </div>
      )}

      {isOwnerOrAdmin && forecasts.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Business Twin · prognoskvittot
          </p>
          <div className="space-y-2">
            {forecasts.slice(0, 3).map(forecast => (
              <div key={forecast.id} className="rounded-xl border border-teal-100 bg-teal-50/60 p-3.5">
                <ForecastReceipt forecast={forecast} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
