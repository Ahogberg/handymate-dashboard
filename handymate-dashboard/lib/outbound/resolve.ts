import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClaimedOutbound } from './intents'
import { readOutboundSource, type EmailEnvelope, type PushEnvelope, type SmsEnvelope } from './source'
import type { OutboundResolver } from './sweep'

export function aggregateAutonomyOutcome(rows: Array<{ id: string; status: string; context?: Record<string, unknown> | null }>,
  intentId: string, auditId: string, result: import('./promise').ProviderOutcome): 'success' | 'failed' | 'skipped' | null {
  const statuses = rows.filter(row => row.context?.auditId === auditId)
    .map(row => row.id === intentId ? result.status : row.status)
  if (statuses.includes('sent')) return 'success'
  if (statuses.some(status => ['pending', 'attempting', 'unknown'].includes(status))) return null
  if (!statuses.length) return null
  return statuses.includes('failed') ? 'failed' : 'skipped'
}

async function autonomyReceipt(db: SupabaseClient, businessId: string, intent: ClaimedOutbound,
  result: import('./promise').ProviderOutcome) {
  const auditId = intent.context?.auditId
  if (!auditId || intent.kind === 'push') return
  const siblings = await db.from('outbound_intents').select('id,status,context')
    .eq('business_id', businessId).eq('source', intent.source).eq('source_id', intent.source_id)
  if (siblings.error) throw new Error('Autonomikvittensen kunde inte verifieras')
  const outcome = aggregateAutonomyOutcome(siblings.data || [], intent.id, auditId, result)
  // A multi-channel action remains unknown until one channel is known sent,
  // or every channel has a definitive terminal outcome.
  if (!outcome) return
  const receipt = await db.rpc('finish_autonomy_attempt', {
    p_business_id: businessId, p_id: auditId, p_outcome: outcome, p_log: false, p_channel: intent.kind,
  })
  if (receipt.error) throw new Error('Autonomikvittensen kunde inte sparas')
}

async function reconcile(db: SupabaseClient, envelope: SmsEnvelope | EmailEnvelope) {
  if (envelope.reconcile?.type !== 'invoice_reminder') return
  const { reconcileInvoiceReminder } = await import('@/lib/invoice-reminder-send')
  const result = await reconcileInvoiceReminder(db, envelope.reconcile.input as any)
  if (!result.reconciled) throw new Error(result.error || 'Påminnelsekvittensen kunde inte sparas')
}

export async function reviewedDocumentReceipt(db: SupabaseClient, businessId: string, envelope: EmailEnvelope,
  result: import('./promise').ProviderOutcome) {
  if (envelope.journal?.type !== 'reviewed_document' || !['sent','failed'].includes(result.status)) return
  const row = await db.from('generated_document').select('variables_data').eq('id', envelope.journal.documentId).eq('business_id', businessId).maybeSingle()
  const delivery = row.data?.variables_data?.delivery
  if (row.error || !delivery || delivery.version !== envelope.journal.version) throw new Error('Dokumentjournalen kunde inte verifieras')
  const variables = row.data!.variables_data
  if (delivery.state === 'accepted' && result.status === 'sent') return
  const state = result.status === 'sent' ? 'accepted' : 'rejected'
  const updated = await db.from('generated_document').update({
    variables_data: { ...variables, delivery: { ...delivery, state, messageId: result.providerRef || null, error: result.error || null } },
    ...(state === 'accepted' ? { status: 'completed' } : {}),
  }).eq('id', envelope.journal.documentId).eq('business_id', businessId).eq('variables_data', JSON.stringify(variables)).select('id')
  if (updated.error || updated.data?.length !== 1) throw new Error('Dokumentkvittensen kunde inte sparas')
}

/** Production source registry. It only resolves immutable, tenant-scoped
 * source rows and invokes provider adapters; it never replays a domain action. */
export const resolveOutboundSource: OutboundResolver = async (db: SupabaseClient, businessId: string, intent: ClaimedOutbound) => {
  if (intent.kind === 'sms') {
    const envelope = await readOutboundSource<SmsEnvelope>(db, businessId, intent)
    return async () => {
      const { sendPersistedSms, smsProviderOutcome } = await import('@/lib/sms-send')
      const result = smsProviderOutcome(await sendPersistedSms({
        supabase: db, businessId, to: intent.recipient, message: envelope.message,
        businessName: envelope.businessName, customerId: envelope.customerId,
        relatedId: envelope.relatedId, messageType: envelope.messageType, approvalId: envelope.approvalId,
        recipient: envelope.recipient, purpose: envelope.purpose,
      }))
      if (result.status === 'sent') await reconcile(db, envelope)
      await autonomyReceipt(db, businessId, intent, result)
      return result
    }
  }
  if (intent.kind === 'email') {
    const envelope = await readOutboundSource<EmailEnvelope>(db, businessId, intent)
    return async () => {
      const { sendPersistedEmail, emailProviderOutcome } = await import('@/lib/email')
      const attachments = [...(envelope.attachments || [])]
      for (const stored of envelope.storedAttachments || []) {
        const file = await db.storage.from(stored.bucket).download(stored.path)
        if (file.error || !file.data) throw new Error('Sparad bilaga kunde inte läsas')
        attachments.push({ filename: stored.filename, content: Buffer.from(await file.data.arrayBuffer()).toString('base64') })
      }
      const result = emailProviderOutcome(await sendPersistedEmail({ ...envelope, attachments, to: intent.recipient, businessId,
        idempotencyKey: intent.dedupe_key }))
      if (result.status === 'sent') await reconcile(db, envelope)
      await reviewedDocumentReceipt(db, businessId, envelope, result)
      await autonomyReceipt(db, businessId, intent, result)
      return result
    }
  }
  const envelope = await readOutboundSource<PushEnvelope>(db, businessId, intent)
  return async () => {
    const { deliverPush, pushProviderOutcome } = await import('@/lib/notifications/push-delivery')
    const result = pushProviderOutcome(await deliverPush(db, { businessId, ...envelope }))
    await autonomyReceipt(db, businessId, intent, result)
    return result
  }
}
