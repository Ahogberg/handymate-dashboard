/**
 * Partner webhook notification — fires when referred businesses convert, upgrade, or churn.
 */

import { createHmac } from 'crypto'
import { getServerSupabase } from '@/lib/supabase'

// Prismappen som låg här (499/1199/2399 kr) är borttagen (2026-08-11):
// den hade fel plannyckel ('enterprise' — riktiga id:t är 'business') och
// blev fel i grunden när provisionen blev trappbaserad och betalningsdriven.
// Faktiska belopp bor i partner_commission_ledger; events/webhooks bär
// inte längre något påhittat belopp.

/**
 * Notify the partner's webhook when a referred business triggers an event.
 * Also logs the event to partner_events.
 */
export async function notifyPartnerWebhook(
  businessId: string,
  eventType: string
): Promise<void> {
  const supabase = getServerSupabase()

  // Look up business + referral code
  const { data: business } = await supabase
    .from('business_config')
    .select('referred_by, business_name, subscription_plan')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!business?.referred_by) return

  // Find partner by referral code
  const { data: partner } = await supabase
    .from('partners')
    .select('id, webhook_url, webhook_secret, webhook_events')
    .eq('referral_code', business.referred_by)
    .eq('status', 'active')
    .maybeSingle()

  if (!partner) return

  const plan = business.subscription_plan || 'starter'

  // Log the event (business_id är TEXT sedan v117 — inserts fungerar nu)
  await supabase.from('partner_events').insert({
    partner_id: partner.id,
    business_id: businessId,
    event_type: eventType,
    amount_sek: null,
    meta: {
      business_name: business.business_name,
      plan,
    },
  })

  // Send webhook if configured and event type is enabled
  if (!partner.webhook_url) return

  const enabledEvents: string[] = partner.webhook_events || ['trial_started', 'converted', 'plan_upgraded', 'churned']
  if (!enabledEvents.includes(eventType)) return

  const payload = {
    event: eventType,
    business_name: business.business_name,
    plan,
    amount_sek: null,
    timestamp: new Date().toISOString(),
  }

  const signature = createHmac('sha256', partner.webhook_secret || '')
    .update(JSON.stringify(payload))
    .digest('hex')

  try {
    await fetch(partner.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Handymate-Signature': `sha256=${signature}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    console.error(`[partner-webhook] Failed to send webhook for partner ${partner.id}:`, err)
  }
}
