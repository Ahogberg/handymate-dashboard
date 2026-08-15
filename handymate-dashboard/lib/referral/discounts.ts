/**
 * V8 Referral — Rabattlogik
 *
 * Sparar engångsrabatt på nästa faktura.
 * Appliceras automatiskt när faktura skapas.
 */

import { getServerSupabase } from '@/lib/supabase'
import { sanitizeSenderId } from '@/lib/sms/sender-id'

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

  // Ladda referral-raden FÖRST och branch:a på referrer_type (fixat
  // 2026-08-11). Tidigare låg resolveReferralCode före den här punkten —
  // men den slår bara upp kunders egna koder i business_config.referral_code,
  // så partnerkoder (P-…) returnerade i förtid med "Referralkod kunde inte
  // lösas" och partner-referrals fastnade i 'pending' för evigt.
  // Provisionsmotorn (lib/partners/commission.ts) kräver converted_at —
  // hela partnerkedjan var därmed död. Koden löses nu bara i kundgrenen,
  // som är den enda som behöver referrerBusinessId.
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

  if (referrerType === 'partner') {
    // Partnergrenen: aktivera bara. Ingen rabatt, ingen engångsprovision —
    // löpande provision ackrueras per FAKTISKT BETALD månad av
    // processCommissionPeriod (trappa 1-12 mån, sedan basnivå), med
    // liggarrader som utbetalningsunderlag. Den gamla 50 %-engångsmodellen
    // som låg här stred mot både partneravtalet och trappmodellen och är
    // borttagen (2026-08-11).
    await supabase
      .from('referrals')
      .update({
        status: 'active',
        converted_at: new Date().toISOString(),
      })
      .eq('id', existingReferral.id)

    return { rewarded: true }
  }

  // Kundgrenen: resolve referralkod → referrer business_id
  const { resolveReferralCode } = await import('./codes')
  const referrerBusinessId = await resolveReferralCode(config.referred_by)
  if (!referrerBusinessId) {
    return { rewarded: false, error: 'Referralkod kunde inte lösas' }
  }

  // Uppdatera referral till active
  await supabase
    .from('referrals')
    .update({
      status: 'active',
      converted_at: new Date().toISOString(),
    })
    .eq('id', existingReferral.id)

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
      // Genom strypunkten (etapp 0 batch 4). Går till hantverkarens EGET
      // nummer — rabattbeskedet är vår notis till honom, inte ett
      // kundutskick, därför recipient:'owner'.
      const { sendSmsViaElks } = await import('@/lib/sms-send')
      const r = await sendSmsViaElks({
        supabase,
        businessId: referrerBusinessId,
        businessName: referrerConfig.business_name,
        to: referrerConfig.personal_phone,
        message: 'Din kollega har nu aktiverat Handymate! Du får 50% rabatt på nästa månads faktura. Tack för att du spred ordet!',
        messageType: 'referral_reward',
        recipient: 'internal',
        purpose: 'internal',
      })
      if (!r.success) console.error('[referral] rabattnotis misslyckades:', r.error)
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

  return { rewarded: true, referrerBusinessId }
}
