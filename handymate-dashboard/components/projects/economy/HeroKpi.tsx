'use client'

import { ShoppingBag, TrendingUp } from 'lucide-react'

/**
 * HeroKpi (Etapp 4b steg 2, 2026-05-23).
 *
 * Stor KPI-card för top-rad i Ekonomi-fliken. Visar netto-värde
 * stort + inkl-moms som sekundär rad. Footnote längst ner.
 *
 * Används för Intäkt + Kostnad. Marginal har egen hero-variant
 * via MarginalCard size="hero".
 */

interface HeroKpiProps {
  label: string
  /** Visad direkt under label, hint om vad värdet representerar */
  sub?: string
  value: number
  /** Inkl-moms-version att visa som sekundär rad. Om null → visas ej. */
  inklMoms?: number | null
  vatRate?: number
  variant?: 'teal' | 'slate'
  /** Liten text längst ner — sammanställning eller kontext */
  footnote?: string
  icon?: 'trendUp' | 'bag'
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

export function HeroKpi({
  label,
  sub = 'netto, exkl moms',
  value,
  inklMoms,
  vatRate = 25,
  variant = 'slate',
  footnote,
  icon = 'trendUp',
}: HeroKpiProps) {
  const colorClass = variant === 'teal' ? 'text-primary-700' : 'text-slate-700'
  const IconCmp = icon === 'trendUp' ? TrendingUp : ShoppingBag
  const isEmpty = value === 0

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <IconCmp className={`w-4 h-4 ${colorClass}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${colorClass}`}>
          {label}
        </span>
      </div>
      <div className="text-[10px] text-slate-400 mb-1.5">{sub}</div>
      <div
        className="text-3xl font-bold tabular-nums tracking-tight"
        style={{
          fontFamily: 'var(--font-display, "Space Grotesk", system-ui)',
          letterSpacing: '-0.025em',
          color: isEmpty ? '#94A3B8' : '#0F172A',
        }}
      >
        {isEmpty ? '—' : formatKr(value)}
      </div>
      {value > 0 && inklMoms != null && (
        <div className="mt-1 text-xs text-slate-500 flex items-baseline gap-1.5">
          <span>+ moms {vatRate}%</span>
          <span className="text-slate-300">·</span>
          <span className="tabular-nums">{formatKr(inklMoms)}</span>
          <span className="text-slate-400 text-[10px]">inkl</span>
        </div>
      )}
      {footnote && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed">
          {footnote}
        </div>
      )}
    </div>
  )
}
