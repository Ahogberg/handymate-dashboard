/**
 * Uppgifters synlighet och ändringsrätt — en sanning för GET/PUT/DELETE
 * i /api/tasks (2026-08-28).
 *
 * Regel (Andreas): ägare och admin ser allt. En anställd ser bara sina egna
 * (tilldelade eller skapade) — UTOM i projekt där hen är projektledare
 * (project_assignment.role = 'lead'): där ser hen projektets alla uppgifter.
 * Samma regel styr vem som får ändra/ta bort: tidigare räckte ett id.
 *
 * Tilldelning till andra är tillåten för alla — en uppgift är en begäran;
 * skaparen ser den ändå (created_by) och mottagaren ser den (assigned_to).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TaskScope {
  /** 'all' = ägare/admin · 'own' = anställd (egna + projekt hen leder) */
  mode: 'all' | 'own'
  /** business_users.id — det task.assigned_to pekar på */
  memberId: string | null
  /** auth user_id — det task.created_by pekar på */
  userId: string | null
  /** projekt där användaren är projektledare */
  leadProjectIds: string[]
}

export interface TaskLike {
  assigned_to?: string | null
  created_by?: string | null
  project_id?: string | null
  visibility?: string | null
}

/** Ren: får scopet se uppgiften? */
export function canSeeTask(task: TaskLike, scope: TaskScope): boolean {
  const mine = (scope.memberId != null && task.assigned_to === scope.memberId)
    || (scope.userId != null && task.created_by === scope.userId)
  // Privata uppgifter ser bara skaparen/den tilldelade — även för ägaren.
  if (task.visibility === 'private') return mine
  if (scope.mode === 'all') return true
  if (mine) return true
  return task.project_id != null && scope.leadProjectIds.includes(task.project_id)
}

/** Ren: får scopet ändra/ta bort uppgiften? Samma gräns som synligheten. */
export function canEditTask(task: TaskLike, scope: TaskScope): boolean {
  return canSeeTask(task, scope)
}

/**
 * Bygger PostgREST-filtret för listning. null = inget filter (ser allt).
 * Privat-filtret läggs alltid efteråt i minnet (canSeeTask).
 */
export function taskListOrFilter(scope: TaskScope): string | null {
  if (scope.mode === 'all') return null
  const ors: string[] = []
  if (scope.memberId) ors.push(`assigned_to.eq.${scope.memberId}`)
  if (scope.userId) ors.push(`created_by.eq.${scope.userId}`)
  if (scope.leadProjectIds.length > 0) ors.push(`project_id.in.(${scope.leadProjectIds.join(',')})`)
  // Ingen identitet alls ⇒ ett filter som aldrig matchar, aldrig "allt".
  return ors.length > 0 ? ors.join(',') : 'id.eq.__ingen__'
}

export async function resolveTaskScope(
  supabase: SupabaseClient,
  businessId: string,
  currentUser: { id: string; role: 'owner' | 'admin' | 'employee' } | null,
  userId: string | null,
): Promise<TaskScope> {
  const memberId = currentUser?.id ?? null
  if (!currentUser || currentUser.role === 'owner' || currentUser.role === 'admin') {
    return { mode: currentUser ? 'all' : 'own', memberId, userId, leadProjectIds: [] }
  }
  let leadProjectIds: string[] = []
  if (memberId) {
    const { data, error } = await supabase
      .from('project_assignment')
      .select('project_id')
      .eq('business_user_id', memberId)
      .eq('role', 'lead')
    if (error) console.warn('[tasks/visibility] project_assignment-läsning misslyckades (behandlas som ingen ledarroll):', error.message)
    leadProjectIds = (data || []).map(r => r.project_id as string)
  }
  return { mode: 'own', memberId, userId, leadProjectIds }
}
