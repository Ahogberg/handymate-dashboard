import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { approvalArtifactId, insertApprovalArtifact } from './artifact-write'

export async function prepareAutomationFollowupReview(db: SupabaseClient, businessId: string,
  approval: { id: string; created_at?: string; payload?: any }) {
  const previous = await db.from('inbox_item').select('*')
    .eq('inbox_item_id', approvalArtifactId(businessId, approval.id, 'automation:followup')).eq('business_id', businessId).maybeSingle()
  if (previous.error) throw new Error('Tidigare uppföljning kunde inte kontrolleras.')
  if (previous.data) {
    const executionPayload = { actionType: 'schedule_followup', customerId: previous.data.customer_id, summary: previous.data.summary }
    const review: ApprovalReview = { title: 'Återställ kvittens för uppföljning',
      effect: 'Uppföljningen finns redan i inkorgen. Återställer kvittensen utan att skapa eller ändra någon post.',
      confirmLabel: 'Återställ kvittensen', messages: [], details: [{ label: 'Sparad text', text: previous.data.summary }] }
    return { review, snapshot: { existing: previous.data }, executionPayload, executionEvidence: executionPayload }
  }
  const p = approval.payload || {}, config = p.rule_action_config || {}
  const days = config.days_until ?? 1
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new Error('Antal dagar måste vara ett heltal mellan 0 och 3650.')
  const anchor = new Date(approval.created_at || '')
  if (!Number.isFinite(anchor.getTime())) throw new Error('Kortets datum saknas. Uppföljningsdatum kan inte verifieras.')
  anchor.setUTCDate(anchor.getUTCDate() + days)
  const due = anchor.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
  let customer = null
  if (p.customer_id) {
    const result = await db.from('customer').select('customer_id, name').eq('customer_id', p.customer_id).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Kunden kunde inte verifieras i företaget.')
    customer = result.data
  }
  const template = config.description ?? 'Uppföljning schemalagd'
  if (typeof template !== 'string' || !template.trim()) throw new Error('Uppföljningens text saknas.')
  const context = { ...p, customer_name: customer?.name || p.customer_name }
  const description = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match: string, key: string) =>
    typeof context[key] === 'string' || typeof context[key] === 'number' ? String(context[key]) : match)
  if (/\{\{[^{}]+\}\}/.test(description)) throw new Error('Uppföljningen har olösta platshållare.')
  const executionPayload = { actionType: 'schedule_followup', customerId: customer?.customer_id || null,
    summary: `${description} (senast ${due})`, dueDate: due }
  const review: ApprovalReview = { title: 'Granska intern uppföljning',
    effect: 'Skapar en intern post i inkorgen med det visade datumet i texten. Ingen tidsstyrd påminnelse, kalenderbokning eller kundsändning skapas.',
    confirmLabel: 'Spara uppföljningen i inkorgen', messages: [], details: [
      { label: 'Kund', text: customer?.name || 'Ingen kundkoppling' },
      { label: 'Text', text: executionPayload.summary },
      { label: 'Datum beräknat från', text: 'Kortets skapandedatum, svensk tid' },
      { label: 'Ansvar', text: 'Företagets gemensamma inkorg; ingen person tilldelas' },
    ] }
  return { review, snapshot: { customer, executionPayload }, executionPayload, executionEvidence: executionPayload }
}

export async function executeAutomationFollowup(db: SupabaseClient, businessId: string, approvalId: string, reviewed: any) {
  if (reviewed?.actionType !== 'schedule_followup' || typeof reviewed.summary !== 'string' || !reviewed.summary.trim())
    return { action: 'automation', action_type: 'schedule_followup', ok: false, error: 'Det granskade uppföljningsunderlaget saknas.' }
  const saved = await insertApprovalArtifact(db, 'inbox_item', 'inbox_item_id', businessId, approvalId, 'automation:followup', {
    channel: 'followup', customer_id: reviewed.customerId, summary: reviewed.summary, status: 'new',
    related_id: approvalId, created_at: new Date().toISOString(),
  })
  return { action: 'automation', action_type: 'schedule_followup', ok: !saved.error && !!saved.data,
    inbox_item_id: saved.data?.inbox_item_id, summary: saved.data?.summary,
    error: saved.error?.message || (!saved.data ? 'Uppföljningen kunde inte verifieras.' : undefined) }
}
