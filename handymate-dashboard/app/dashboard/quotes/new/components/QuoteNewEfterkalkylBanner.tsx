'use client'

import { useState } from 'react'
import { TrendingDown, TrendingUp, X } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'

/**
 * QuoteNewEfterkalkylBanner (Motor 1: Lärande prissättning — steg 2,
 * 2026-07-16). Mönster: QuoteNewPriceWarningsBanner (samma placering,
 * ovanför summeringssektionen).
 *
 * Visas ENDAST när count >= 3 OCH |avg_hours_diff_pct| >= 10 % — annars
 * return null (komponenten är självgardande, precis som
 * EfterkalkylCard). Avfärdbar per offert — lokal state, aldrig DB.
 */

export interface EfterkalkylInsight {
  count: number
  avg_hours_diff_pct: number | null
  avg_amount_diff_pct?: number | null
  avg_margin_pct?: number | null
  sample_job_types?: string[]
  insufficient?: boolean
}

interface QuoteNewEfterkalkylBannerProps {
  insight: EfterkalkylInsight | null
}

const MIN_COUNT = 3
const MIN_ABS_PCT = 10

export function QuoteNewEfterkalkylBanner({ insight }: QuoteNewEfterkalkylBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null
  if (!insight || insight.insufficient) return null
  if (insight.count < MIN_COUNT) return null
  if (insight.avg_hours_diff_pct == null || Math.abs(insight.avg_hours_diff_pct) < MIN_ABS_PCT) return null

  const matte = getAgentById('matte')
  const isOver = insight.avg_hours_diff_pct > 0
  const pctAbs = Math.round(Math.abs(insight.avg_hours_diff_pct))

  const text = isOver
    ? `Dina senaste ${insight.count} liknande jobb drog i snitt ${pctAbs} % över offererad tid. Överväg att lägga till marginal i tidsraderna.`
    : `Dina senaste ${insight.count} liknande jobb gick i snitt ${pctAbs} % snabbare än offererat — du kan ha utrymme att pressa priset.`

  return (
    <div
      className={`rounded-2xl border p-4 flex items-start gap-3 ${
        isOver ? 'bg-amber-50 border-amber-200' : 'bg-primary-50 border-primary-100'
      }`}
    >
      {matte?.avatar ? (
        <img
          src={matte.avatar}
          alt="Matte"
          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          M
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700 mb-0.5">Matte</p>
        <p className={`text-xs leading-relaxed flex items-start gap-1.5 ${isOver ? 'text-amber-800' : 'text-primary-800'}`}>
          {isOver ? (
            <TrendingUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          )}
          <span>{text}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-slate-400 hover:text-slate-600 flex-shrink-0"
        aria-label="Stäng"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
