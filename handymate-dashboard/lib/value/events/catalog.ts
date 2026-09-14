/** V1 records product work. Money-stage events remain owned by the kernel/V2. */
export const VALUE_EVENT_TYPES = [
  'opportunity_identified', 'opportunity_acted', 'opportunity_dismissed',
  'time_measured', 'time_estimated',
] as const
export const RESERVED_VALUE_EVENT_TYPES = ['invoice_issued', 'payment_received'] as const
export type ValueEventType = typeof VALUE_EVENT_TYPES[number]
export interface ValueEvent {
  id: string
  seq: string
  business_id: string
  event_type: ValueEventType
  occurred_at: string
  subject_type: 'approval' | 'automation_log' | 'quote' | 'invoice'
  subject_id: string
  card_id: string | null
  amount_minor: string | null
  amount_basis: 'card_estimate' | null
  minutes: number | null
  minutes_basis: 'measured' | 'estimate' | null
  source_type: 'approval' | 'automation_log' | 'quote' | 'invoice'
  source_id: string
  idempotency_key: string
  payload: Record<string, any>
  method_version: 3
}
export type NewValueEvent = Omit<ValueEvent, 'id' | 'seq' | 'business_id' | 'method_version'>
