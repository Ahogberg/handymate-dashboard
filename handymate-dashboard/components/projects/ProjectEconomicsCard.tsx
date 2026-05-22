'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { ProjectCostModal } from './ProjectCostModal'

/**
 * ProjectEconomicsCard (Etapp 2.2, v53 2026-05-21).
 *
 * Self-contained ekonomi-vy för ett projekt. Fetchar från
 * /api/projects/[id]/profitability (som backendmässigt kallar
 * computeProjectEconomics från lib/projects/compute-economics.ts).
 *
 * Designkontrakt: tar bara projectId + onRefreshExternal som props.
 * Inga andra externa state-beroenden. Kan placeras var som helst —
 * överlever Etapp 4 meny-redesign.
 *
 * Kritiskt: om arbetskostnad_konfigurerad = false visas ALDRIG marginal-
 * siffra. Istället en CTA till inställningar (endast owner/admin).
 * Detta förhindrar falskt hög marginal när intern timkostnad saknas.
 */

interface ProjectEconomics {
  project_id: string
  business_id: string
  intakter: {
    budget_amount: number
    ata_signerat_kr: number
    ata_pending_kr: number
    fakturerat_kr: number
    betalt_kr: number
    forvantad_intakt_kr: number
  }
  kostnader: {
    arbete_kr: number | null
    arbete_timmar: number
    material_inkop_kr: number
    material_billable_kr: number
    extra_kr: number
    extra_per_kategori: Record<string, number>
    total_kr: number | null
  }
  marginal: {
    arbetskostnad_konfigurerad: boolean
    timrader_utan_kostnad: number
    marginal_kr: number | null
    marginal_pct: number | null
  }
  meta: {
    computed_at: string
    invoice_count: number
    ata_count: number
    time_entry_count: number
    supplier_invoice_count: number
    extra_cost_count: number
  }
}

