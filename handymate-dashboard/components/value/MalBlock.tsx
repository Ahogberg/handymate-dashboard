'use client'

import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

/**
 * "Mål" — Company Goals (Business Twin-backlog #11, 2026-08-13). Litet
 * block på Månadsrapporten, bredvid AgarrapportBlock — INTE en ny
 * ekonomiyta (samma regel som A1: en andra ekonomiyta blir en
 * konkurrerande sanning).
 *
 * Läser business_config.margin_target_percent BARA när
 * margin_target_set_at bevisar att ägaren sparat värdet uttryckligen, samt
 * revenue_target_annual_sek (v128). Jämför mot redan beräknad
 * MonthlyReviewData — ingen ny ekonomilogik, bara en jämförelse av tal som
 * redan finns.
 *
 * Ärlighetsprincip: ett osatt omsättningsmål (null) visar ingen rad
 * alls — aldrig "0 kr" eller ett påhittat procenttal.
 */
interface Profitability {
  invoiced_total: number
  best_project: { name: string; margin_pct: number } | null
  worst_project: { name: string; margin_pct: number } | null
}

interface Props {
  monthLabel: string
  profitability: Profitability
}

export function MalBlock({ monthLabel, profitability }: Props) {
  const business = useBusiness()
  const [marginTarget, setMarginTarget] = useState<number | null>(null)
  const [revenueTargetAnnual, setRevenueTargetAnnual] = useState<number | null>(null)

  useEffect(() => {
    let aktiv = true
    supabase
      .from('business_config')
      .select('margin_target_percent, margin_target_set_at, revenue_target_annual_sek')
      .eq('business_id', business.business_id)
      .single()
      .then(({ data }: { data: { margin_target_percent: number | null; margin_target_set_at: string | null; revenue_target_annual_sek: number | null } | null }) => {
        if (!aktiv || !data) return
        setMarginTarget(
          data.margin_target_set_at && typeof data.margin_target_percent === 'number'
            ? data.margin_target_percent
            : null,
        )
        setRevenueTargetAnnual(
          data.revenue_target_annual_sek == null ? null : Number(data.revenue_target_annual_sek),
        )
      })
      .catch(() => { /* blocket är grädde, aldrig mjölk — se AgarrapportBlock */ })
    return () => { aktiv = false }
  }, [business.business_id])

  const kr = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} kr`
  const { best_project: best, worst_project: worst } = profitability

  const harNagot = revenueTargetAnnual != null || best || worst
  if (!harNagot) return null

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-primary-700" />
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Mål</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {revenueTargetAnnual != null && (
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Omsättning {monthLabel.toLowerCase()}
            </span>
            <p className="m-0 mt-1.5 font-heading text-2xl font-bold text-gray-900 tabular-nums">
              {kr(profitability.invoiced_total)}
            </p>
            <p className="m-0 mt-0.5 text-[11px] text-gray-500">
              mål ~{kr(revenueTargetAnnual / 12)} kr/mån ({Math.round((profitability.invoiced_total / (revenueTargetAnnual / 12)) * 100)}% av månadsmålet)
            </p>
          </div>
        )}

        {(best || worst) && (
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Marginal{marginTarget != null ? ` — mål ${marginTarget}%` : ''}
            </span>
            <p className="m-0 mt-1.5 text-[13px] text-gray-600">
              {best && <>Bäst: <b className="text-gray-900">{best.name}</b> ({best.margin_pct}%)</>}
              {best && worst && <br />}
              {worst && <>Sämst: <b className="text-gray-900">{worst.name}</b> ({worst.margin_pct}%)</>}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default MalBlock
