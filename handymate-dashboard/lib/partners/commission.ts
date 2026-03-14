/**
 * Partner commission processing.
 * Runs nightly — calculates monthly commission for each active partner referral.
 *
 * Commission model: 20% of monthly subscription for 12 months per referred customer.
 */

import { getServerSupabase } from '@/lib/supabase'

/**
 * Process monthly commissions for all active partner referrals.
 * Called by nightly cron (agent-context).
 */
export async function processMonthlyCommissions(): Promise<{
  processed: number
  commissioned: number
  completed: number
  errors: string[]
}> {
  const supabase = getServerSupabase()
  const errors: string[] = []
  let commissioned = 0
  let completed = 0

  // Find all partner referrals that are converted and still within 12 months
  const { data: referrals, error } = await supabase
    .from('referrals')
    .select('id, partner_id, referred_business_id, commission_month, subscription_amount_sek, commission_expires_at')
    .not('partner_id', 'is', null)
    .eq('status', 'active')
    .lt('commission_month', 12)

  if (error) {
    return { processed: 0, commissioned: 0, completed: 0, errors: [error.message] }
  }

  if (!referrals || referrals.length === 0) {
    return { processed: 0, commissioned: 0, completed: 0, errors: [] }
  }

  for (const ref of referrals) {
    try {
      // Check if customer is still active (has subscription)
      const { data: business } = await supabase
        .from('business_config')
        .select('business_id, stripe_subscription_id, plan')
        .eq('business_id', ref.referred_business_id)
        .maybeSingle()

      if (!business || !business.stripe_subscription_id) {
        continue // Customer no longer active — skip
      }

      // Determine subscription amount based on plan
      const planPrices: Record<string, number> = {
        starter: 2495,
        professional: 5995,
        enterprise: 11995,
      }
      const subscriptionAmount = ref.subscription_amount_sek || planPrices[business.plan] || 0
      if (subscriptionAmount === 0) continue

      // Get partner's commission rate
      const { data: partner } = await supabase
        .from('partners')
        .select('id, commission_rate')
        .eq('id', ref.partner_id)
        .eq('status', 'active')
        .maybeSingle()

      if (!partner) continue

      const commissionAmount = Math.round(subscriptionAmount * partner.commission_rate)
      const newMonth = (ref.commission_month || 0) + 1

      // Update referral
      const updateData: Record<string, unknown> = {
        commission_month: newMonth,
        subscription_amount_sek: subscriptionAmount,
      }

      if (newMonth >= 12) {
        updateData.status = 'rewarded'
        completed++
      }

      await supabase
        .from('referrals')
        .update(updateData)
        .eq('id', ref.id)

      // Add commission to partner's pending total
      const { data: currentPartner } = await supabase
        .from('partners')
        .select('total_pending_sek')
        .eq('id', ref.partner_id)
        .single()

      if (currentPartner) {
        await supabase
          .from('partners')
          .update({ total_pending_sek: (currentPartner.total_pending_sek || 0) + commissionAmount })
          .eq('id', ref.partner_id)
      }

      commissioned++
    } catch (err: any) {
      errors.push(`Referral ${ref.id}: ${err.message}`)
    }
  }

  return { processed: referrals.length, commissioned, completed, errors }
}

/**
 * Mark commission as paid for a partner (manual admin action).
 */
export async function markCommissionPaid(
  partnerId: string,
  amountSek: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServerSupabase()

  const { data: partner } = await supabase
    .from('partners')
    .select('total_pending_sek, total_earned_sek')
    .eq('id', partnerId)
    .single()

  if (!partner) {
    return { success: false, error: 'Partner hittades inte' }
  }

  const { error } = await supabase
    .from('partners')
    .update({
      total_pending_sek: Math.max(0, (partner.total_pending_sek || 0) - amountSek),
      total_earned_sek: (partner.total_earned_sek || 0) + amountSek,
    })
    .eq('id', partnerId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
