import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'

const targets: Record<string, { table: string; key: string; column: string; label: string }> = {
  lead: { table: 'leads', key: 'lead_id', column: 'status', label: 'Lead' },
  customer: { table: 'customer', key: 'customer_id', column: 'job_status', label: 'Kund' },
  booking: { table: 'booking', key: 'booking_id', column: 'status', label: 'Bokning' },
  quote: { table: 'quotes', key: 'quote_id', column: 'status', label: 'Offert' },
  invoice: { table: 'invoice', key: 'invoice_id', column: 'status', label: 'Faktura' },
}

export async function prepareAutomationStatusReview(db: SupabaseClient, businessId: string, payload: Record<string, any>) {
  const config = payload.rule_action_config || {}
  if (config.stage_key) throw new Error('Pipelinebytet behöver granskning av regel- och projektföljder innan det kan utföras.')
  const entity = config.entity || payload.entity, id = payload.entity_id || config.entity_id
  const target = targets[entity], next = config.new_status
  if (!target || typeof id !== 'string' || !id || typeof next !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(next))
    throw new Error('Statusändringen saknar en giltig entitet, identitet eller status.')
  const { data: row, error } = await db.from(target.table).select('*').eq(target.key, id).eq('business_id', businessId).maybeSingle()
  if (error || !row) throw new Error(`${target.label} kunde inte verifieras i företaget.`)
  const current = row[target.column] ?? null
  const executionPayload = { actionType: 'update_status', entity, id, previous: current, next, updatedAt: row.updated_at ?? null }
  const unchanged = current === next
  const review: ApprovalReview = { title: `Granska status — ${target.label.toLowerCase()}`,
    effect: unchanged ? 'Statusen har redan det önskade värdet. Kontrollerar och kvitterar detta utan en ny ändring.'
      : 'Ändrar enbart det visade statusfältet. Skickar inget meddelande eller dokument, registrerar ingen betalning och startar inga kalender-, pipeline- eller projektregler.',
    confirmLabel: unchanged ? 'Bekräfta befintlig status' : 'Ändra statusfältet', messages: [], details: [
      { label: target.label, text: row.name || row.title || row.invoice_number || row.quote_number || id },
      { label: 'Identitet', text: id }, { label: 'Nuvarande status', text: current ?? 'Inte angiven' }, { label: 'Önskad status', text: next },
      { label: 'Begränsning', text: 'Statusvärdet är ingen kvittens på utskick, signering, genomfört arbete eller betalning.' },
    ] }
  return { review, snapshot: { row, executionPayload }, executionPayload, executionEvidence: executionPayload }
}

export async function executeAutomationStatus(db: SupabaseClient, businessId: string, reviewed: any) {
  const target = targets[reviewed?.entity]
  const base = { action: 'automation', action_type: 'update_status' }
  if (reviewed?.actionType !== 'update_status' || !target || typeof reviewed.id !== 'string' || typeof reviewed.next !== 'string')
    return { ...base, ok: false, error: 'Det granskade statusunderlaget saknas.' }
  const read = () => db.from(target.table).select('*').eq(target.key, reviewed.id).eq('business_id', businessId).maybeSingle()
  const before = await read()
  if (before.error || !before.data) return { ...base, ok: false, error: 'Entiteten kunde inte verifieras före statusändringen.' }
  const current = before.data[target.column] ?? null
  if (current === reviewed.next) return { ...base, ok: true, already_current: true, entity_id: reviewed.id, new_status: current }
  if (current !== reviewed.previous || (before.data.updated_at ?? null) !== reviewed.updatedAt)
    return { ...base, ok: false, error: 'Underlaget har ändrats. Öppna en ny granskning.' }
  let query = db.from(target.table).update({ [target.column]: reviewed.next,
    ...(reviewed.updatedAt != null ? { updated_at: new Date().toISOString() } : {}) })
    .eq(target.key, reviewed.id).eq('business_id', businessId)
  query = reviewed.previous == null ? query.is(target.column, null) : query.eq(target.column, reviewed.previous)
  // Some legacy entities have no updated_at column. Only compare it when present.
  if (reviewed.updatedAt != null) query = query.eq('updated_at', reviewed.updatedAt)
  let result
  try { result = await query.select(target.key) } catch { result = { data: null, error: { message: 'Svar saknas' } } }
  // Verify the persisted value even when the mutation response was lost.
  const after = await read()
  if (after.error || !after.data) return { ...base, ok: false, error: 'Statusutfallet kunde inte läsas. Öppna en ny granskning för att kontrollera det.' }
  if (after.data[target.column] !== reviewed.next) return { ...base, ok: false, error: result.error?.message || 'Ingen verifierad statusändring. Underlaget kan ha ändrats samtidigt.' }
  return { ...base, ok: true, entity_id: reviewed.id, new_status: after.data[target.column],
    verified_after_lost_response: !!result.error || !result.data?.length }
}
