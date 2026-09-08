import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPermission, isOwnerOrAdmin, type BusinessUser } from '@/lib/permissions'
import { reportDate, WorkReportError } from '@/lib/matte/work-report'
import { followupEnabled } from '@/lib/followup/service'

export type DaySource<T> = { state: 'ready'; value: T } | { state: 'unavailable'; message: string }
export interface MyDay {
  date: string; checkedAt: string
  work: DaySource<{ minutes: number; entries: number; notes: number; projects: Array<{ id: string; name: string; minutes: number; entries: number; notes: number }> }>
  timer: DaySource<boolean>
  decisions: DaySource<number> | null
  followups: DaySource<{ healthy: boolean; items: Array<{ id: string; quoteId: string; dueAt: string; state: string; reason: string | null }> }> | null
}
const unavailable = (message: string): DaySource<never> => ({ state: 'unavailable', message })
async function rows(query: PromiseLike<any>, maximum = 500): Promise<any[]> {
  const result = await query
  if (result.error || !Array.isArray(result.data) || result.data.length > maximum) throw Error('Incomplete source')
  return result.data
}

/** Read-only projection. Company decisions are owner/admin only; project access is
 * checked before naming a job. Never expose another member's time or financials.
 * Each source is independently complete or explicitly unavailable, never zero on error.
 */
export async function loadMyDay(db: SupabaseClient, businessId: string, user: BusinessUser | null, date?: unknown): Promise<MyDay> {
  if (!user?.is_active || !user.user_id || user.business_id !== businessId) throw new WorkReportError(403, 'Din användare kunde inte verifieras.')
  const day = reportDate(date)
  const own = (table: string, fields: string) => db.from(table).select(fields).eq('business_id', businessId).eq('business_user_id', user.id)
  const work = async (): Promise<MyDay['work']> => {
    try {
      const assigned = hasPermission(user, 'see_all_projects') ? null : new Set((await rows(own('project_assignment', 'project_id').limit(501))).map(r => r.project_id))
      const [time, notes] = await Promise.all([
        rows(own('time_entry', 'project_id,duration_minutes,check_in_time,check_out_time').eq('work_date', day).limit(501)),
        rows(own('project_log', 'order_id').eq('date', day).limit(501)),
      ])
      const ids: string[] = Array.from(new Set<string>([...time.map(r => r.project_id), ...notes.map(r => r.order_id)].filter(id => typeof id === 'string' && (!assigned || assigned.has(id)))))
      if (ids.some(id => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw Error('Invalid project identity')
      const projects = ids.length ? await rows(db.from('project').select('project_id,name').eq('business_id', businessId).in('project_id', ids).limit(501)) : []
      const items = projects.map(p => {
        const entries = time.filter(r => r.project_id === p.project_id)
        // An open timer isn't completed reported time. Unknown duration also isn't zero.
        if (entries.some(r => r.duration_minutes == null && !(r.check_in_time && !r.check_out_time) || r.duration_minutes != null && (!Number.isInteger(r.duration_minutes) || r.duration_minutes < 0))) throw Error('Invalid duration')
        const saved = entries.filter(r => !(r.check_in_time && !r.check_out_time))
        return { id: p.project_id, name: p.name || 'Jobb utan namn', minutes: saved.reduce((n, r) => n + r.duration_minutes, 0), entries: saved.length, notes: notes.filter(r => r.order_id === p.project_id).length }
      }).sort((a, b) => a.name.localeCompare(b.name, 'sv'))
      return { state: 'ready', value: { projects: items, minutes: items.reduce((n, p) => n + p.minutes, 0), entries: items.reduce((n, p) => n + p.entries, 0), notes: items.reduce((n, p) => n + p.notes, 0) } }
    } catch { return unavailable('Dagens sparade arbete kunde inte läsas fullständigt. Öppna Tid eller försök igen.') }
  }
  const timer = async (): Promise<MyDay['timer']> => {
    try {
      const [entries, checkins] = await Promise.all([
        rows(own('time_entry', 'time_entry_id').not('check_in_time', 'is', null).is('check_out_time', null).limit(1)),
        rows(own('time_checkins', 'id').is('checked_out_at', null).limit(1)),
      ])
      return { state: 'ready', value: entries.length > 0 || checkins.length > 0 }
    } catch { return unavailable('Din pågående timer eller instämpling kunde inte kontrolleras.') }
  }
  const decisions = async (): Promise<MyDay['decisions']> => {
    if (!isOwnerOrAdmin(user)) return null
    try {
      const result = await db.from('pending_approvals').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'pending')
      if (result.error || result.count == null || !Number.isInteger(result.count) || result.count < 0) throw Error('Unknown count')
      return { state: 'ready', value: result.count }
    } catch { return unavailable('Besluten som väntar på dig kunde inte kontrolleras.') }
  }
  const followups = async (): Promise<MyDay['followups']> => {
    if (!isOwnerOrAdmin(user) || !followupEnabled()) return null
    try {
      const [items, runner] = await Promise.all([
        rows(db.from('agent_followup').select('id,quote_id,due_at,state,reason').eq('business_id', businessId).in('state', ['scheduled', 'prepared', 'blocked', 'failed']).order('due_at').limit(101), 100),
        db.from('agent_followup_runner').select('enabled,last_tick_at').eq('singleton', true).single(),
      ])
      if (runner.error || !runner.data || items.some(r => !Number.isFinite(Date.parse(r.due_at)))) throw Error('Unknown followup')
      return { state: 'ready', value: { healthy: runner.data.enabled === true && Date.parse(runner.data.last_tick_at) > Date.now() - 300000, items: items.map(r => ({ id: r.id, quoteId: r.quote_id, dueAt: r.due_at, state: r.state, reason: r.reason })) } }
    } catch { return unavailable('Teamets planerade uppföljningar kunde inte kontrolleras. Kontrollera respektive offert.') }
  }
  const [workResult, timerResult, decisionResult, followupResult] = await Promise.all([work(), timer(), decisions(), followups()])
  return { date: day, checkedAt: new Date().toISOString(), work: workResult, timer: timerResult, decisions: decisionResult, followups: followupResult }
}
