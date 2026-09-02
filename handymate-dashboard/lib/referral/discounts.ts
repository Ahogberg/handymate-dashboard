/**
 * V8 Referral — Belöningslogik (kund-till-kund)
 *
 * Belöningen är EN MÅNAD GRATIS = referrerns månadspris, skriven som
 * Stripe-kundsaldo (negativ balance transaction i öre, SEK). Stripe drar
 * saldot automatiskt på nästa faktura, oavsett månads- eller årsplan.
 *
 * Historik: fram till 2026-09-02 skrevs en "50 % på nästa faktura" som JSON
 * i en kolumn på v3_automation_settings (se sql/v8_referral.sql) — ingen
 * läste den vid fakturering, så rabatten drogs aldrig trots att SMS:et
 * lovade den. Kolumnen finns kvar i databasen men används inte längre.
 */

import Stripe from 'stripe'
import { getServerSupabase } from '@/lib/supabase'
import { PLAN_PRICES_SEK, type PlanType } from '@/lib/feature-gates'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-01-28.clover' as any })
}

function isPlanType(plan: unknown): plan is PlanType {
  return typeof plan === 'string' && Object.prototype.hasOwnProperty.call(PLAN_PRICES_SEK, plan)
}

/** SMS till referrern när kollegan aktiverat. GSM-7-tecken enbart (ingen
 *  tankstreck) så det ryms i EN SMS-del (≤ 160 tecken). */
export const REFERRAL_REWARD_SMS =
  'Din kollega har nu aktiverat Handymate. Du får en månad gratis, den dras på din nästa faktura. Tack för att du spred ordet! /Handymate'

/**
 * Kreditera referrern en månad gratis som Stripe-kundsaldo.
 *
 * Saknas Stripe-kund (pilot-/testkonton) eller är planen okänd krediteras
 * INGET — vi gissar aldrig belopp. Anroparen får `granted:false` + orsak och
 * lämnar referral-raden okrediterad så admin kan hantera den manuellt.
 *
 * Idempotens i två lager, båda knutna till `referralId`:
 *   1. Stripes idempotencyKey — stoppar dubbel webhook/omkörning (Stripe
 *      minns nyckeln i 24 h, och cachar även ett 5xx-svar lika länge).
 *   2. `metadata.referral_id` på saldotransaktionen + en kontroll mot
 *      kundens saldohistorik före skrivning — permanent skydd för fallet
 *      att krediten gick igenom men `rewarded` aldrig skrevs och raden
 *      passerar hit igen långt senare. Hittas den → `alreadyCredited`.
 */
