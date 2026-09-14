import type { ValueEvent } from './catalog'

export interface EventCohortRow {
  id: string; approval_type: string; status: string; created_at: string
  resolved_at: string | null; title: string | null; payload: Record<string, unknown>
  value_amount_kr: number
}
/** Reconstruct product stages solely from events; the first identified snapshot owns the estimate. */
export function eventCohort(identified: ValueEvent[], lifecycle: ValueEvent[]): EventCohortRow[] {
  const byCard = new Map<string, ValueEvent[]>()
  for (const e of lifecycle) {
    if (!e.card_id) continue
    const list = byCard.get(e.card_id) || []
    list.push(e); byCard.set(e.card_id, list)
  }
  return identified.filter(e => e.event_type === 'opportunity_identified' && e.card_id).map(e => {
    const history = (byCard.get(e.card_id!) || []).slice().sort((a,b) => BigInt(a.seq) < BigInt(b.seq) ? -1 : 1)
    const last = history.filter(x => x.event_type === 'opportunity_acted' || x.event_type === 'opportunity_dismissed').pop()
    const acted = history.find(x => x.event_type === 'opportunity_acted')
    const minor = BigInt(e.amount_minor || '0')
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('value_amount_exceeds_projection_precision')
    return {
      id: e.card_id!, approval_type: e.payload.approval_type, title: e.payload.title ?? null,
      created_at: e.occurred_at, resolved_at: acted?.occurred_at ?? null,
      status: last?.event_type === 'opportunity_dismissed' ? 'rejected' : acted ? 'approved' : 'pending',
      payload: { ...(e.payload.card_payload || {}), ...(acted?.payload.card_payload || {}) },
      value_amount_kr: Number(minor) / 100,
    }
  })
}
