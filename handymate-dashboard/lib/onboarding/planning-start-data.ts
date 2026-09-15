import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { svStartOfDay, svDateStrPlusDays } from '@/lib/dates'
import { nextPlanningWeek, readStartReceipt, teamReceiptMatches, PLANNING_TEAM_KEY, PLANNING_CALENDAR_KEY, type PlanningStartView } from './planning-start'

/** Läsfel/trunkerade svar är okända, aldrig tomt eller klart. Inga kunduppgifter lämnar läsaren. */
export async function loadPlanningStart(db: SupabaseClient, businessId: string, now = new Date()): Promise<{
  view: PlanningStartView; memberIds: string[]
}> {
  const { weekStart, weekEnd } = nextPlanningWeek(now)
  const from = svStartOfDay(new Date(`${weekStart}T12:00:00Z`)).toISOString()
  const to = svStartOfDay(new Date(`${svDateStrPlusDays(1, new Date(`${weekEnd}T12:00:00Z`))}T12:00:00Z`)).toISOString()
  const [members, prefs, bookings, entries] = await Promise.all([
    db.from('business_users').select('id', { count: 'exact' }).eq('business_id', businessId).eq('is_active', true).order('id'),
    db.from('business_preferences').select('key, value').eq('business_id', businessId).in('key', [PLANNING_TEAM_KEY, PLANNING_CALENDAR_KEY]),
    db.from('booking').select('booking_id, assigned_user_id, scheduled_start, scheduled_end, status', { count: 'exact' })
      .eq('business_id', businessId).not('status', 'in', '(cancelled,no_show)').lt('scheduled_start', to)
      .or(`scheduled_end.gt.${from},and(scheduled_end.is.null,scheduled_start.gte.${from})`).order('booking_id'),
    db.from('schedule_entry').select('id, business_user_id, start_datetime, end_datetime, type, status', { count: 'exact' })
      .eq('business_id', businessId).neq('status', 'cancelled').lt('start_datetime', to).gt('end_datetime', from).order('id'),
  ])
  if ([members, prefs, bookings, entries].some(r => r.error || !r.data)
    || [members, bookings, entries].some(r => r.count == null || r.count !== r.data?.length)) {
    throw new Error('Kunde inte läsa team och planering. Försök igen.')
  }
  const memberIds = members.data!.map(m => m.id as string)
  const values = Object.fromEntries(prefs.data!.map(p => [p.key, p.value]))
  const team = readStartReceipt(values[PLANNING_TEAM_KEY])
  const calendar = readStartReceipt(values[PLANNING_CALENDAR_KEY])
  const teamConfirmed = teamReceiptMatches(team, memberIds)
  const ids = new Set(memberIds)
  const validSpan = (start: string, end: string | null) => !!end
    && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && Date.parse(end) > Date.parse(start)
  const unresolvedCount = bookings.data!.filter(b => !ids.has(b.assigned_user_id) || !validSpan(b.scheduled_start, b.scheduled_end)).length
    + entries.data!.filter(e => !ids.has(e.business_user_id) || !validSpan(e.start_datetime, e.end_datetime)).length
  const revision = createHash('sha256').update(JSON.stringify({ memberIds, team, weekStart, bookings: bookings.data, entries: entries.data })).digest('hex')
  return { memberIds, view: {
    memberCount: memberIds.length, teamConfirmed,
    // Engångsstart, ALDRIG aktuell beläggningsberedskap för framtida veckor.
    calendarStarted: teamConfirmed && teamReceiptMatches(calendar, memberIds) && typeof calendar?.weekStart === 'string',
    weekStart, weekEnd, revision, unresolvedCount,
    jobCount: bookings.data!.length + entries.data!.filter(e => e.type === 'project').length,
  } }
}
