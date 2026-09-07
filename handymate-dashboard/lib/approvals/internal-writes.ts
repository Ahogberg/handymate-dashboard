import type { SupabaseClient } from '@supabase/supabase-js'

/** Deliberately ordered, idempotent attestation. The time row is keyed by
 * checkin, so retrying after the second write fails cannot duplicate wages.
 */
export async function attestApprovalTime(db: SupabaseClient, businessId: string, actorId: string | null, p: Record<string, any>) {
  const fail = (error: string, partial = false) => ({ action: 'time_attestation', ok: false, error, partial })
  const minutes = p.duration_minutes
  if (!p.checkin_id || !p.user_id || !Number.isFinite(minutes) || minutes <= 0) return fail('Incheckning, medarbetare och positiv tidsåtgång krävs.')
  const checkin = await db.from('time_checkins').select('*').eq('id', p.checkin_id).eq('business_id', businessId).maybeSingle()
  if (checkin.error || !checkin.data || checkin.data.user_id !== p.user_id) return fail('Incheckningen kunde inte verifieras för medarbetaren i ditt företag.')
  const user = await db.from('business_users').select('id').eq('user_id', p.user_id).eq('business_id', businessId).maybeSingle()
  if (user.error || !user.data) return fail('Medarbetaren hittades inte i ditt företag.')
  if (p.project_id) {
    const project = await db.from('project').select('project_id').eq('project_id', p.project_id).eq('business_id', businessId).maybeSingle()
    if (project.error || !project.data) return fail('Projektet kunde inte verifieras.')
  }
  const workDate = String(p.checked_in_at || checkin.data.checked_in_at || '').split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !Number.isFinite(Date.parse(workDate)) || new Date(workDate).toISOString().slice(0, 10) !== workDate) return fail('Ett giltigt arbetsdatum krävs.')
  const entryId = `te_checkin_${p.checkin_id}`
  const existing = await db.from('time_entry').select('time_entry_id, duration_minutes, business_user_id, project_id').eq('time_entry_id', entryId).eq('business_id', businessId).maybeSingle()
  if (existing.error) return fail('Tidigare registrering kunde inte kontrolleras.')
  if (existing.data && (existing.data.duration_minutes !== minutes || existing.data.business_user_id !== user.data.id || existing.data.project_id !== (p.project_id || null))) return fail('Tidraden har ändrats. Granska den registrerade tiden innan du försöker igen.')
  if (!existing.data) {
    if (checkin.data.status === 'approved') return fail('Incheckningen är redan attesterad. Öppna den befintliga tidrapporten.')
    const entry = await db.from('time_entry').insert({
      time_entry_id: entryId, business_id: businessId, business_user_id: user.data.id,
      project_id: p.project_id || null, duration_minutes: minutes,
      work_date: workDate,
      description: `Incheckning${p.project_name ? ` · ${p.project_name}` : ''}`,
      is_billable: true, approval_status: 'approved', approved_by: actorId,
      approved_at: new Date().toISOString(),
    })
    if (entry.error) return fail('Tidraden kunde inte skapas. Ingen ny attestering har gjorts.')
  }
  const marked = await db.from('time_checkins').update({ status: 'approved', approved_by: actorId,
    approved_at: new Date().toISOString(), duration_minutes: minutes,
  }).eq('id', p.checkin_id).eq('business_id', businessId).eq('user_id', p.user_id).select('id')
  if (marked.error || marked.data?.length !== 1) return fail('Tidraden är registrerad, men incheckningen kunde inte markeras som attesterad. Ett återförsök använder samma tidrad.', true)
  return { action: 'time_attestation', ok: true, time_entry_id: entryId, minutes }
}

export async function assignApprovalWork(db: SupabaseClient, businessId: string, p: Record<string, any>) {
  const type = p.context_type
  if (!['booking', 'work_order'].includes(type) || !p.context_id || !p.member_id) return { action: 'dispatch_suggestion', ok: false, error: 'Uppdrag eller medarbetare saknas.' }
  const member = await db.from('business_users').select('id, name').eq('id', p.member_id).eq('business_id', businessId).maybeSingle()
  if (member.error || !member.data) return { action: 'dispatch_suggestion', ok: false, error: 'Medarbetaren kunde inte verifieras.' }
  const name = member.data.name
  const update = await db.from(type === 'booking' ? 'booking' : 'work_orders').update({
    assigned_to: name, ...(type === 'booking' ? { assigned_user_id: member.data.id } : {}),
    dispatch_reasoning: { reasons: p.reasons, score: p.score, alternatives: p.alternatives, week_utilization_pct: p.week_utilization_pct, certificates: p.certificates },
  }).eq(type === 'booking' ? 'booking_id' : 'id', p.context_id).eq('business_id', businessId).select(type === 'booking' ? 'booking_id' : 'id')
  if (update.error || update.data?.length !== 1) return { action: 'dispatch_suggestion', ok: false, error: 'Tilldelningen kunde inte sparas i ditt företag.' }
  return { action: 'dispatch_suggestion', ok: true, assigned: name, context_type: type }
}
