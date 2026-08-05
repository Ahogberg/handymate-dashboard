'use client'

import { formatMinutes } from '@/lib/overtime'
import { fmtDuration, type Stats } from './types'

/**
 * TodaySummary — R4-A (tasks/resurs-masterplan.md). Sammanfattningen:
 * metrics-korten + övertidsindikatorn. Ren utflyttning ur TodayView.tsx,
 * oförändrad markup/beteende.
 */

/** Endast fälten TodaySummary faktiskt renderar — matchar shapen från
 *  lib/overtime.ts' calculateWeeklyOvertime() (typen exporteras inte
 *  därifrån, så vi speglar bara de fyra fält som används). */
interface WeekOvertimeSummary {
  week_number: number
  daily_overtime_minutes: number
  weekly_overtime_minutes: number
  total_overtime_minutes: number
}

interface TodaySummaryProps {
  stats: Stats
  weekOvertime: WeekOvertimeSummary | null
}

export default function TodaySummary({ stats, weekOvertime }: TodaySummaryProps) {
  return (
    <>
      {/* Metrics — gray cards, no icons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#F1F5F9] rounded-lg px-4 py-[14px]">
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Vecka totalt</div>
          <div className="text-[20px] font-medium text-[#1E293B]">{fmtDuration(stats.totalMinutesWeek)}</div>
        </div>
        <div className="bg-[#F1F5F9] rounded-lg px-4 py-[14px]">
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Fakturerbart</div>
          <div className="text-[20px] font-medium text-[#0F766E]">{fmtDuration(stats.billableMinutesWeek)}</div>
        </div>
        <div className="bg-[#F1F5F9] rounded-lg px-4 py-[14px]">
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Ofakturerat</div>
          <div className="text-[20px] font-medium text-[#1E293B]">{Math.round(stats.uninvoicedRevenue).toLocaleString('sv-SE')} kr</div>
        </div>
        <div className="bg-[#F1F5F9] rounded-lg px-4 py-[14px]">
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Månad totalt</div>
          <div className="text-[20px] font-medium text-[#1E293B]">{fmtDuration(stats.totalMinutesMonth)}</div>
        </div>
      </div>

      {/* Övertidsindikator */}
      {weekOvertime && weekOvertime.total_overtime_minutes > 0 && (
        <div className="bg-orange-50 border-thin border-orange-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <div>
            <span className="text-[13px] font-medium text-orange-700">Övertid vecka {weekOvertime.week_number}</span>
            <span className="text-[12px] text-orange-600 ml-2">
              {weekOvertime.daily_overtime_minutes > 0 && `Daglig: ${formatMinutes(weekOvertime.daily_overtime_minutes)}`}
              {weekOvertime.daily_overtime_minutes > 0 && weekOvertime.weekly_overtime_minutes > 0 && ' · '}
              {weekOvertime.weekly_overtime_minutes > 0 && `Vecko: ${formatMinutes(weekOvertime.weekly_overtime_minutes)}`}
            </span>
          </div>
          <span className="text-[16px] font-medium text-orange-700">{formatMinutes(weekOvertime.total_overtime_minutes)}</span>
        </div>
      )}
    </>
  )
}
