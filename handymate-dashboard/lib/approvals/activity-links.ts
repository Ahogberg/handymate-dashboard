import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessUser } from '@/lib/permissions'
import { canActOnApproval } from './routing'

export async function activityLinks(db: SupabaseClient, user: BusinessUser, artifacts: unknown) {
  if (!artifacts || typeof artifacts !== 'object') return []
  const id = (artifacts as Record<string, unknown>).project_id
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return []
  const { data, error } = await db.from('project').select('project_id').eq('business_id', user.business_id).eq('project_id', id).maybeSingle()
  if (error || !data || data.project_id !== id) return []
  if (!await canActOnApproval(db, user, { business_id: user.business_id, approval_type: 'checklist_forslag', routing_role: 'project_team', payload: { project_id: id } })) return []
  return [{ label: 'Öppna projektet', path: `/projects/${id}` }]
}
