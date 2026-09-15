import { svDayRange, svNaiveToIso, svDateStr } from '@/lib/dates'

export interface PlanningBatch {
  request_id: string; business_user_ids: string[]; dates: string[]; project_id: string | null;
  title: string; description: string | null; type: 'project' | 'internal' | 'travel';
  all_day: boolean; start_time: string; end_time: string; color: string | null;
}
export function validPlanningDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10) === v
}
export function parsePlanningBatch(b: any): PlanningBatch {
  const fail = () => { throw new Error('Kontrollera titel, personer, datum och tider.') }
  if (!b || typeof b.request_id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(b.request_id)) fail()
  if (!Array.isArray(b.business_user_ids) || !b.business_user_ids.length || b.business_user_ids.length > 30 || b.business_user_ids.some((v: any) => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(v))) fail()
  if (!Array.isArray(b.dates) || !b.dates.length || b.dates.length > 31 || !b.dates.every(validPlanningDate)) fail()
  const users = Array.from(new Set<string>(b.business_user_ids)).sort(), dates = Array.from(new Set<string>(b.dates)).sort()
  if (users.length * dates.length > 100) fail()
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 300 || !['project','internal','travel'].includes(b.type) || typeof b.all_day !== 'boolean') fail()
  if (!b.all_day && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start_time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end_time) || b.end_time <= b.start_time)) fail()
  if (b.project_id != null && (typeof b.project_id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(b.project_id))) fail()
  if (b.description != null && (typeof b.description !== 'string' || b.description.length > 5000)) fail()
  if (b.color != null && !/^#[0-9a-fA-F]{6}$/.test(b.color)) fail()
  return { request_id:b.request_id, business_user_ids:users, dates, project_id:b.project_id || null, title:b.title.trim(), description:b.description || null, type:b.type, all_day:b.all_day, start_time:b.start_time || '08:00', end_time:b.end_time || '16:00', color:b.color || null }
}
export function planningSlots(b: PlanningBatch) {
  return b.dates.flatMap(date => b.business_user_ids.map(business_user_id => ({business_user_id,
    start_datetime:b.all_day ? svDayRange(date,date).from : svNaiveToIso(`${date}T${b.start_time}:00`),
    end_datetime:b.all_day ? svDayRange(date,date).toExclusive : svNaiveToIso(`${date}T${b.end_time}:00`)
  })))
}
export function intervalsOverlap(a: string,b: string,c: string,d: string) { return Date.parse(a)<Date.parse(d) && Date.parse(b)>Date.parse(c) }
export function entryOnPlanningDate(e: any,date: string) {
  const r=svDayRange(date,date)
  return e.status !== 'cancelled' && intervalsOverlap(e.start_datetime,e.end_datetime,r.from,r.toExclusive)
}
export function plannedTeamHours(entries: any[]) {
  const seen=new Set<string>(); let hours=0
  for (const e of entries) {
    if(seen.has(e.id) || e.status==='cancelled') continue
    seen.add(e.id)
    const start=Date.parse(e.start_datetime), end=Date.parse(e.end_datetime)
    if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start) continue
    hours += e.all_day ? (Math.round((Date.parse(svDateStr(new Date(end-1))) - Date.parse(svDateStr(new Date(start))))/86400000)+1)*8 : (end-start)/3600000
  }
  return Math.round(hours*100)/100
}
export function planningBudget(budget: number|null, minutes: number) {
  const actual_hours=Math.round(minutes/60*100)/100
  return {budget_hours:budget, actual_hours, remaining_hours:budget==null ? null : Math.round((budget-actual_hours)*100)/100}
}
