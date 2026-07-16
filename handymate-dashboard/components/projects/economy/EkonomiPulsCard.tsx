'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  deriveMarginalState,
  type MarginalDisplayState,
} from './MarginalCard'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'
import { useCurrentUser } from '@/lib/CurrentUserContext'

/**
 * EkonomiPulsCard (Etapp 4b steg 3, 2026-05-23).
 *
 * Mini-version av ekonomi-vyn för Översikt-tabben. Fyra kompakta KPI:er
 * (intäkt, fakturerat, material, marginal) + "Se hela ekonomivyn →"-länk.
 *
 * TD-20 (2026-07-16): "Material"-rutan lades till här — datan fanns redan
 * i den hämtade ProjectEconomics-payloaden (kostnader.material_inkop_kr /
 * material_billable_kr) men renderades aldrig i pulsen. Speglar samma
 * fält som KostnadCard.tsx "Material"-rad i hela Ekonomi-vyn.
 *
 * KRITISKT — en sanning, två presentationer:
 * Marginal-pulsen MÅSTE visa exakt samma tillstånd som Ekonomi-flikens
 * MarginalCard. Båda härleder state via deriveMarginalState(). Ingen
 * separat tröskel-logik här — det skulle riskera att Översikt visar
 * grön marginal när Ekonomi visar slate-grå preliminär.
 *
 * Fem visnings-tillstånd ärvs från MarginalCard:
 *   gate         → "Sätt intern timkostnad" (amber CTA)
 *   empty        → "—" neutral
 *   potential    → slate-grå siffra + "Preliminär"-pill
 *   preliminary  → slate-grå siffra + "Preliminär"-pill
 *   confirmed    → grön/röd siffra + check-pill
 */

interface EkonomiPulsCardProps {
  projectId: string
  /** Klick på "Se hela ekonomivyn →". Parent byter tab. */
  onOpenFull: () => void
  /** När parent triggar ändring som påverkar ekonomin, öka denna. */
  refreshKey?: number
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

export function EkonomiPulsCard({
  projectId,
  onOpenFull,
  refreshKey = 0,
}: EkonomiPulsCardProps) {
  const [data, setData] = useState<ProjectEconomics | null>(null)
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
      const payload = (await res.json()) as ProjectEconomics
      setData(payload)
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta ekonomi')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshKey])

  if (loading && !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-center min-h-[140px]">
        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (error || !data) return null

  const state = deriveMarginalState(data)
  return (
    <PulsCardLayout state={state} economics={data} onOpenFull={onOpenFull} />
  )
}

// ─────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────

function PulsCardLayout({
  state,
  economics,
  onOpenFull,
}: {
  state: MarginalDisplayState
  economics: ProjectEconomics
  onOpenFull: () => void
}) {
  const { intakter, kostnader, meta } = economics
  const totalIntakt = intakter.forvantad_intakt_kr
  const fakturerat = intakter.fakturerat_kr
  const fakturatProcent = totalIntakt > 0
    ? Math.round((fakturerat / totalIntakt) * 100)
    : null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HeaderIcon state={state} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary-700">
            Ekonomi-puls
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenFull}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800"
        >
          Se hela ekonomivyn
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
        <PulsStat
          label="Intäkt"
          value={formatKr(totalIntakt)}
          sub={
            intakter.ata_signerat_kr > 0
              ? `varav ÄTA +${formatKr(intakter.ata_signerat_kr)}`
              : 'netto, exkl moms'
          }
          tone="primary"
        />
        <PulsStat
          label="Fakturerat"
          value={formatKr(fakturerat)}
          sub={fakturatProcent != null ? `${fakturatProcent}% av intäkt` : 'inget fakturerat än'}
          tone="slate"
        />
        <PulsStat
          label="Material"
          value={formatKr(kostnader.material_inkop_kr)}
          sub={
            kostnader.material_inkop_kr > 0
              ? kostnader.material_billable_kr > 0
                ? `varav ${formatKr(kostnader.material_billable_kr)} fakturerbart`
                : `${meta.supplier_invoice_count} lev.faktura${meta.supplier_invoice_count === 1 ? '' : 'or'}`
              : 'inget registrerat än'
          }
          tone="slate"
          valueClass={kostnader.material_inkop_kr === 0 ? 'text-slate-400' : undefined}
        />
        <MarginalPuls state={state} economics={economics} />
      </div>
    </div>
  )
}