interface ProjectEconomicsCardProps {
  projectId: string
  /** Externt-triggad refresh — när parent ändrar något som påverkar
      ekonomin (t.ex. statusbyte eller ny tid) öka denna. */
  refreshKey?: number
  /** Triggas när användaren klickar 'Fakturera projekt' (kvar att
      fakturera > 0). Parent ansvarar för att öppna faktura-modal/-route. */
  onInvoiceProject?: () => void
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatHours(h: number): string {
  return new Intl.NumberFormat('sv-SE', {
    maximumFractionDigits: 1,
  }).format(h)
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

export function ProjectEconomicsCard({ projectId, refreshKey = 0, onInvoiceProject }: ProjectEconomicsCardProps) {
  const { isOwnerOrAdmin } = useCurrentUser()
  const [data, setData] = useState<ProjectEconomics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [costModalOpen, setCostModalOpen] = useState(false)

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/profitability`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || `HTTP ${res.status}`)
        }
        const payload = (await res.json()) as ProjectEconomics
        setData(payload)
      } catch (err: any) {
        setError(err.message || 'Kunde inte hämta ekonomidata')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [projectId],
  )

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshKey])

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">{error || 'Kunde inte ladda ekonomidata'}</p>
        <button
          type="button"
          onClick={() => fetchData()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:text-primary-600"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Försök igen
        </button>
      </div>
    )
  }

  const { intakter, kostnader, marginal, meta } = data

  const totalBudget = intakter.budget_amount + intakter.ata_signerat_kr
  const kvarAttFakturera = Math.max(totalBudget - intakter.fakturerat_kr, 0)

  return (
    <div className="space-y-4">
      {/* INTÄKT */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Intäkt
          </h3>
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            title="Uppdatera"
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <Row label="Offert" value={formatKr(intakter.budget_amount)} />
          {intakter.ata_signerat_kr > 0 && (
            <Row
              label={`ÄTA (${meta.ata_count} st, signerade)`}
              value={`+${formatKr(intakter.ata_signerat_kr)}`}
              valueClass="text-emerald-700"
            />
          )}

          <div className="border-t border-slate-100 pt-2 mt-2" />

          <Row
            label="Total budget"
            value={formatKr(totalBudget)}
            bold
          />
          <Row
            label="Fakturerat"
            value={`${formatKr(intakter.fakturerat_kr)} (${pct(intakter.fakturerat_kr, totalBudget)})`}
          />
          <Row
            label="Betalt"
            value={`${formatKr(intakter.betalt_kr)} (${pct(intakter.betalt_kr, totalBudget)})`}
          />
          <Row
            label="Kvar att fakturera"
            value={formatKr(kvarAttFakturera)}
            valueClass={kvarAttFakturera > 0 ? 'text-amber-700' : 'text-slate-500'}
          />
        </div>

        {intakter.ata_pending_kr > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600 flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
            <span>
              ÄTA väntar på signering: <strong>+{formatKr(intakter.ata_pending_kr)}</strong> (räknas inte i total ännu)
            </span>
          </div>
        )}
      </section>

      {/* KOSTNAD */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Kostnad
          </h3>
          <button
            type="button"
            onClick={() => setCostModalOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Lägg till manuell kostnad
          </button>
        </div>
        <div className="space-y-2 text-sm">
          <Row
            label={`Arbete (${formatHours(kostnader.arbete_timmar)} h)`}
            value={kostnader.arbete_kr == null ? '—' : formatKr(kostnader.arbete_kr)}
            valueClass={kostnader.arbete_kr == null ? 'text-slate-400 italic' : undefined}
          />
          <Row
            label={`Material (${meta.supplier_invoice_count} lev.fakt.)`}
            value={formatKr(kostnader.material_inkop_kr)}
          />
          {meta.extra_cost_count > 0 && (
            <Row
              label={`Manuella kostnader (${meta.extra_cost_count} st)`}
              value={formatKr(kostnader.extra_kr)}
            />
          )}

          <div className="border-t border-slate-100 pt-2 mt-2" />

          <Row
            label="Total kostnad"
            value={kostnader.total_kr == null ? '—' : formatKr(kostnader.total_kr)}
            valueClass={kostnader.total_kr == null ? 'text-slate-400 italic' : undefined}
            bold
          />
        </div>
      </section>

      {/* MARGINAL */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
          Marginal
        </h3>
        {marginal.arbetskostnad_konfigurerad && marginal.marginal_kr != null ? (
          (() => {
            // Färg-logik: grön = verifierad positiv, röd = negativ, grå =
            // noll/noll (ingen verklig data ännu). Grön "+0 kr" är vilseledande
            // när både intäkt och kostnad är 0 — signalerar lönsamhet utan grund.
            const isZeroData = intakter.forvantad_intakt_kr === 0 && (kostnader.total_kr || 0) === 0
            const isPositive = !isZeroData && marginal.marginal_kr > 0
            const isNegative = marginal.marginal_kr < 0
            const valueColor = isZeroData
              ? 'text-slate-500'
              : isPositive
                ? 'text-emerald-700'
                : isNegative
                  ? 'text-red-700'
                  : 'text-slate-600'
            const pctColor = isZeroData
              ? 'text-slate-400'
              : isPositive
                ? 'text-emerald-600'
                : isNegative
                  ? 'text-red-600'
                  : 'text-slate-500'
            return (
              <>
                <div className="flex items-baseline gap-3">
                  {isZeroData ? (
                    <TrendingUp className="w-5 h-5 text-slate-400" />
                  ) : isPositive ? (
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  ) : isNegative ? (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  ) : (
                    <TrendingUp className="w-5 h-5 text-slate-400" />
                  )}
                  <div className={`text-3xl font-bold tabular-nums ${valueColor}`}>
                    {marginal.marginal_kr > 0 ? '+' : ''}{formatKr(marginal.marginal_kr)}
                  </div>
                  {marginal.marginal_pct != null && (
                    <div className={`text-base font-semibold ${pctColor}`}>
                      ({marginal.marginal_pct}%)
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {isZeroData
                    ? 'Ingen intäkt eller kostnad registrerad ännu'
                    : 'Total budget − kostnad'}
                </p>
              </>
            )
          })()
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  Sätt intern timkostnad för att se marginal
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  {marginal.timrader_utan_kostnad > 0 ? (
                    <>
                      {marginal.timrader_utan_kostnad} timrad
                      {marginal.timrader_utan_kostnad === 1 ? '' : 'er'} saknar kostnadsdata.
                      Vi visar inte marginal förrän intern timkostnad är satt — annars
                      hade siffran blivit missvisande.
                    </>
                  ) : (
                    <>
                      Intern timkostnad (lön + sociala avgifter + overhead) krävs för
                      marginal-beräkning. Sätt antingen per anställd eller som
                      företags-default.
                    </>
                  )}
                </p>
                {isOwnerOrAdmin && (
                  <Link
                    href="/dashboard/settings/internal-costs"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:text-amber-700"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Gå till inställningar
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Fakturera projekt — visas när det finns mer att fakturera */}
      {onInvoiceProject && kvarAttFakturera > 0 && (
        <button
          type="button"
          onClick={onInvoiceProject}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-700 hover:bg-primary-600 text-white font-semibold rounded-xl transition-colors"
        >
          <Receipt className="w-5 h-5" />
          Fakturera projekt ({formatKr(kvarAttFakturera)} kvar)
        </button>
      )}

      <p className="text-[10px] text-slate-400 text-right">
        Uppdaterad {new Date(meta.computed_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
      </p>

      {costModalOpen && (
        <ProjectCostModal
          projectId={projectId}
          onClose={() => setCostModalOpen(false)}
          onSaved={() => {
            setCostModalOpen(false)
            fetchData(true)
          }}
        />
      )}
    </div>
  )
}

function Row({
  label,
  value,
  valueClass,
  bold,
}: {
  label: string
  value: string
  valueClass?: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-slate-600 ${bold ? 'font-semibold text-slate-900' : ''}`}>{label}</span>
      <span
        className={`tabular-nums ${bold ? 'font-bold text-slate-900' : 'text-slate-900'} ${valueClass || ''}`}
      >
        {value}
      </span>
    </div>
  )
}
