/**
 * Partner webhook notification — fires when referred businesses convert, upgrade, or churn.
 */

import { createHmac } from 'crypto'
import { getServerSupabase } from '@/lib/supabase'

const provisionPerPlan: Record<string, number> = {
  starter: 499,       // 20% av 2 495
  professional: 1199, // 20% av 5 995
  enterprise: 2399,   // 20% av 11 995
}

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
    .select('referred_by, business_name, company_name, plan, subscription_plan')
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
  const amountSek = provisionPerPlan[plan] || 0

  // Log the event
  await supabase.from('partner_events').insert({
    partner_id: partner.id,
    business_id: businessId,
    event_type: eventType,
    amount_sek: amountSek,
    meta: {
      business_name: business.business_name || business.company_name,
      plan,
    },
  })

  // Send webhook if configured and event type is enabled
  if (!partner.webhook_url) return

  const enabledEvents: string[] = partner.webhook_events || ['trial_started', 'converted', 'plan_upgraded', 'churned']
  if (!enabledEvents.includes(eventType)) return

  const payload = {
    event: eventType,
    business_name: business.business_name || business.company_name,
    plan,
    amount_sek: amountSek,
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
