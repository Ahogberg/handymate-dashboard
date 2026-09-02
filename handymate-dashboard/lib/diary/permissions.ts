import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPermission, isOwnerOrAdmin, type BusinessUser } from '../permissions'

/**
 * Vem får göra vad i byggdagboken (Etapp D3, 2026-09-02).
 *
 * Samma modell som Matte-rapportläget (lib/matte/work-report.ts:44-47):
 * ägare/admin och den med `see_all_projects` kommer åt allt, en vanlig
 * anställd bara projekt hen är TILLDELAD — och där bara SIN EGEN rad
 * (business_user_id), aldrig kollegans.
 */

export interface DiaryRowLike {
  business_user_id?: string | null
}

/**
 * Är `userId` tilldelad `projectId`? Service-role-läsning — samma mönster
 * som loadWorkReportContext: kollas BARA om användaren saknar
 * `see_all_projects`, annars är frågan onödig.
 */
export async function loadAssignment(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('project_assignment')
    .select('id')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .eq('business_user_id', userId)
    .limit(1)
  if (error) return false
  return Array.isArray(data) && data.length > 0
}

/** Får skapa en ny dagboksrad på projektet. */
export function canCreateDiaryEntry(user: BusinessUser, assignment: boolean): boolean {
  if (isOwnerOrAdmin(user)) return true
  if (hasPermission(user, 'see_all_projects')) return true
  return assignment
}

/**
 * Får redigera/attestera/tillägga EN specifik rad. Skiljer sig från skapande
 * genom ägarskapskravet: en tilldelad anställd får bara röra SIN EGEN rad
 * (business_user_id), aldrig en kollegas — annars kunde vem som helst på
 * projektet skriva om varandras loggade timmar.
 */
export function canEditDiaryRow(
  user: BusinessUser,
  row: DiaryRowLike,
  assignment: boolean,
): boolean {
  if (isOwnerOrAdmin(user)) return true
  if (hasPermission(user, 'see_all_projects')) return true
  return assignment && row.business_user_id === user.id
}

/** Får attestera (låsa) andras dagboksrader. */
export function canAttestDiary(user: BusinessUser): boolean {
  if (isOwnerOrAdmin(user)) return true
  return hasPermission(user, 'approve_time')
}
