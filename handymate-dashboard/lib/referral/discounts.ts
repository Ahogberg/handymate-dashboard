/**
 * V8 Referral — Rabattlogik
 *
 * Sparar engångsrabatt på nästa faktura.
 * Appliceras automatiskt när faktura skapas.
 */

import { getServerSupabase } from '@/lib/supabase'

/**
 * Spara en pending referralrabatt som appliceras på nästa faktura.
 * Lagras i v3_automation_settings.referral_discount_pending.
 */
export async function applyNextInvoiceDiscount(
  businessId: string,
  percentOff: number
): Promise<void> {
  const supabase = getServerSupabase()

  const discount = {
    percent: percentOff,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 dagar
  }

  // Upsert — skapa settings-rad om den inte finns
  const { data: existing } = await supabase
    .from('v3_automation_settings')
    .select('id')
    .eq('business_id', businessId)
    .single()

  if (existing) {
    await supabase
      .from('v3_automation_settings')
      .update({ referral_discount_pending: discount })
      .eq('business_id', businessId)
  } else {
    await supabase
      .from('v3_automation_settings')
      .insert({
        business_id: businessId,
        referral_discount_pending: discount,
      })
  }
}

/**
 * Hämta eventuell pending referralrabatt.
 * Returnerar null om ingen finns eller om den gått ut.
 */
export async function getPendingDiscount(
  businessId: string
): Promise<{ percent: number; expires_at: string } | null> {
  const supabase = getServerSupabase()

  const { data } = await supabase
    .from('v3_automation_settings')
    .select('referral_discount_pending')
    .eq('business_id', businessId)
    .single()

  const discount = data?.referral_discount_pending as { percent: number; expires_at: string } | null
  if (!discount) return null

  // Kontrollera utgångsdatum
  if (new Date(discount.expires_at) < new Date()) {
    // Rabatten har gått ut — rensa
    await supabase
      .from('v3_automation_settings')
      .update({ referral_discount_pending: null })
      .eq('business_id', businessId)
    return null
  }

  return discount
}

/**
 * Nollställ referralrabatt efter applicering.
 */
export async function clearPendingDiscount(
  businessId: string
): Promise<void> {
  const supabase = getServerSupabase()

  await supabase
    .from('v3_automation_settings')
    .update({ referral_discount_pending: null })
    .eq('business_id', businessId)
}

/**
 * Hantera första betalning — konvertera referral och belöna referrer.
 */
export async function handleFirstPaymentReferral(
  businessId: string,
  amountSek: number
): Promise<{ rewarded: boolean; referrerBusinessId?: string; error?: string }> {
  const supabase = getServerSupabase()

  // Hämta referred_by
  const { data: config } = await supabase
    .from('business_config')
    .select('referred_by')
    .eq('business_id', businessId)
    .single()

  if (!config?.referred_by) {
    return { rewarded: false }
  }

  // Resolve referralkod → referrer business_id
  const { resolveReferralCode } = await import('./codes')
  const referrerBusinessId = await resolveReferralCode(config.referred_by)
  if (!referrerBusinessId) {
    return { rewarded: false, error: 'Referralkod kunde inte lösas' }
  }

  // Kolla om redan konverterad
  const { data: existingReferral } = await supabase
    .from('referrals')
    .select('id, status, referrer_type')
    .eq('referred_business_id', businessId)
    .single()

  if (!existingReferral) {
    return { rewarded: false, error: 'Ingen referral-rad hittad' }
  }

  if (existingReferral.status === 'active' || existingReferral.status === 'rewarded') {
    return { rewarded: false } // Redan hanterad
  }

  const referrerType = existingReferral.referrer_type || 'customer'

  // Uppdatera referral till active
  await supabase
    .from('referrals')
    .update({
      status: 'active',
      converted_at: new Date().toISOString(),
    })
    .eq('id', existingReferral.id)

  if (referrerType === 'customer') {
    // Ge referrer 50% rabatt på nästa faktura
    await applyNextInvoiceDiscount(referrerBusinessId, 50)

    // Skicka SMS till referrer
    try {
      const { data: referrerConfig } = await supabase
        .from('business_config')
        .select('personal_phone, business_name')
        .eq('business_id', referrerBusinessId)
        .single()

      if (referrerConfig?.personal_phone) {
        const ELKS_API_USER = process.env.ELKS_API_USER!
        const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

        await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: (referrerConfig.business_name || 'Handymate').substring(0, 11),
            to: referrerConfig.personal_phone,
            message: 'Din kollega har nu aktiverat Handymate! Du får 50% rabatt på nästa månads faktura. Tack för att du spred ordet!',
          }),
        })
      }
    } catch (err) {
      console.error('[Referral] SMS-sändning misslyckades:', err)
    }

    // Uppdatera till rewarded
    await supabase
      .from('referrals')
      .update({
        status: 'rewarded',
        rewarded_at: new Date().toISOString(),
        referrer_discount_applied_at: new Date().toISOString(),
      })
      .eq('id', existingReferral.id)

    // Fire automation event
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'referral_converted', referrerBusinessId, {
        referred_business_id: businessId,
        amount_sek: amountSek,
      })
    } catch { /* non-blocking */ }
  }

  if (referrerType === 'partner') {
    const commission = Math.round(amountSek * 0.5)

    await supabase
      .from('referrals')
      .update({
        status: 'rewarded',
        rewarded_at: new Date().toISOString(),
        partner_commission_sek: commission,
      })
      .eq('id', existingReferral.id)

    console.log(`[Referral] Partner-provision: ${commission} kr för business ${businessId}`)
  }

  return { rewarded: true, referrerBusinessId }
}
