import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessUser } from '@/lib/permissions'
import { loadWorkReportContext, WorkReportError } from '@/lib/matte/work-report'
export interface DaySummary {
  projectId: string; projectName: string; date: string; checkedAt: string
  ownMinutes: number; ownEntryCount: number; ownNotes: Array<{ id: string; text: string }>
  activeTimer: boolean; scope: string
}
/** Reuses exactly the report write path's membership/assignment/time guards. */
export async function loadDaySummary(db: SupabaseClient, businessId: string, user: BusinessUser | null, projectId: unknown, date: unknown): Promise<DaySummary> {
  const ctx = await loadWorkReportContext(db, businessId, user, projectId, date)
  const { data, error } = await db.from('project_log').select('id,work_performed')
    .eq('business_id', businessId).eq('order_id', ctx.projectId).eq('business_user_id', ctx.userId)
    .eq('date', ctx.date).order('created_at').limit(101)
  if (error || !Array.isArray(data) || data.length > 100) throw new WorkReportError(503, 'Dina arbetsanteckningar kunde inte kontrolleras. Försök igen.')
  if (ctx.entries.some(e => e.duration_minutes != null && (!Number.isFinite(Number(e.duration_minutes)) || Number(e.duration_minutes) < 0))) throw new WorkReportError(503, 'Dina tidsuppgifter kunde inte kontrolleras.')
  return {
    projectId: ctx.projectId, projectName: ctx.projectName, date: ctx.date, checkedAt: new Date().toISOString(),
    ownMinutes: ctx.entries.reduce((sum, e) => sum + Number(e.duration_minutes || 0), 0), ownEntryCount: ctx.entries.length,
    ownNotes: data.map(row => ({ id: row.id, text: row.work_performed || 'Arbetsanteckning utan arbetsbeskrivning' })), activeTimer: ctx.activeTimer,
    scope: 'Din sparade tid och dina arbetsanteckningar för detta jobb och datum. Material, ÄTA, kunduppföljning och andra jobb ingår inte i den här kontrollen.',
  }
}
