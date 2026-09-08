import type { SupabaseClient } from '@supabase/supabase-js'
import { createDiaryEntry } from '@/lib/diary/write'
export interface ReviewedDiaryNote { id: string; project_id: string; date: string; summary: string }
export async function executeDiaryNote(db: SupabaseClient, businessId: string, userId: string | null, plan?: ReviewedDiaryNote) {
  const fail = (error: string) => ({ action: 'project_log_note', ok: false, error })
  if (!plan?.id || !plan.project_id || !plan.date || !plan.summary) return fail('Granskat dagboksunderlag saknas.')
  const find = () => db.from('project_log').select('id, order_id, date, description, work_performed').eq('business_id', businessId).eq('id', plan.id).maybeSingle()
  const matches = (row: any) => row && row.order_id === plan.project_id && row.date === plan.date && row.description === plan.summary && row.work_performed === 'Samtal med kund'
  const before = await find()
  if (before.error) return fail('Den befintliga dagboksanteckningen kunde inte verifieras.')
  if (before.data) return matches(before.data) ? { action: 'project_log_note', ok: true, log_id: plan.id, project_id: plan.project_id, duplicate: true } : fail('En annan anteckning finns redan för samtalet. Kontrollera dagboken.')
  let failure: string | undefined
  try {
    const result = await createDiaryEntry(db, { id: plan.id, business_id: businessId, order_id: plan.project_id, business_user_id: userId, date: plan.date, description: plan.summary, work_performed: 'Samtal med kund', photos: [], skipDuplicateCheck: true })
    if (!result.ok) failure = result.error
  } catch { failure = 'Skrivsvaret kunde inte läsas.' }
  const after = await find()
  if (after.error || !matches(after.data)) return fail(failure || 'Den granskade anteckningen kunde inte verifieras som sparad.')
  return { action: 'project_log_note', ok: true, log_id: plan.id, project_id: plan.project_id }
}
