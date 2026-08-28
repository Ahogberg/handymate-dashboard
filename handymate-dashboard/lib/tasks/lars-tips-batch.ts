/**
 * "Lars tipsar" på startsidan — samma regler som på projektsidan
 * (lib/tasks/lars-tips.ts), körda över alla projekt användaren är med i,
 * batchat (en fråga per tabell, inte elva per projekt). 2026-08-28.
 *
 * Dagens bokning skärper tipset: ett projekt med besök i dag får sin
 * varför-rad prefixad med "Besök i dag 10:00 — …" och sorteras upp.
 * Max tre på startsidan, max två per projekt. Minnet ("inte aktuellt") är
 * samma project_tip_dismissal som projektsidan — inget nytt att komma ihåg.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { allaTips, filterTips, type LarsTip, type TipInput } from './lars-tips'

export const MAX_HOME_TIPS = 3
export const MAX_HOME_TIPS_PER_PROJECT = 2

export interface ProjectLite {
  project_id: string
  project_number: string | null
  name: string
  description: string | null
  job_type: string | null
  status: string | null
  start_date: string | null
  end_date: string | null
  completed_at: string | null
  current_workflow_stage_id: string | null
  customer_id: string | null
  quote_id: string | null
}

export interface HomeTip extends LarsTip {
  project_id: string
  project_name: string
  project_number: string | null
  /** HH:MM för dagens första besök på projektet, annars null */
  booking_today: string | null
}

function clock(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })
}

/** Ren: prioritet = passerat slut (0) → besök i dag (1) → närmast start (2+dagar) → övrigt (99). */
export function homeTipPriority(input: Pick<TipInput, 'endDate' | 'startDate' | 'todayIso'>, bookingToday: string | null): number {
  const day = (iso: string) => Math.round((new Date(iso.slice(0, 10) + 'T00:00:00Z').getTime() - new Date(input.todayIso + 'T00:00:00Z').getTime()) / 86_400_000)
  if (input.endDate && day(input.endDate) < 0) return 0
  if (bookingToday) return 1
  if (input.startDate) { const d = day(input.startDate); if (d >= 0) return 2 + d }
  return 99
}

/** Ren: alla projekts tips → dedup → besökskontext → prioritet → max tre. */
export function suggestHomeTips(
  inputs: Map<string, TipInput>,
  meta: Map<string, { name: string; project_number: string | null; bookingToday: string | null }>,
  max: number = MAX_HOME_TIPS,
): HomeTip[] {
  const out: (HomeTip & { prio: number })[] = []
  for (const [projectId, input] of Array.from(inputs.entries())) {
    const m = meta.get(projectId)
    if (!m) continue
    const tips = filterTips(input, allaTips(input)).slice(0, MAX_HOME_TIPS_PER_PROJECT)
    const prio = homeTipPriority(input, m.bookingToday)
    for (const t of tips) {
      out.push({
        ...t,
        reason: m.bookingToday ? `Besök i dag ${m.bookingToday} — ${t.reason.charAt(0).toLowerCase()}${t.reason.slice(1)}` : t.reason,
        project_id: projectId,
        project_name: m.name,
        project_number: m.project_number,
        booking_today: m.bookingToday,
        prio,
      })
    }
  }
  out.sort((a, b) => a.prio - b.prio)
  return out.slice(0, max).map(({ prio: _p, ...t }) => { void _p; return t })
}