export async function grantReferralMonthCredit(
  referrerBusinessId: string,
  opts: { referralId: string }
): Promise<{ granted: boolean; amountSek?: number; alreadyCredited?: boolean; error?: string }> {
  const supabase = getServerSupabase()

  const { data: referrer } = await supabase
    .from('business_config')
    .select('stripe_customer_id, subscription_plan, business_name')
    .eq('business_id', referrerBusinessId)
    .single()

  if (!referrer?.stripe_customer_id) {
    console.warn('[referral] Ingen Stripe-kund på referrern, ingen kredit skriven:', referrerBusinessId)
    return { granted: false, error: 'no_stripe_customer' }
  }

  if (!isPlanType(referrer.subscription_plan)) {
    console.warn('[referral] Okänd plan på referrern, ingen kredit skriven:', {
      referrerBusinessId,
      plan: referrer.subscription_plan,
    })
    return { granted: false, error: 'unknown_plan' }
  }

  const amountSek = PLAN_PRICES_SEK[referrer.subscription_plan]

  try {
    const stripe = getStripe()

    // Lager 2: ligger krediten för just denna referral redan i Stripe?
    const historik = await stripe.customers.listBalanceTransactions(referrer.stripe_customer_id, { limit: 100 })
    const redan = historik.data.find(t => t.metadata?.referral_id === opts.referralId)
    if (redan) {
      console.warn('[referral] Krediten låg redan i Stripe, skriver inte igen:', {
        referrerBusinessId,
        referralId: opts.referralId,
        transactionId: redan.id,
      })
      return { granted: true, alreadyCredited: true, amountSek: Math.abs(redan.amount) / 100 }
    }

    await stripe.customers.createBalanceTransaction(
      referrer.stripe_customer_id,
      {
        amount: -(amountSek * 100),
        currency: 'sek',
        description: 'Rekommendation: en månad gratis',
        metadata: { business_id: referrerBusinessId, referral_reward: 'month', referral_id: opts.referralId },
      },
      { idempotencyKey: `referral-month-${opts.referralId}` }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[referral] Stripe-kredit misslyckades:', { referrerBusinessId, amountSek, message })
    return { granted: false, error: `stripe_error: ${message}` }
  }

  return { granted: true, amountSek }
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

  // 'rewarded' är slutläget för kundgrenen — idempotensen mot dubbel webhook.
  if (existingReferral.status === 'rewarded') {
    return { rewarded: false } // Redan hanterad
  }

  const referrerType = existingReferral.referrer_type || 'customer'

  if (referrerType === 'partner') {
    // Partnergrenen: 'active' är slutläget — redan konverterad.
    if (existingReferral.status === 'active') {
      return { rewarded: false } // Redan hanterad
    }

    // Aktivera bara. Ingen rabatt, ingen engångsprovision —
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

  // Uppdatera referral till active (= konverterad, ännu inte krediterad).
  // En rad som redan står i 'active' är en tidigare körning där krediten
  // inte gick igenom — den får passera hit igen och försöka på nytt.
  if (existingReferral.status !== 'active') {
    await supabase
      .from('referrals')
      .update({
        status: 'active',
        converted_at: new Date().toISOString(),
      })
      .eq('id', existingReferral.id)
  }

  // Ge referrern en månad gratis som Stripe-kundsaldo. Går det inte igenom
  // (ingen Stripe-kund, okänd plan, Stripe-fel) lämnas raden i 'active' så
  // att en omkörning kan försöka igen — och driftlarmet gör den synlig,
  // ingen adminyta listar kund-referrals.
  const credit = await grantReferralMonthCredit(referrerBusinessId, {
    referralId: existingReferral.id,
  })
  if (!credit.granted) {
    console.error('[referral] Belöning EJ skriven, referral kvar i active:', {
      referralId: existingReferral.id,
      referrerBusinessId,
      error: credit.error,
    })
    await rapporteraTystFel(supabase, referrerBusinessId, 'referral_kredit', credit.error || 'okänt fel', {
      referral_id: existingReferral.id,
      referred_business_id: businessId,
    })
    return { rewarded: false, referrerBusinessId, error: credit.error }
  }

  // Uppdatera till rewarded — skrivs BARA när krediten faktiskt ligger i
  // Stripe, och DIREKT efter den så att fönstret där saldot finns men raden
  // står kvar i 'active' blir så kort som möjligt. Faller skrivningen larmar
  // vi; metadata.referral_id på transaktionen gör att en omkörning ändå
  // inte krediterar två gånger.
  const { error: rewardedError } = await supabase
    .from('referrals')
    .update({
      status: 'rewarded',
      rewarded_at: new Date().toISOString(),
      referrer_discount_applied_at: new Date().toISOString(),
    })
    .eq('id', existingReferral.id)
  if (rewardedError) {
    await rapporteraTystFel(supabase, referrerBusinessId, 'referral_rewarded_status', rewardedError.message, {
      referral_id: existingReferral.id,
      referred_business_id: businessId,
      credit_sek: credit.amountSek,
    })
  }

  // Skicka SMS till referrer — men inte en gång till om krediten redan låg
  // i Stripe sedan en tidigare körning (beskedet gick då).
  if (!credit.alreadyCredited) try {
    const { data: referrerConfig } = await supabase
      .from('business_config')
      .select('personal_phone, business_name')
      .eq('business_id', referrerBusinessId)
      .single()

    if (referrerConfig?.personal_phone) {
      // Genom strypunkten (etapp 0 batch 4). Går till hantverkarens EGET
      // nummer — belöningsbeskedet är vår notis till honom, inte ett
      // kundutskick, därför recipient:'internal'.
      const { sendSmsViaElks } = await import('@/lib/sms-send')
      const r = await sendSmsViaElks({
        supabase,
        businessId: referrerBusinessId,
        businessName: referrerConfig.business_name,
        to: referrerConfig.personal_phone,
        message: REFERRAL_REWARD_SMS,
        messageType: 'referral_reward',
        recipient: 'internal',
        purpose: 'internal',
      })
      if (!r.success) console.error('[referral] belöningsnotis misslyckades:', r.error)
    }
  } catch (err) {
    console.error('[Referral] SMS-sändning misslyckades:', err)
  }

  // Fire automation event
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    await fireEvent(supabase, 'referral_converted', referrerBusinessId, {
      referred_business_id: businessId,
      amount_sek: amountSek,
      referrer_credit_sek: credit.amountSek,
    })
  } catch { /* non-blocking */ }

  return { rewarded: true, referrerBusinessId }
}
