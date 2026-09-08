import type { SupabaseClient } from '@supabase/supabase-js'

/** Deliberately ordered, idempotent attestation. The time row is keyed by
 * checkin, so retrying after the second write fails cannot duplicate wages.
 */
export async function attestApprovalTime(db: SupabaseClient, businessId: string, actorId: string | null, p: Record<string, any>) {
  const fail = (error: string, partial = false) => ({ action: 'time_attestation', ok: false, error, partial })
  const minutes = p.duration_minutes
  if (!p.checkin_id || !p.user_id || !Number.isSafeInteger(minutes) || minutes <= 0) return fail('Incheckning, medarbetare och positiv tidsåtgång krävs.')
  const checkin = await db.from('time_checkins').select('*').eq('id', p.checkin_id).eq('business_id', businessId).maybeSingle()
  if (checkin.error || !checkin.data || checkin.data.user_id !== p.user_id) return fail('Incheckningen kunde inte verifieras för medarbetaren i ditt företag.')
  if ((checkin.data.project_id || null) !== (p.project_id || null)) return fail('Projektet har ändrats sedan tidsförslaget skapades.')
  const user = await db.from('business_users').select('id').eq('user_id', p.user_id).eq('business_id', businessId).maybeSingle()
  if (user.error || !user.data) return fail('Medarbetaren hittades inte i ditt företag.')
  if (p.project_id) {
    const project = await db.from('project').select('project_id').eq('project_id', p.project_id).eq('business_id', businessId).maybeSingle()
    if (project.error || !project.data) return fail('Projektet kunde inte verifieras.')
  }
  const workDate = String(p.checked_in_at || checkin.data.checked_in_at || '').split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !Number.isFinite(Date.parse(workDate)) || new Date(workDate).toISOString().slice(0, 10) !== workDate) return fail('Ett giltigt arbetsdatum krävs.')
  const entryId = `te_checkin_${p.checkin_id}`
  const existing = await db.from('time_entry').select('time_entry_id, duration_minutes, business_user_id, project_id, work_date, is_billable, approval_status').eq('time_entry_id', entryId).eq('business_id', businessId).maybeSingle()
  if (existing.error) return fail('Tidigare registrering kunde inte kontrolleras.')
  if (existing.data && (existing.data.work_date !== workDate || existing.data.is_billable !== true || existing.data.approval_status !== 'approved' || existing.data.duration_minutes !== minutes || existing.data.business_user_id !== user.data.id || existing.data.project_id !== (p.project_id || null))) return fail('Tidraden har ändrats. Granska den registrerade tiden innan du försöker igen.')
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
    const saved = await db.from('time_entry').select('*').eq('time_entry_id', entryId).eq('business_id', businessId).maybeSingle()
    if (saved.error || !saved.data || saved.data.duration_minutes !== minutes || saved.data.work_date !== workDate ||
      saved.data.business_user_id !== user.data.id || saved.data.project_id !== (p.project_id || null) ||
      saved.data.is_billable !== true || saved.data.approval_status !== 'approved') return fail('Tidraden kunde inte verifieras. Ett återförsök kontrollerar samma tidrad.')
  }
  if (checkin.data.status === 'approved' && checkin.data.duration_minutes === minutes) return { action: 'time_attestation', ok: true, time_entry_id: entryId, minutes }
  const marked = await db.from('time_checkins').update({ status: 'approved', approved_by: actorId,
    approved_at: new Date().toISOString(), duration_minutes: minutes,
  }).eq('id', p.checkin_id).eq('business_id', businessId).eq('user_id', p.user_id).select('id')
  const confirmed = await db.from('time_checkins').select('status, duration_minutes').eq('id', p.checkin_id).eq('business_id', businessId).eq('user_id', p.user_id).maybeSingle()
  if (confirmed.error || confirmed.data?.status !== 'approved' || confirmed.data?.duration_minutes !== minutes) return fail('Tidraden är registrerad, men incheckningen kunde inte markeras som attesterad. Ett återförsök använder samma tidrad.', true)
  return { action: 'time_attestation', ok: true, time_entry_id: entryId, minutes }
}

export async function assignApprovalWork(db: SupabaseClient, businessId: string, p: Record<string, any>) {
  const type = p.context_type
  if (!['booking', 'work_order'].includes(type) || !p.context_id || !p.member_id) return { action: 'dispatch_suggestion', ok: false, error: 'Uppdrag eller medarbetare saknas.' }
  const member = await db.from('business_users').select('id, name').eq('id', p.member_id).eq('business_id', businessId).maybeSingle()
  if (member.error || !member.data) return { action: 'dispatch_suggestion', ok: false, error: 'Medarbetaren kunde inte verifieras.' }
  const name = member.data.name
  if (typeof name !== 'string' || !name.trim()) return { action: 'dispatch_suggestion', ok: false, error: 'Medarbetaren saknar namn. Uppdatera medarbetaren före tilldelning.' }
  const plan = p.dispatchPlan
  const fields = type === 'booking' ? ['assigned_to', 'assigned_user_id'] : ['assigned_to']
  if (!plan || plan.type !== type || plan.id !== p.context_id || plan.memberId !== p.member_id ||
    !plan.before || !plan.after || plan.after.assigned_to !== name ||
    (type === 'booking' && plan.after.assigned_user_id !== member.data.id) ||
    fields.some(key => !(key in plan.before))) return { action: 'dispatch_suggestion', ok: false, error: 'Granskat tilldelningsunderlag saknas.' }
  const table = type === 'booking' ? 'booking' : 'work_orders'
  const key = type === 'booking' ? 'booking_id' : 'id'
  const find = () => db.from(table).select('*').eq(key, p.context_id).eq('business_id', businessId).maybeSingle()
  const matches = (row: any, values: any) => !!row && fields.every(field => (row[field] ?? null) === values[field])
  const current = await find()
  if (current.error || !current.data) return { action: 'dispatch_suggestion', ok: false, error: 'Uppdraget kunde inte verifieras.' }
  const success = () => ({ action: 'dispatch_suggestion', ok: true, assigned: name, context_type: type, context_id: p.context_id })
  if (matches(current.data, plan.after)) return success()
  if (!matches(current.data, plan.before)) return { action: 'dispatch_suggestion', ok: false, error: 'Uppdraget har fått en annan tilldelning. Ingen ändring har gjorts.' }
  let query = db.from(table).update({
    assigned_to: name, ...(type === 'booking' ? { assigned_user_id: member.data.id } : {}),
    dispatch_reasoning: { reasons: p.reasons, score: p.score, alternatives: p.alternatives, week_utilization_pct: p.week_utilization_pct, certificates: p.certificates },
  }).eq(key, p.context_id).eq('business_id', businessId)
  for (const field of fields) query = plan.before[field] === null ? query.is(field, null) : query.eq(field, plan.before[field])
  await query.select(key)
  const saved = await find()
  if (saved.error || !matches(saved.data, plan.after)) return { action: 'dispatch_suggestion', ok: false, error: 'Tilldelningen kunde inte verifieras. Ett återförsök kontrollerar samma underlag.' }
  return success()
}
