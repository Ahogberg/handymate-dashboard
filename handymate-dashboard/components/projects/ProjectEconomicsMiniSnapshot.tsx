'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, Loader2, TrendingDown, TrendingUp } from 'lucide-react'

/**
 * ProjectEconomicsMiniSnapshot (Etapp 2.3.2).
 *
 * Kompakt ekonomi-puls för Översikt-tabben. Visar tre nyckeltal:
 * budget / fakturerat / marginal — plus klick-att-öppna-full-vy.
 *
 * Anropar samma /api/projects/[id]/profitability som
 * ProjectEconomicsCard (en sanning). Återinför funktionen som togs
 * bort i 2.2 (Lönsamhets-widget på Översikt), men nu mot helper-shapen.
 *
 * Marginal-färg följer samma logik som huvud-card:
 * - grå när 0/0 (ingen data)
 * - grå-varning när arbetskostnad_konfigurerad=false
 * - grön/röd vid verifierad marginal
 */

interface ProjectEconomicsLite {
  intakter: {
    budget_amount: number
    ata_signerat_kr: number
    fakturerat_kr: number
    forvantad_intakt_kr: number
  }
  kostnader: {
    total_kr: number | null
  }
  marginal: {
    arbetskostnad_konfigurerad: boolean
    marginal_kr: number | null
    marginal_pct: number | null
    är_tomt: boolean
    kostnad_sannolikt_komplett: boolean
    kostnad_completeness_pct: number | null
  }
}

interface ProjectEconomicsMiniSnapshotProps {
  projectId: string
  /** Klick på "Se hela ekonomivyn →" */
  onOpenFull?: () => void
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

export function ProjectEconomicsMiniSnapshot({
  projectId,
  onOpenFull,
}: ProjectEconomicsMiniSnapshotProps) {
  const [data, setData] = useState<ProjectEconomicsLite | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/profitability`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const payload = (await res.json()) as ProjectEconomicsLite
      setData(payload)
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta ekonomi')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-center min-h-[80px]">
        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
      </div>
    )
  }

  // Vid fetch-fel: dölj widget tyst (Översikt-tab ska inte ha brutet kort)
  if (error || !data) return null

  const { intakter, kostnader, marginal } = data
  const totalBudget = intakter.budget_amount + intakter.ata_signerat_kr

  // Inget att visa om projektet inte har budget alls
  if (totalBudget === 0 && intakter.fakturerat_kr === 0 && (kostnader.total_kr || 0) === 0) {
    return null
  }

  const isZeroData = intakter.forvantad_intakt_kr === 0 && (kostnader.total_kr || 0) === 0
  const isPositive =
    marginal.arbetskostnad_konfigurerad &&
    marginal.marginal_kr != null &&
    marginal.marginal_kr > 0 &&
    !isZeroData
  const isNegative =
    marginal.arbetskostnad_konfigurerad &&
    marginal.marginal_kr != null &&
    marginal.marginal_kr < 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
          {isNegative ? (
            <TrendingDown className="w-4 h-4 text-red-600" />
          ) : (
            <TrendingUp className={`w-4 h-4 ${isPositive ? 'text-emerald-600' : 'text-slate-400'}`} />
          )}
          Ekonomi-puls
        </h2>
        {onOpenFull && (
          <button
            type="button"
            onClick={onOpenFull}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-600"
          >
            Se hela ekonomivyn
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Total budget"
          value={formatKr(totalBudget)}
          subtle={intakter.ata_signerat_kr > 0 ? `varav ÄTA +${formatKr(intakter.ata_signerat_kr)}` : undefined}
        />
        <Stat
          label="Fakturerat"
          value={formatKr(intakter.fakturerat_kr)}
          subtle={totalBudget > 0 ? `${Math.round((intakter.fakturerat_kr / totalBudget) * 100)}%` : undefined}
        />
        {marginal.arbetskostnad_konfigurerad && marginal.marginal_kr != null ? (
          <Stat
            label="Marginal"
            value={(marginal.marginal_kr > 0 ? '+' : '') + formatKr(marginal.marginal_kr)}
            valueClass={
              isZeroData
                ? 'text-slate-500'
                : isPositive
                  ? 'text-emerald-700'
                  : isNegative
                    ? 'text-red-700'
                    : 'text-slate-600'
            }
            subtle={
              !marginal.är_tomt && !marginal.kostnad_sannolikt_komplett && marginal.kostnad_completeness_pct != null
                ? `preliminär (${marginal.kostnad_completeness_pct}% reg.)`
                : marginal.marginal_pct != null
                  ? `${marginal.marginal_pct}%`
                  : undefined
            }
          />
        ) : (
          <div className="flex flex-col">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Marginal</p>
            <div className="flex items-center gap-1 text-amber-700 mt-0.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs font-medium">Ej beräknad</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Sätt intern timkostnad</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  valueClass,
  subtle,
}: {
  label: string
  value: string
  valueClass?: string
  subtle?: string
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-base sm:text-lg font-bold tabular-nums mt-0.5 ${valueClass || 'text-slate-900'}`}>
        {value}
      </p>
      {subtle && <p className="text-[10px] text-slate-500 mt-0.5">{subtle}</p>}
    </div>
  )
}
