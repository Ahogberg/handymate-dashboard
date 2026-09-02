import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness } from '../auth'
import { getCurrentUser, hasPermission, isOwnerOrAdmin, type BusinessUser } from '../permissions'
import { getServerSupabase } from '../supabase'
import { canAttestDiary, canCreateDiaryEntry, loadAssignment } from './permissions'

/**
 * Gemensam ingång för alla dagboksrutter (Etapp D4, 2026-09-02):
 * företag → anställd → projektet tillhör företaget → tilldelning.
 *
 * Returnerar antingen allt en rutt behöver för att fatta behörighetsbeslut,
 * eller det NextResponse som ska skickas tillbaka (401/404/500). Rutten
 * behöver då bara skriva `if (!ctx.ok) return ctx.response`.
 */
export interface DiaryRouteContext {
  ok: true
  supabase: SupabaseClient
  businessId: string
  user: BusinessUser
  projectId: string
  projectName: string | null
  /** true för ägare/admin/see_all_projects, annars om anställd är tilldelad. */
  assignment: boolean
  canCreate: boolean
  canAttest: boolean
  isOwnerOrAdmin: boolean
}

export async function loadDiaryContext(
  request: NextRequest,
  projectId: string,
): Promise<DiaryRouteContext | { ok: false; response: NextResponse }> {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const user = await getCurrentUser(request, business.business_id)
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = getServerSupabase()
  const { data: project, error } = await supabase
    .from('project')
    .select('project_id, name')
    .eq('business_id', business.business_id)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) {
    return { ok: false, response: NextResponse.json({ error: `Kunde inte läsa projektet: ${error.message}` }, { status: 500 }) }
  }
  if (!project) {
    return { ok: false, response: NextResponse.json({ error: 'Projektet finns inte' }, { status: 404 }) }
  }

  const seesAll = isOwnerOrAdmin(user) || hasPermission(user, 'see_all_projects')
  const assignment = seesAll ? true : await loadAssignment(supabase, business.business_id, projectId, user.id)

  return {
    ok: true,
    supabase,
    businessId: business.business_id,
    user,
    projectId,
    projectName: (project as { name?: string | null }).name ?? null,
    assignment,
    canCreate: canCreateDiaryEntry(user, assignment),
    canAttest: canAttestDiary(user),
    isOwnerOrAdmin: isOwnerOrAdmin(user),
  }
}
