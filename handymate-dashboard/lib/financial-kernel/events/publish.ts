import { FINANCIAL_EVENT_SCHEMA_VERSION, type FinancialEventType } from './catalog'
import { envelopeFromRow, type FinancialActorType, type FinancialEventEnvelope, type FinancialEventPayloads, type FinancialEventRow } from './types'
import type { Money } from '../money'

/** Compatible with the Supabase client's thenable RPC builder; no client or credentials here. */
export interface KernelDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>
}
export interface AppendFinancialEventInput<T extends FinancialEventType> {
  businessId: string; eventType: T; schemaVersion?: number
  occurredAt: string; effectiveDate?: string
  source: { type: string; id: string }
  correlationId: string; causationId?: string; idempotencyKey: string
  amount?: Money; actor: { type: FinancialActorType; id?: string }
  payload: FinancialEventPayloads[T]
}

export async function appendFinancialEvent<T extends FinancialEventType>(db: KernelDb, input: AppendFinancialEventInput<T>): Promise<{ event: FinancialEventEnvelope<T>; inserted: boolean }> {
  const { data, error } = await db.rpc('append_financial_event', {
    p_business_id: input.businessId, p_event_type: input.eventType,
    p_schema_version: input.schemaVersion ?? FINANCIAL_EVENT_SCHEMA_VERSION,
    p_occurred_at: input.occurredAt, p_effective_date: input.effectiveDate ?? null,
    p_source_type: input.source.type, p_source_id: input.source.id,
    p_correlation_id: input.correlationId, p_causation_id: input.causationId ?? null,
    p_idempotency_key: input.idempotencyKey, p_currency: input.amount?.currency ?? null,
    p_amount_minor: input.amount?.amountMinor.toString() ?? null,
    p_payload: input.payload, p_actor_type: input.actor.type, p_actor_id: input.actor.id ?? null,
  })
  if (error) throw new Error(error.message)
  if (!Array.isArray(data) || data.length !== 1 || typeof data[0]?.inserted !== 'boolean') throw new TypeError('Invalid append RPC response')
  const row = data[0] as FinancialEventRow & { inserted: boolean }
  return { event: envelopeFromRow(row) as FinancialEventEnvelope<T>, inserted: row.inserted }
}

function segment(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim() || value.includes(':')) throw new TypeError('Expected nonempty key segment without colon or surrounding whitespace')
  return value
}
export function correlationId(root: 'invoice' | 'supplier_invoice' | 'payment' | 'bank' | 'journal', id: string): string {
  if (!['invoice', 'supplier_invoice', 'payment', 'bank', 'journal'].includes(root)) throw new TypeError('Unknown correlation root')
  return `fin_${root}_${segment(id)}`
}
export function idempotencyKey(domain: string, source: string, id: string, discriminator?: string): string {
  return [domain, source, id, ...(discriminator === undefined ? [] : [discriminator])].map(segment).join(':')
}