/** Batchad laddning av TipInput för många projekt. Fel i en källa loggas och behandlas som tomt för den källan. */
export async function loadTipInputs(
  supabase: SupabaseClient,
  businessId: string,
  projects: ProjectLite[],
  todayIso: string,
): Promise<{ inputs: Map<string, TipInput>; bookingToday: Map<string, string | null> }> {
  const ids = projects.map(p => p.project_id)
  const inputs = new Map<string, TipInput>()
  const bookingToday = new Map<string, string | null>()
  if (ids.length === 0) return { inputs, bookingToday }
  const customerIds = Array.from(new Set(projects.map(p => p.customer_id).filter((x): x is string => !!x)))
  const quoteIds = Array.from(new Set(projects.map(p => p.quote_id).filter((x): x is string => !!x)))
  const tomorrowIso = new Date(new Date(todayIso + 'T00:00:00Z').getTime() + 86_400_000).toISOString().slice(0, 10)

  const q = <T,>(name: string, p: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) =>
    Promise.resolve(p).then(r => { if (r.error) console.error(`[lars-tips-batch] ${name}:`, r.error.message); return (r.data || []) as T[] })

  const [bookings, materials, milestones, checklists, times, installations, jobbpasses, tasks, dismissals, customers, quotes, notifs] = await Promise.all([
    q<{ project_id: string; scheduled_start: string | null; status: string | null }>('booking', supabase.from('booking').select('project_id, scheduled_start, status').eq('business_id', businessId).in('project_id', ids).limit(2000)),
    q<{ project_id: string }>('project_material', supabase.from('project_material').select('project_id').eq('business_id', businessId).in('project_id', ids).limit(5000)),
    q<{ project_id: string }>('project_milestone', supabase.from('project_milestone').select('project_id').in('project_id', ids).limit(5000)),
    q<{ project_id: string }>('project_checklist', supabase.from('project_checklist').select('project_id').eq('business_id', businessId).in('project_id', ids).limit(5000)),
    q<{ project_id: string; work_date: string | null }>('time_entry', supabase.from('time_entry').select('project_id, work_date').eq('business_id', businessId).in('project_id', ids).order('work_date', { ascending: false }).limit(3000)),
    q<{ project_id: string; name: string }>('installation', supabase.from('installation').select('project_id, name').eq('business_id', businessId).in('project_id', ids).eq('status', 'confirmed').eq('serial_pending', true)),
    q<{ project_id: string; status: string }>('jobbpass', supabase.from('jobbpass').select('project_id, status').eq('business_id', businessId).in('project_id', ids)),
    q<{ project_id: string; title: string }>('task', supabase.from('task').select('project_id, title').eq('business_id', businessId).in('project_id', ids).neq('status', 'done').limit(5000)),
    q<{ project_id: string; tip_key: string }>('project_tip_dismissal', supabase.from('project_tip_dismissal').select('project_id, tip_key').eq('business_id', businessId).in('project_id', ids)),
    customerIds.length ? q<{ customer_id: string; property_designation: string | null; personal_number: string | null }>('customer', supabase.from('customer').select('customer_id, property_designation, personal_number').eq('business_id', businessId).in('customer_id', customerIds)) : Promise.resolve([]),
    quoteIds.length ? q<{ quote_id: string; rot_deduction: number | null }>('quotes', supabase.from('quotes').select('quote_id, rot_deduction').eq('business_id', businessId).in('quote_id', quoteIds)) : Promise.resolve([]),
    customerIds.length ? q<{ customer_id: string }>('portal_notification_log', supabase.from('portal_notification_log').select('customer_id').eq('business_id', businessId).in('customer_id', customerIds).eq('event', 'jobbpass_published')) : Promise.resolve([]),
  ])

  const count = (rows: { project_id: string }[]) => rows.reduce((m, r) => m.set(r.project_id, (m.get(r.project_id) || 0) + 1), new Map<string, number>())
  const materialCount = count(materials), milestoneCount = count(milestones), checklistCount = count(checklists)
  const lastTime = new Map<string, string>()
  for (const t of times) if (t.work_date && !lastTime.has(t.project_id)) lastTime.set(t.project_id, t.work_date)
  const serialPending = new Map<string, string[]>()
  for (const i of installations) serialPending.set(i.project_id, [...(serialPending.get(i.project_id) || []), i.name])
  const jobbpassStatus = new Map(jobbpasses.map(j => [j.project_id, j.status]))
  const openTitles = new Map<string, string[]>()
  for (const t of tasks) openTitles.set(t.project_id, [...(openTitles.get(t.project_id) || []), t.title])
  const dismissed = new Map<string, string[]>()
  for (const d of dismissals) dismissed.set(d.project_id, [...(dismissed.get(d.project_id) || []), d.tip_key])
  const customerMap = new Map(customers.map(c => [c.customer_id, c]))
  const quoteRot = new Map(quotes.map(qq => [qq.quote_id, Number(qq.rot_deduction ?? 0) > 0]))
  const notified = new Set(notifs.map(n => n.customer_id))
  const live = bookings.filter(b => b.status !== 'cancelled' && b.scheduled_start)
  const upcoming = new Map<string, number>()
  for (const b of live) {
    const day = (b.scheduled_start as string).slice(0, 10)
    if (day >= todayIso) upcoming.set(b.project_id, (upcoming.get(b.project_id) || 0) + 1)
    if (day >= todayIso && day < tomorrowIso) {
      const c = clock(b.scheduled_start as string)
      const prev = bookingToday.get(b.project_id)
      if (!prev || c < prev) bookingToday.set(b.project_id, c)
    }
  }

  for (const p of projects) {
    const cust = p.customer_id ? customerMap.get(p.customer_id) : undefined
    const jp = jobbpassStatus.get(p.project_id)
    inputs.set(p.project_id, {
      todayIso,
      stageId: p.current_workflow_stage_id,
      status: p.status,
      startDate: p.start_date,
      endDate: p.end_date,
      completedAt: p.completed_at,
      name: p.name,
      description: p.description,
      jobType: p.job_type,
      bookingCount: live.filter(b => b.project_id === p.project_id).length,
      upcomingBookingCount: upcoming.get(p.project_id) || 0,
      materialCount: materialCount.get(p.project_id) || 0,
      milestoneCount: milestoneCount.get(p.project_id) || 0,
      checklistCount: checklistCount.get(p.project_id) || 0,
      lastTimeEntryDate: lastTime.get(p.project_id) || null,
      hasRot: p.quote_id ? (quoteRot.get(p.quote_id) || false) : false,
      customerPropertyDesignation: cust?.property_designation ?? null,
      customerPersonalNumber: cust?.personal_number ?? null,
      serialPendingInstallations: serialPending.get(p.project_id) || [],
      jobbpassStatus: jp === 'published' ? 'published' : jp ? 'draft' : 'none',
      jobbpassNotified: p.customer_id ? notified.has(p.customer_id) : false,
      openTaskTitles: openTitles.get(p.project_id) || [],
      dismissedKeys: dismissed.get(p.project_id) || [],
    })
    if (!bookingToday.has(p.project_id)) bookingToday.set(p.project_id, null)
  }
  return { inputs, bookingToday }
}
