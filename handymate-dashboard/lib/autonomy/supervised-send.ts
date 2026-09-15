import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isAutonomous,
  type AutonomyKey,
  AUTONOMY_META,
} from './earned-autonomy'
import { supervisedAutonomyEnabled } from './consent-grant'
import { gateChannel, type Channel } from '@/lib/channels/preflight'
/** Audit only, not H3b's future dispatch queue. Persist uncertainty before invoking a provider. */
export async function supervisedSend<T>(
  db: SupabaseClient,
  businessId: string,
  key: AutonomyKey,
  channel: Channel,
  send: () => Promise<T>,
  outcome: (result: T) => 'success' | 'failed' | 'skipped' | 'unknown',
  blocked: T,
  options: NonNullable<Parameters<typeof gateChannel>[3]> & {
    recordLog?: boolean
  } = {},
): Promise<T> {
  if (
    !supervisedAutonomyEnabled() ||
    !(await isAutonomous(db, businessId, key))
  )
    return blocked
  if (!(await gateChannel(db, businessId, channel, options)).ok) return blocked
  const r = await db.rpc('record_autonomy_attempt', {
    p_business_id: businessId,
    p_key: key,
    p_title: AUTONOMY_META[key].label,
  })
  if (r.error || !r.data) return blocked
  const id = r.data
  // Off wins up to the last check. A provider request already in flight cannot be recalled.
  if (!(await isAutonomous(db, businessId, key))) {
    await db.rpc('finish_autonomy_attempt', {
      p_business_id: businessId,
      p_id: id,
      p_outcome: 'skipped',
    })
    return blocked
  }
  try {
    const result = await send()
    const finish = await db.rpc('finish_autonomy_attempt', {
      p_business_id: businessId,
      p_id: id,
      p_outcome: outcome(result),
      p_log: options.recordLog === true,
      p_channel: channel,
    })
    if (finish.error) console.error('[autonomy] outcome remains unknown', id)
    return result
  } catch (error) {
    console.error('[autonomy] provider attempt remains unknown', id)
    throw error
  }
}
