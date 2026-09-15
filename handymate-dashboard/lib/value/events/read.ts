import type { SupabaseClient } from '@supabase/supabase-js'
import type { ValueEvent } from './catalog'
import { sumValueTime } from '../time-measured'

/** Safe rollout: explicit comparison can request 3; default stays 2 until migration + backfill. */
export function valueEventsEnabled(): boolean { return process.env.VALUE_EVENTS_ENABLED === 'true' }
export function ledgerMethod(requested?: string | null): 2 | 3 {
  if (requested != null && requested !== '2' && requested !== '3') throw new Error('invalid_value_method')
  return requested === '2' ? 2 : requested === '3' || valueEventsEnabled() ? 3 : 2
}
/** Bounded pages, no silently truncated aggregates. Stable seq order and tenant on every page. */
export async function readValueEvents(db: SupabaseClient, businessId: string, opts: {
  types?: string[]; from?: string; to?: string; cardIds?: string[]
} = {}): Promise<ValueEvent[]> {
  const events: ValueEvent[] = []
  let cursor = '0'
  for (;;) {
    let query = db.from('value_events').select('id,seq::text,business_id,event_type,occurred_at,subject_type,subject_id,card_id,amount_minor::text,amount_basis,minutes,minutes_basis,source_type,source_id,idempotency_key,payload,method_version').eq('business_id', businessId)
      .gt('seq', cursor).order('seq', { ascending: true }).limit(500)
    if (opts.types) query = query.in('event_type', opts.types)
    if (opts.from) query = query.gte('occurred_at', opts.from)
    if (opts.to) query = query.lt('occurred_at', opts.to)
    if (opts.cardIds) query = query.in('card_id', opts.cardIds)
    const { data, error } = await query
    if (error) throw new Error(`value_events read failed: ${error.message}`)
    const rows = (data || []) as ValueEvent[]
    events.push(...rows)
    if (rows.length < 500) return events
    const next = String(rows[rows.length - 1].seq)
    if (BigInt(next) <= BigInt(cursor)) throw new Error('value_events cursor did not advance')
    cursor = next
  }
}
export async function readValueTime(db: SupabaseClient, businessId: string, from: string, to: string) {
  return sumValueTime(await readValueEvents(db, businessId, { types: ['time_measured','time_estimated'], from, to }))
}
