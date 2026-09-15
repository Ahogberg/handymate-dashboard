import type { SupabaseClient } from '@supabase/supabase-js'
import type { AutonomyKey } from './earned-autonomy'
export const supervisedAutonomyEnabled = () =>
  process.env.SUPERVISED_AUTONOMY_ENABLED === 'true' &&
  process.env.CHANNEL_PREFLIGHT_ENABLED === 'true' &&
  process.env.HANDOFF_INBOX_ENABLED === 'true'
export async function grantOnConsent(
  db: SupabaseClient,
  businessId: string,
  actorId: string,
  answer: boolean,
) {
  if (!supervisedAutonomyEnabled()) throw Error('consent_not_enabled')
  const r = await db.rpc('answer_autonomy_consent', {
    p_business_id: businessId,
    p_actor_id: actorId,
    p_answer: answer,
  })
  if (r.error) throw Error('consent_write_failed')
  return r.data === true
}
export async function readAutonomyControl(
  db: SupabaseClient,
  businessId: string,
  key: AutonomyKey,
) {
  const r = await db
    .from('autonomy_controls')
    .select('granted,mode,source,cooldown_until')
    .eq('business_id', businessId)
    .eq('key', key)
    .maybeSingle()
  if (r.error) throw Error('autonomy_control_read_failed')
  return r.data as {
    granted: boolean
    mode: 'supervised' | 'earned'
    source: string
    cooldown_until: string | null
  } | null
}
export async function stopSupervisedAutonomy(
  db: SupabaseClient,
  businessId: string,
  key: AutonomyKey,
  source: 'customer' | 'failure' = 'customer',
) {
  const r = await db.rpc('stop_supervised_autonomy', {
    p_business_id: businessId,
    p_key: key,
    p_source: source,
  })
  if (r.error) throw Error('autonomy_stop_failed')
}
