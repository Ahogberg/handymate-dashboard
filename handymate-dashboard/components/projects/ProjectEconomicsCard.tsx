'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Clock,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
} from 'lucide-react'
import { ProjectCostModal } from './ProjectCostModal'
import { MarginalCard } from './economy/MarginalCard'

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
    är_tomt: boolean
    kostnad_sannolikt_komplett: boolean
    kostnad_completeness_pct: number | null
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

      {/* MARGINAL — Etapp 4b steg 1 (2026-05-23): ersatt med MarginalCard.
          Komponenten bär ärlighets-hierarkin (fem states inkl. ej-konfig-
          gate) + completeness-bar med 30%-tröskel som tickmark. Använder
          COST_COMPLETENESS_THRESHOLD från helpern — en sanning. */}
      <MarginalCard economics={data} size="normal" />

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
