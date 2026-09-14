import { decimalKrToMinor, type ReferenceSnapshot } from '../financial-kernel/shadow/compare'
export interface FortnoxShadowObservation {
  fetch_status: 'ok' | 'not_found' | 'error'
  snapshot?: unknown
  error?: string
}
export type RawFortnoxShadowSnapshot = FortnoxShadowObservation
/** Reference-only adapter. Never use local state as evidence about Fortnox. */
export function normalizeFortnoxShadowSnapshot(observation: FortnoxShadowObservation | null): ReferenceSnapshot | null {
  if (!observation) return null
  if (observation.fetch_status !== 'ok') return { fetch_status: observation.fetch_status, error: observation.error }
  const raw = observation.snapshot
  if (!raw || typeof raw !== 'object') return { fetch_status: 'error', error: 'invalid Fortnox invoice snapshot' }
  const ref = raw as Record<string, unknown>
  const total = decimalKrToMinor(ref.Total), share = decimalKrToMinor(ref.TotalToPay), balance = decimalKrToMinor(ref.Balance)
  const tax = ref.TaxReduction === undefined ? '0' : decimalKrToMinor(ref.TaxReduction)
  if (total === null || share === null || balance === null || tax === null || BigInt(total) < BigInt(0) || BigInt(share) < BigInt(0) || BigInt(tax) < BigInt(0)) {
    return { fetch_status: 'error', error: 'invalid or missing Fortnox amount' }
  }
  // classifyFortnoxPayment is a legacy synchronization heuristic, not independent
  // evidence: its ±1 kr tolerance, local customer_paid short-circuit and local
  // amount fallback would hide shadow divergence. Map the same economic classes
  // exactly from reference-only öre instead. FullyPaid contradictions are compared.
  const t = BigInt(total), s = BigInt(share), b = BigInt(balance), taxMinor = BigInt(tax)
  const settlement_state = ref.Cancelled === true ? 'cancelled'
    : ref.FullyPaid === true || b <= BigInt(0) ? 'paid'
      : s > BigInt(0) && t > s && (t - b >= s || (taxMinor > BigInt(0) && b <= taxMinor)) ? 'customer_paid' : 'open'
  return { fetch_status: 'ok', total_minor: total, customer_minor: share, balance_minor: balance, settlement_state }
}
