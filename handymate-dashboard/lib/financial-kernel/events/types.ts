import type { FinancialEventType } from './catalog'
import { money, type Money, type CurrencyCode } from '../money'

export type FinancialActorType = 'system' | 'user' | 'provider' | 'import' | 'agent'

/** FK.1 payloads owned by C4. Other packages must define their payload before use. */
export interface FinancialEventPayloads {
  invoice_issued: { invoice_id: string; invoice_number: string; customer_id: string; project_id?: string;
    currency: string; total_minor: number | string; vat_regime: 'standard' | 'reverse_charge_construction';
    accounting_method: 'accrual' | 'cash'; issued_date: string; due_date: string; tax_reduction?: 'rot' | 'rut' }
  invoice_credited: { invoice_id: string; credit_invoice_id: string; currency: string; amount_minor: number | string; issued_date: string }
  receivable_created: { receivable_id: string; invoice_id: string; component: 'customer' | 'tax_authority';
    owner: 'business' | 'factor'; currency: string; amount_minor: number | string; due_date: string }
  receivable_adjusted: { receivable_id: string; reason: 'credit' | 'write_off' | 'dunning_fee' | 'interest' | 'rounding' | 'ownership_transfer' | 'reclassification';
    delta_minor?: number | string; owner_after?: 'business' | 'factor'; from_component?: 'customer' | 'tax_authority'; to_component?: 'customer' | 'tax_authority' }
  receivable_settled: { receivable_id: string; invoice_id: string; component: 'customer' | 'tax_authority'; settled_at: string }
  payment_initiated: { payment_id: string; payment_intent_id?: string; provider: string; provider_ref?: string;
    direction: 'inbound' | 'outbound'; currency: string; amount_minor: number | string }
  payment_settled: { payment_id: string; currency: string; amount_minor: number | string; fee_minor?: number | string;
    settled_at: string; evidence: 'provider' | 'manual' | 'fortnox' | 'bank' }
  payment_allocated: { allocation_id: string; payment_id: string; receivable_id: string; currency: string; amount_minor: number | string }
  payment_allocation_reversed: { allocation_id: string; reason: string }
  payment_intent_created: never
  payment_authorized: never
  payment_processing_started: never
  payment_failed: never
  payment_cancelled: never
  payment_refunded: never
  payment_disputed: never
  payout_created: never
  payout_settled: never
  bank_transaction_imported: never
  reconciliation_matched: never
  reconciliation_unmatched: never
  reconciliation_reversed: never
  journal_entry_posted: never
  journal_entry_reversed: never
  period_locked: never
  period_unlocked: never
  payment_divergence_detected: never
  accounting_divergence_detected: never
  supplier_invoice_approved: never
  payable_created: never
  supplier_payment_settled: never
  payable_settled: never
}

export interface FinancialEventEnvelope<T extends FinancialEventType = FinancialEventType> {
  readonly eventId: string
  readonly seq: bigint
  readonly schemaVersion: number
  readonly eventType: T
  readonly businessId: string
  readonly occurredAt: string
  readonly effectiveDate?: string
  readonly source: { readonly type: string; readonly id: string }
  readonly correlationId: string
  readonly causationId?: string
  readonly idempotencyKey: string
  readonly amount?: Money
  readonly actor: { readonly type: FinancialActorType; readonly id?: string }
  readonly payload: FinancialEventPayloads[T]
  readonly createdAt: string
}

/**
 * Exact database boundary: BIGINT columns must arrive as strings, never via
 * JSON numbers. Timestamps arrive as ISO strings. A future transport adapter
 * must configure lossless int8 reads; a PostgREST JSON number is not this type.
 */
export type FinancialEventRow = {
  id: string
  seq: string
  business_id: string
  schema_version: number
  event_type: FinancialEventType
  occurred_at: string
  effective_date: string | null
  source_type: string
  source_id: string
  correlation_id: string
  causation_id: string | null
  idempotency_key: string
  currency: CurrencyCode | null
  amount_minor: string | null
  payload: FinancialEventPayloads[FinancialEventType]
  actor_type: FinancialActorType
  actor_id: string | null
  created_at: string
}

function integerString(value: string): bigint {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new TypeError('Expected lossless BIGINT string')
  return BigInt(value)
}

export function envelopeFromRow(row: FinancialEventRow): FinancialEventEnvelope {
  if ((row.amount_minor === null) !== (row.currency === null)) throw new TypeError('Amount and currency must be paired')
  return {
    eventId: row.id, seq: integerString(row.seq), schemaVersion: row.schema_version, eventType: row.event_type,
    businessId: row.business_id, occurredAt: row.occurred_at,
    ...(row.effective_date === null ? {} : { effectiveDate: row.effective_date }),
    source: { type: row.source_type, id: row.source_id }, correlationId: row.correlation_id,
    ...(row.causation_id === null ? {} : { causationId: row.causation_id }),
    idempotencyKey: row.idempotency_key,
    ...(row.amount_minor === null ? {} : { amount: money(integerString(row.amount_minor), row.currency!) }),
    actor: { type: row.actor_type, ...(row.actor_id === null ? {} : { id: row.actor_id }) },
    payload: row.payload, createdAt: row.created_at,
  }
}

export function rowFromEnvelope(e: Omit<FinancialEventEnvelope, 'eventId' | 'seq' | 'createdAt'>): Omit<FinancialEventRow, 'id' | 'seq' | 'created_at'> {
  return {
    business_id: e.businessId, schema_version: e.schemaVersion, event_type: e.eventType,
    occurred_at: e.occurredAt, effective_date: e.effectiveDate ?? null,
    source_type: e.source.type, source_id: e.source.id, correlation_id: e.correlationId,
    causation_id: e.causationId ?? null, idempotency_key: e.idempotencyKey,
    currency: e.amount?.currency ?? null, amount_minor: e.amount?.amountMinor.toString() ?? null,
    payload: e.payload, actor_type: e.actor.type, actor_id: e.actor.id ?? null,
  }
}
