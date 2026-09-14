/** Exact Level 1 observations. No command execution or correction belongs here. */
export const COMPARISON_VERSION = 1
export const SEVERITY = {
  PAYMENT_DIVERGENCE: 'critical',
  RECEIVABLE_BALANCE_DIVERGENCE: 'high',
  ROUNDING_DIVERGENCE: 'low',
  MISSING_REFERENCE_ENTRY: 'high',
  REFERENCE_DATA_UNAVAILABLE: 'medium',
  MISSING_HANDYMATE_ENTRY: 'high',
  PROJECTION_DIVERGENCE: 'critical',
} as const
export type ShadowDifferenceKind = keyof typeof SEVERITY
export interface ShadowDifference {
  kind: ShadowDifferenceKind
  severity: typeof SEVERITY[ShadowDifferenceKind]
  dimension: string
  expected: unknown
  actual: unknown
}
export interface ShadowReceivable {
  component: string
  status: string
  amount_minor: string
  outstanding_minor: string
  currency?: string
}
export interface HandymateShadowInvoice {
  invoice_id: string
  fortnox_document_number: string | number | null
  status: string | null
  paid_amount: unknown
  sent_at: string | null
  phase_started_at: string
  projection: { receivables: ShadowReceivable[]; recorded_minor: string; derived_status: string | null } | null
}
export type HandymateInvoiceSnapshot = HandymateShadowInvoice
export interface ReferenceSnapshot {
  fetch_status: 'ok' | 'not_found' | 'error'
  total_minor?: string
  customer_minor?: string
  balance_minor?: string
  settlement_state?: 'paid' | 'customer_paid' | 'cancelled' | 'open'
  error?: string
}
export interface InvoiceComparison {
  result: 'match' | 'divergent' | 'reference_missing'
  differences: ShadowDifference[]
}
/** Decimal parsing, not binary multiplication/rounding. Invalid and sub-öre values stay unknown. */
export function decimalKrToMinor(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) return null
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!match) return null
  return ((match[1] ? -BigInt(1) : BigInt(1)) * (BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? '').padEnd(2, '0')))).toString()
}
const minor = (value: unknown): bigint | null => typeof value === 'string' && /^-?\d+$/.test(value) ? BigInt(value) : null
const state = (value: string | null): string => value === 'paid' || value === 'customer_paid' || value === 'cancelled' ? value : 'open'

export function compareInvoiceLevel1(handymate: HandymateShadowInvoice, snapshot: ReferenceSnapshot | null): InvoiceComparison {
  const differences: ShadowDifference[] = []
  const add = (kind: ShadowDifferenceKind, dimension: string, expected: unknown, actual: unknown) => {
    differences.push({ kind, severity: SEVERITY[kind], dimension, expected, actual })
  }
  const amount = (dimension: string, expected: bigint, actual: bigint) => {
    if (expected === actual) return
    const delta = expected > actual ? expected - actual : actual - expected
    add(delta <= BigInt(100) ? 'ROUNDING_DIVERGENCE' : 'RECEIVABLE_BALANCE_DIVERGENCE', dimension, expected.toString(), actual.toString())
  }
  const unavailable = (): InvoiceComparison => differences.some(d => d.kind !== 'REFERENCE_DATA_UNAVAILABLE')
    ? { result: 'divergent', differences }
    : { result: 'reference_missing', differences: [] } // SQL owns the unavailable-reference lifecycle.
  const projection = handymate.projection
  const receivables = projection?.receivables ?? []
  const hasKernel = receivables.length > 0
  const sent = Date.parse(handymate.sent_at ?? ''), since = Date.parse(handymate.phase_started_at)
  if (!hasKernel && Number.isFinite(sent) && Number.isFinite(since) && sent >= since) {
    add('MISSING_HANDYMATE_ENTRY', 'receivables', 'kernel receivables for an invoice sent in S1', null)
  }
  if (hasKernel && projection?.derived_status !== null && !['paid', 'customer_paid'].includes(projection?.derived_status ?? '')) {
    add('PROJECTION_DIVERGENCE', 'kernel.derived_status', 'paid, customer_paid or null', projection?.derived_status ?? null)
  }
  const voided = hasKernel && receivables.every(r => r.status === 'voided')
  const kernelState = voided ? 'cancelled' : state(projection?.derived_status ?? null)
  if (hasKernel) {
    if (state(handymate.status) !== kernelState) add('PROJECTION_DIVERGENCE', 'invoice.status', kernelState, handymate.status)
    const recorded = minor(projection?.recorded_minor), paid = minor(decimalKrToMinor(handymate.paid_amount))
    if (recorded === null || paid === null || recorded !== paid) add('PROJECTION_DIVERGENCE', 'invoice.paid_amount', recorded?.toString() ?? null, paid?.toString() ?? null)
  }
  if (!handymate.fortnox_document_number || !snapshot || snapshot.fetch_status === 'error') {
    add('REFERENCE_DATA_UNAVAILABLE', 'reference', 'Fortnox invoice', snapshot?.error ?? null)
    return unavailable()
  }
  if (snapshot.fetch_status === 'not_found') {
    add('MISSING_REFERENCE_ENTRY', 'reference', String(handymate.fortnox_document_number), null)
    return { result: 'divergent', differences }
  }
  const total = minor(snapshot.total_minor), share = minor(snapshot.customer_minor), balance = minor(snapshot.balance_minor)
  if (total === null || share === null || balance === null || total < BigInt(0) || share < BigInt(0) || !['paid', 'customer_paid', 'cancelled', 'open'].includes(snapshot.settlement_state ?? '')) {
    add('REFERENCE_DATA_UNAVAILABLE', 'reference.amounts', 'finite exact öre amounts and settlement state', null)
    return unavailable()
  }
  if (!hasKernel) {
    if (!differences.length) add('REFERENCE_DATA_UNAVAILABLE', 'kernel.baseline', 'kernel receivables', null)
    return unavailable()
  }
  const amounts = receivables.map(r => minor(r.amount_minor)), outstanding = receivables.map(r => minor(r.outstanding_minor))
  if (amounts.some(v => v === null || v < BigInt(0)) || outstanding.some(v => v === null || v < BigInt(0)) || receivables.some(r => r.currency && r.currency !== 'SEK') || !receivables.some(r => r.component === 'customer')) {
    add('PROJECTION_DIVERGENCE', 'kernel.amounts', 'valid SEK receivable amounts and customer component', null)
    return { result: 'divergent', differences }
  }
  const referenceState = snapshot.settlement_state
  if (referenceState !== kernelState) add('PAYMENT_DIVERGENCE', 'settlement', referenceState, kernelState)
  amount('total_minor', total, (amounts as bigint[]).reduce((a, b) => a + b, BigInt(0)))
  amount('customer_minor', share, receivables.reduce((sum, r) => sum + (r.component === 'customer' ? minor(r.amount_minor)! : BigInt(0)), BigInt(0)))
  if (referenceState === 'paid') {
    // FullyPaid with a nonzero Balance is contradictory evidence, never an exact match.
    amount('reference_paid_balance_minor', BigInt(0), balance)
    amount('kernel_paid_balance_minor', BigInt(0), (outstanding as bigint[]).reduce((a, b) => a + b, BigInt(0)))
  }
  return { result: differences.length ? 'divergent' : 'match', differences }
}
