import type { SupabaseClient } from '@supabase/supabase-js'
import { VALUE_EVENT_TYPES, type NewValueEvent, type ValueEvent } from './catalog'

/** Server only. Business identity must already be authenticated/trusted by the caller. */
export async function appendValueEvent(db: SupabaseClient, businessId: string, event: NewValueEvent): Promise<ValueEvent> {
  if (!(VALUE_EVENT_TYPES as readonly string[]).includes(event.event_type)) throw new Error('value_event_type_not_allowed')
  if (event.amount_minor !== null && !/^\d+$/.test(event.amount_minor)) throw new Error('value_amount_must_be_minor_string')
  const { data, error } = await db.rpc('append_value_event', { p_business_id: businessId, p_event: event })
  if (error) throw new Error(`append_value_event: ${error.message}`)
  if (!data?.id) throw new Error('append_value_event: missing result')
  return data as ValueEvent
}
