import { svDateStr, svDateStrPlusDays } from '@/lib/dates'

export const PLANNING_TEAM_KEY = 'planning_team_start'
export const PLANNING_CALENDAR_KEY = 'planning_calendar_start'
export interface PlanningStartSignals {
  teamConfirmed: boolean
  calendarStarted: boolean
}
export interface PlanningStartView extends PlanningStartSignals {
  memberCount: number
  weekStart: string
  weekEnd: string
  jobCount: number
  unresolvedCount: number
  revision: string
}
/** Svensk kalendervecka, samma datumprimitiver som schemat. */
export function nextPlanningWeek(now = new Date()) {
  const today = svDateStr(now)
  const anchor = new Date(`${today}T12:00:00Z`)
  const dow = anchor.getUTCDay()
  const weekStart = svDateStrPlusDays(dow === 0 ? 1 : 8 - dow, anchor)
  return { weekStart, weekEnd: svDateStrPlusDays(6, new Date(`${weekStart}T12:00:00Z`)) }
}
export function readStartReceipt(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && parsed.version === 1 && typeof parsed.confirmedAt === 'string'
      && Number.isFinite(Date.parse(parsed.confirmedAt)) ? parsed : null
  } catch { return null }
}
/** Startbeviset följer medlemslistan; accepterad inbjudan krävs inte. */
export function teamReceiptMatches(receipt: Record<string, unknown> | null, memberIds: string[]): boolean {
  return memberIds.length > 0 && Array.isArray(receipt?.memberIds)
    && JSON.stringify([...receipt.memberIds].sort()) === JSON.stringify([...memberIds].sort())
}
