import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessUser } from '@/lib/permissions'
import { canActOnApproval } from './routing'

export async function activityLinks(db: SupabaseClient, user: BusinessUser, artifacts: unknown) {
  if (!artifacts || typeof artifacts !== 'object') return []
  const links: { label: string; path: string }[] = []
  const bookingId = (artifacts as Record<string, unknown>).booking_id
  if (typeof bookingId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(bookingId)) {
    const { data: booking, error } = await db.from('booking').select('booking_id, assigned_user_id, project_id').eq('business_id', user.business_id).eq('booking_id', bookingId).maybeSingle()
    if (!error && booking?.booking_id === bookingId) {
      const permitted = ['owner', 'admin'].includes(user.role) || booking.assigned_user_id === user.id || (booking.project_id && await canActOnApproval(db, user, { business_id: user.business_id, approval_type: 'checklist_forslag', routing_role: 'project_team', payload: { project_id: booking.project_id } }))
      if (permitted) links.push({ label: 'Öppna bokningen', path: `/booking/${bookingId}` })
    }
  }
  const id = (artifacts as Record<string, unknown>).project_id
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return links
  const { data, error } = await db.from('project').select('project_id').eq('business_id', user.business_id).eq('project_id', id).maybeSingle()
  if (error || !data || data.project_id !== id) return links
  if (!await canActOnApproval(db, user, { business_id: user.business_id, approval_type: 'checklist_forslag', routing_role: 'project_team', payload: { project_id: id } })) return links
  return [...links, { label: 'Öppna projektet', path: `/projects/${id}` }]
}
