/**
 * Övertidsberäkning enligt svenska regler
 *
 * Arbetstidslagen:
 * - Normal arbetstid: 8 timmar/dag, 40 timmar/vecka
 * - Övertid: Tid utöver ordinarie arbetstid
 *
 * Vanliga OB-tillägg (kollektivavtal-beroende, konfigurerbara):
 * - Övertid vardag: 1.5x (enkel övertid)
 * - Övertid helg/kväll: 2.0x (kvalificerad övertid)
 */

export const DEFAULT_DAILY_HOURS = 8
export const DEFAULT_WEEKLY_HOURS = 40

interface DayEntry {
  work_date: string
  duration_minutes: number
  break_minutes?: number
}

interface OvertimeResult {
  date: string
  regular_minutes: number
  overtime_minutes: number
  total_minutes: number
}

interface WeekOvertimeResult {
  week_number: number
  year: number
  start_date: string
  end_date: string
  total_minutes: number
  regular_minutes: number
  daily_overtime_minutes: number
  weekly_overtime_minutes: number
  total_overtime_minutes: number
  days: OvertimeResult[]
}

/**
 * Beräkna övertid per dag
 * Allt över dailyHoursLimit timmar per dag = daglig övertid
 */
export function calculateDailyOvertime(
  entries: DayEntry[],
  dailyHoursLimit: number = DEFAULT_DAILY_HOURS
): OvertimeResult[] {
  // Gruppera per dag
  const byDate = new Map<string, number>()

  for (const entry of entries) {
    const current = byDate.get(entry.work_date) || 0
    byDate.set(entry.work_date, current + entry.duration_minutes)
  }

  const results: OvertimeResult[] = []
  const dailyLimitMinutes = dailyHoursLimit * 60

  byDate.forEach((totalMinutes, date) => {
    const overtime = Math.max(0, totalMinutes - dailyLimitMinutes)
    const regular = totalMinutes - overtime

    results.push({
      date,
      regular_minutes: regular,
      overtime_minutes: overtime,
      total_minutes: totalMinutes,
    })
  })

  return results.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Beräkna vecko-övertid
 * 1. Daglig övertid: >8h/dag
 * 2. Vecko-övertid: >40h/vecka (exklusive daglig övertid som redan räknats)
 */
export function calculateWeeklyOvertime(
  entries: DayEntry[],
  dailyHoursLimit: number = DEFAULT_DAILY_HOURS,
  weeklyHoursLimit: number = DEFAULT_WEEKLY_HOURS
): WeekOvertimeResult {
  const dailyResults = calculateDailyOvertime(entries, dailyHoursLimit)

  const totalMinutes = dailyResults.reduce((sum, d) => sum + d.total_minutes, 0)
  const dailyOvertimeMinutes = dailyResults.reduce((sum, d) => sum + d.overtime_minutes, 0)
  const regularAfterDaily = dailyResults.reduce((sum, d) => sum + d.regular_minutes, 0)

  // Vecko-övertid: reguljär tid (efter daglig övertid) som överskrider veckogränsen
  const weeklyLimitMinutes = weeklyHoursLimit * 60
  const weeklyOvertimeMinutes = Math.max(0, regularAfterDaily - weeklyLimitMinutes)
  const finalRegular = regularAfterDaily - weeklyOvertimeMinutes

  // Beräkna veckonummer
  const dates = entries.map(e => e.work_date).sort()
  const firstDate = dates[0] || new Date().toISOString().split('T')[0]
  const lastDate = dates[dates.length - 1] || firstDate
  const firstDateObj = new Date(firstDate)
  const weekNum = getISOWeek(firstDateObj)

  return {
    week_number: weekNum,
    year: firstDateObj.getFullYear(),
    start_date: firstDate,
    end_date: lastDate,
    total_minutes: totalMinutes,
    regular_minutes: finalRegular,
    daily_overtime_minutes: dailyOvertimeMinutes,
    weekly_overtime_minutes: weeklyOvertimeMinutes,
    total_overtime_minutes: dailyOvertimeMinutes + weeklyOvertimeMinutes,
    days: dailyResults,
  }
}

/**
 * Beräkna ISO-veckonummer
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Formatera minuter till "Xh Ym"
 */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
