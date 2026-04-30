'use client'

import { Users } from 'lucide-react'

interface CustomersHeaderProps {
  totalCount: number
  vipCount: number
  campaignCount: number
}

/**
 * Sticky header med titel + KPI:er. Space Grotesk på rubriken,
 * KPI-pillar visar antal kunder, antal VIP (LTV ≥ 50000) och antal kampanjer.
 */
export function CustomersHeader({ totalCount, vipCount, campaignCount }: CustomersHeaderProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 sm:-mx-8 mb-6 px-4 sm:px-8 py-4 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Kunder</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">CRM och kundkommunikation</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <KpiPill label="Kunder" value={totalCount} />
          <KpiPill label="VIP" value={vipCount} accent="amber" />
          <KpiPill label="Kampanjer" value={campaignCount} />
        </div>
      </div>
    </div>
  )
}

function KpiPill({ label, value, accent }: { label: string; value: number; accent?: 'amber' }) {
  const valueCls = accent === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="inline-flex items-baseline gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl">
      <span className={`font-heading text-base font-bold tabular-nums tracking-tight ${valueCls}`}>{value}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  )
}
