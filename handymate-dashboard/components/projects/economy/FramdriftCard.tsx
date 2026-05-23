'use client'

import { BarChart3, Clock, Target, Wallet } from 'lucide-react'

/**
 * FramdriftCard (Etapp 4b steg 3, 2026-05-23).
 *
 * Sammanslagen progress + Budget vs Utfall för Översikt-tabben.
 * Ersätter de två separata gamla korten ("Framsteg" + "Budget vs
 * Utfall") med ett enda kort som följer Design:s OversiktDesktop-
 * mönster.
 *
 * Tre delar staplat:
 *   1. Övergripande progress (project.progress_percent)
 *   2. Budget vs Utfall: timmar (om budget_hours satt)
 *   3. Budget vs Utfall: belopp (om budget_amount satt OCH värdet finns)
 *      — märkt "netto, exkl moms" för konsekvens med Ekonomi-vyn
 *
 * Belopps-sektionen renderas inte alls om actualRevenue==null — det
 * inträffar t.ex. när /api/projects/[id]/summary har strippats för
 * icke-see_financials. Tim-sektionen är alltid synlig (arbets-info,
 * inte pris-info).
 */

interface FramdriftCardProps {
  progressPercent: number
  budgetHours: number | null
  actualHours: number
  budgetAmount: number | null
  /** Faktisk intäkt från time_entries × hourly_rate. Null/0 om data är
      strippat eller saknas — beloppssektionen visas då inte. */
  actualRevenue: number | null
  formatHours: (h: number) => string
  formatCurrency: (v: number) => string
}

function barColor(percent: number): string {
  if (percent >= 100) return 'bg-red-500'
  if (percent >= 85) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function Eyebrow({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
      {icon}
      {children}
    </span>
  )
}

export function FramdriftCard({
  progressPercent,
  budgetHours,
  actualHours,
  budgetAmount,
  actualRevenue,
  formatHours,
  formatCurrency,
}: FramdriftCardProps) {
  const hasHoursBudget = budgetHours != null && budgetHours > 0
  const hasAmountBudget =
    budgetAmount != null && budgetAmount > 0 && actualRevenue != null && actualRevenue > 0

  const hoursPercent = hasHoursBudget
    ? Math.round((actualHours / (budgetHours as number)) * 100)
    : 0
  const amountPercent = hasAmountBudget
    ? Math.round(((actualRevenue as number) / (budgetAmount as number)) * 100)
    : 0

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 className="w-4 h-4 text-primary-700" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary-700">
          Framdrift
        </span>
      </div>

      {/* 1. Övergripande progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow icon={<Target className="w-3 h-3" />}>Framsteg</Eyebrow>
          <span
            className="text-2xl font-bold tabular-nums text-slate-900"
            style={{
              fontFamily: 'var(--font-display, "Space Grotesk", system-ui)',
              letterSpacing: '-0.025em',
            }}
          >
            {progressPercent}%
          </span>
        </div>
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-700 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* 2. Budget vs Utfall — timmar */}
      {hasHoursBudget && (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <Eyebrow icon={<Clock className="w-3 h-3" />}>Timmar</Eyebrow>
            <span className="text-sm font-semibold text-slate-700 tabular-nums">
              {formatHours(actualHours)}
              <span className="text-slate-400 font-normal"> / {formatHours(budgetHours as number)}</span>
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(hoursPercent)}`}
              style={{ width: `${Math.min(hoursPercent, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
            {hoursPercent}% använt
          </p>
        </div>
      )}

      {/* 3. Budget vs Utfall — belopp (gömd om data saknas/strippat) */}
      {hasAmountBudget && (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <Eyebrow icon={<Wallet className="w-3 h-3" />}>Belopp</Eyebrow>
            <span className="text-sm font-semibold text-slate-700 tabular-nums">
              {formatCurrency(actualRevenue as number)}
              <span className="text-slate-400 font-normal">
                {' '}/ {formatCurrency(budgetAmount as number)}
              </span>
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(amountPercent)}`}
              style={{ width: `${Math.min(amountPercent, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
            {amountPercent}% använt · netto, exkl moms
          </p>
        </div>
      )}
    </div>
  )
}
