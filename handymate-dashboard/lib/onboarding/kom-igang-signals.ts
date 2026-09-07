import type { SupabaseClient } from '@supabase/supabase-js'
import type { KomIgangSignals } from './kom-igang-tasks'
import { loadChannelHealth } from './channel-health-data'

/**
 * Signalerna bakom Kom igång-uppgifterna, läst för ETT företag.
 *
 * Bruten ur GET /api/onboarding/kom-igang (2026-09-02, Etapp B4) så att
 * livscykelmailen kan tala om samma luckor som startsidan visar — annars blir
 * mailen generisk drip i stället för det kunden faktiskt saknar.
 *
 * Även kundinflödesbevisen delas med mejlen. Behörighet kontrolleras av
 * HTTP-/cron-anroparen; läsfel stoppar prioriteringen på båda ytorna.
 */
export async function hamtaKomIgangSignals(
  supabase: SupabaseClient,
  businessId: string,
): Promise<KomIgangSignals> {
  const [configRes, callRecRes, quoteRes, pushRes, invoiceRes, missionRes, customerRes, segmentedRes, pendingRes, channelHealth] =
    await Promise.all([
      supabase.from('business_config').select('onboarding_data, fortnox_connected').eq('business_id', businessId).maybeSingle(),
      supabase.from('call_recording').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('push_subscriptions').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('invoice').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('mission').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('customer').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('customer').select('*', { count: 'exact', head: true }).eq('business_id', businessId).not('segment_id', 'is', null),
      supabase.from('pending_approvals').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'pending').neq('approval_type', 'team_intro'),
      loadChannelHealth(supabase, businessId),
    ])

  // Ett läsfel är okänt, inte en tom portfölj eller en avklarad uppgift.
  if ([configRes, callRecRes, quoteRes, pushRes, invoiceRes, missionRes, customerRes, segmentedRes, pendingRes].some(r => r.error)) {
    throw new Error('Kunde inte läsa startunderlaget.')
  }
  const testCall = (configRes.data?.onboarding_data as Record<string, unknown> | null | undefined)
    ?.test_call as { called_at?: string | null } | undefined

  const onboarding = configRes.data?.onboarding_data as Record<string, unknown> | null
  const firstFocus = onboarding?.firstFocus ?? onboarding?.first_focus
  const names: Record<string, string> = { phone: 'Telefon', email: 'E-post', web: 'Webb' }
  return {
    kundinflode: {
      any_lead_verified: channelHealth.any_lead_verified,
      any_channel_verified: channelHealth.any_channel_verified,
      fler_jobb: firstFocus === 'fler_jobb',
      kanaler: channelHealth.channels.map(c => `${names[c.channel]}: ${c.label.toLowerCase()}`).join(' · '),
    },
    firstFocus: onboarding?.firstFocus ?? onboarding?.first_focus,
    ring_test: Boolean(testCall?.called_at) || (callRecRes.count ?? 0) > 0,
    karin_has_invoice_data: Boolean(configRes.data?.fortnox_connected) || (invoiceRes.count ?? 0) > 0,
    has_quote: (quoteRes.count ?? 0) > 0,
    has_mission: (missionRes.count ?? 0) > 0,
    customer_count: customerRes.count ?? 0,
    segmented_customer_count: segmentedRes.count ?? 0,
    pwa: (pushRes.count ?? 0) > 0,
    pending_real_cards: pendingRes.count ?? 0,
  }
}
