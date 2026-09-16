import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { outboundRpc, type OutboundPromise, type OutboundStatus, type ClaimedOutbound } from './intents'
import { dispatchRecordedOutbound, type Preflight, type PromiseOutcome, type ProviderOutcome } from './promise'

export type SmsEnvelope = {
  message: string; businessName?: string | null; customerId?: string | null
  relatedId?: string | null; messageType?: string | null; approvalId?: string | null
  recipient: 'customer' | 'internal'; purpose: import('@/lib/outbound/sms-gate').SmsPurpose
  reconcile?: { type: 'invoice_reminder'; input: Record<string, unknown> }
}
export type EmailEnvelope = {
  subject: string; html: string; fromName?: string; fromAddress?: string; replyTo?: string
  customerId?: string | null; attachments?: Array<{ filename: string; content: string }>
  reconcile?: { type: 'invoice_reminder'; input: Record<string, unknown> }
  storedAttachments?: Array<{ filename: string; bucket: string; path: string }>
  journal?: { type: 'reviewed_document'; documentId: string; version: string }
}
export type PushEnvelope = {
  title: string; body: string; url: string; tag: string; targetUserId?: string | null
  data?: Record<string, unknown>; ttlSeconds: number; priority: 'high' | 'normal'
}
export type OutboundEnvelope = SmsEnvelope | EmailEnvelope | PushEnvelope
export interface PreparedOutbound<T extends OutboundEnvelope = OutboundEnvelope> {
  promise: OutboundPromise
  envelope: T
}
export interface RecordedOutbound {
  id?: string; status?: OutboundStatus; provider_ref?: string | null
  cancel_requested?: boolean; created: boolean; blocked?: boolean; deferred?: boolean
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  return JSON.stringify(value)
}
export function outboundVersion(envelope: OutboundEnvelope) {
  return createHash('sha256').update(stableJson(envelope)).digest('hex')
}
export async function recordOutboundSource<T extends OutboundEnvelope>(db: SupabaseClient, source: PreparedOutbound<T>): Promise<RecordedOutbound> {
  const p = source.promise, version = outboundVersion(source.envelope)
  if (Buffer.byteLength(stableJson(source.envelope)) > 2 * 1024 * 1024) throw new TypeError('outbound_source_too_large')
  return outboundRpc<RecordedOutbound>(db, 'record_outbound_message', {
    p_business_id: p.businessId, p_kind: p.kind, p_source: p.source, p_source_id: p.sourceId,
    p_dedupe_key: p.dedupeKey, p_recipient: p.recipient, p_template: p.template,
    p_autonomy_key: process.env.SUPERVISED_AUTONOMY_ENABLED === 'true' ? p.autonomyKey ?? null : null,
    p_context: p.context ?? null,
    p_version: version, p_envelope: source.envelope, p_defer_reason: null,
  })
}
export async function withOutboundSource<T extends OutboundEnvelope>(db: SupabaseClient, source: PreparedOutbound<T>,
  send: (intent: ClaimedOutbound, envelope: T) => Promise<ProviderOutcome>, preflight?: Preflight): Promise<PromiseOutcome> {
  const recorded = await recordOutboundSource(db, source)
  return dispatchRecordedOutbound(db, source.promise, recorded,
    intent => send(intent, source.envelope), preflight)
}
export async function readOutboundSource<T extends OutboundEnvelope>(db: SupabaseClient, businessId: string, intent: ClaimedOutbound): Promise<T> {
  const { data, error } = await db.from('outbound_messages').select('source,source_id,kind,recipient,template,version,context,envelope')
    .eq('business_id', businessId).eq('dedupe_key', intent.dedupe_key).maybeSingle()
  if (error || !data) throw new Error('outbound_source_not_found')
  if (data.source !== intent.source || data.source_id !== intent.source_id || data.kind !== intent.kind ||
      data.recipient !== intent.recipient || data.template !== intent.template || data.version !== intent.context?.version ||
      outboundVersion(data.envelope as T) !== data.version) throw new Error('outbound_source_changed')
  return data.envelope as T
}