function HeaderIcon({ state }: { state: MarginalDisplayState }) {
  if (state === 'gate') return <AlertCircle className="w-4 h-4 text-amber-600" />
  if (state === 'confirmed') return <TrendingUp className="w-4 h-4 text-primary-700" />
  return <TrendingUp className="w-4 h-4 text-primary-700" />
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function PulsStat({
  label,
  value,
  sub,
  tone = 'slate',
  valueClass,
  pill,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'primary' | 'slate' | 'emerald' | 'red' | 'amber'
  valueClass?: string
  pill?: { text: string; variant: 'amber' | 'emerald' | 'red' } | null
}) {
  const toneClass = {
    primary: 'text-primary-700',
    slate: 'text-slate-500',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
  }[tone]

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${toneClass}`}>
          {label}
        </span>
        {pill && <MiniPill {...pill} />}
      </div>
      <div
        className={`mt-1.5 text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${valueClass || 'text-slate-900'}`}
        style={{
          fontFamily: 'var(--font-display, "Space Grotesk", system-ui)',
          letterSpacing: '-0.025em',
        }}
      >
        {value}
      </div>
      {sub && <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{sub}</p>}
    </div>
  )
}

function MiniPill({
  text,
  variant,
}: {
  text: string
  variant: 'amber' | 'emerald' | 'red'
}) {
  const variantClass = {
    amber: 'bg-amber-50 text-amber-700 border-amber-300',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[variant]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${variantClass}`}
    >
      {text}
    </span>
  )
}

function MarginalPuls({
  state,
  economics,
}: {
  state: MarginalDisplayState
  economics: ProjectEconomics
}) {
  const { isOwnerOrAdmin } = useCurrentUser()
  const { marginal } = economics

  // Gate-tillstånd — visa amber CTA istället för siffra
  if (state === 'gate') {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Marginal
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-semibold">Ej beräknad</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          {isOwnerOrAdmin
            ? 'Sätt intern timkostnad i inställningar'
            : 'Intern timkostnad saknas'}
        </p>
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <PulsStat
        label="Marginal"
        value="—"
        sub="Inget registrerat än"
        tone="slate"
        valueClass="text-slate-400"
      />
    )
  }

  const isPotentialOrPreliminary = state === 'potential' || state === 'preliminary'
  const value = marginal.marginal_kr
  const pct = marginal.marginal_pct
  const valueLabel =
    value == null
      ? '—'
      : `${value > 0 ? '+' : ''}${formatKr(value)}`

  if (isPotentialOrPreliminary) {
    const completeness = marginal.kostnad_completeness_pct ?? 0
    return (
      <PulsStat
        label="Marginal"
        value={valueLabel}
        sub={
          state === 'potential'
            ? 'inga kostnader registrerade'
            : `${completeness}% kostnad registrerad`
        }
        tone="slate"
        valueClass="text-slate-700"
        pill={{ text: 'Preliminär', variant: 'amber' }}
      />
    )
  }

  // Confirmed — färg förtjänas
  const isPositive = (value ?? 0) >= 0
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${
            isPositive ? 'text-emerald-700' : 'text-red-700'
          }`}
        >
          Marginal
        </span>
        <MiniPill
          text={isPositive ? 'Bekräftad' : 'Underskott'}
          variant={isPositive ? 'emerald' : 'red'}
        />
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        {isPositive ? (
          <TrendingUp className="w-4 h-4 text-emerald-700" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-700" />
        )}
        <div
          className={`text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${
            isPositive ? 'text-emerald-700' : 'text-red-700'
          }`}
          style={{
            fontFamily: 'var(--font-display, "Space Grotesk", system-ui)',
            letterSpacing: '-0.025em',
          }}
        >
          {valueLabel}
        </div>
        {pct != null && (
          <span
            className={`text-xs font-bold tabular-nums ${
              isPositive ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            ({pct > 0 ? '+' : ''}{pct}%)
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
        netto, exkl moms
      </p>
    </div>
  )
}

