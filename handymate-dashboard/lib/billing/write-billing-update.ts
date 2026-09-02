import type Stripe from 'stripe'

/**
 * Den delade skrivningen av prenumerationsstatus (2026-09-02, Etapp B2).
 *
 * Låg tidigare bara i app/api/billing/webhook/route.ts. När betalsteget i
 * onboardingen fick en egen verifieringsväg (POST /api/billing/
 * onboarding-checkout/verify) måste BÅDA skriva exakt samma fält på exakt
 * samma sätt — annars beror kontots status på vilken av dem som hann först.
 *
 * Uppdelningen kritiska/period-fält är original och avsiktlig: en saknad
 * kolumn (billing_period_start/end innan sql/v69 körts) får ALDRIG blockera
 * statusskrivningen. Tidigare låg de i samma update — saknades kolumnen
 * avvisades HELA uppdateringen och prenumerationen aktiverades aldrig i vår
 * databas trots att Stripe drog pengarna.
 */

/** Unix-sekunder → ISO, eller null. Skyddar mot att new Date(undefined*1000) kastar. */
export function toIsoOrNull(unixSeconds: unknown): string | null {
  const n = Number(unixSeconds)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(n * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Stripes prenumerationsstatus → vår. Ingen provperiod finns i produkten. */
export const STRIPE_STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'cancelled',
  unpaid: 'past_due',
  incomplete: 'incomplete',
  incomplete_expired: 'cancelled',
  paused: 'paused',
}

export interface BillingPeriod {
  start?: string | null
  end?: string | null
}

export async function writeBillingUpdate(
  supabase: any,
  businessId: string,
  critical: Record<string, any>,
  period?: BillingPeriod,
) {
  const { error } = await supabase
    .from('business_config')
    .update(critical)
    .eq('business_id', businessId)
  if (error) {
    console.error('[Billing] KRITISK: subscription-status kunde inte skrivas — kastar:', { businessId, error })
    throw new Error(`business_config kritisk update misslyckades: ${error.message}`)
  }

  const periodUpdate: Record<string, any> = {}
  if (period?.start) periodUpdate.billing_period_start = period.start
  if (period?.end) periodUpdate.billing_period_end = period.end
  if (Object.keys(periodUpdate).length > 0) {
    const { error: perr } = await supabase
      .from('business_config')
      .update(periodUpdate)
      .eq('business_id', businessId)
    if (perr) {
      console.warn('[Billing] billing_period_* ej skrivet (kolumn saknas innan v69?) — icke-blockerande:', perr.message)
    }
  }
}

/**
 * Bygger fälten för en genomförd prenumerations-checkout ur sessionen.
 * Speglar Stripes verkliga status i stället för att hårdkoda 'active' — det
 * skyddar mot edge-fall som 'incomplete' vid 3DS/SCA. Att hämta
 * prenumerationen är best-effort och blockerar aldrig aktiveringen.
 */
export async function byggAbonnemangsfalt(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<{ critical: Record<string, any>; period?: BillingPeriod }> {
  const critical: Record<string, any> = {
    stripe_customer_id: session.customer as string,
    subscription_plan: session.metadata?.plan_id || 'starter',
    subscription_status: 'active',
  }
  let period: BillingPeriod | undefined

  if (session.subscription) {
    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
    critical.stripe_subscription_id = subId
    try {
      const subscription =
        typeof session.subscription === 'string'
          ? await stripe.subscriptions.retrieve(subId)
          : session.subscription
      critical.subscription_status = STRIPE_STATUS_MAP[subscription.status] || 'active'
      if (subscription.trial_end) {
        critical.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString()
      }
      period = {
        start: toIsoOrNull((subscription as any).current_period_start),
        end: toIsoOrNull((subscription as any).current_period_end),
      }
    } catch (err) {
      console.error('[Billing] Kunde inte hämta prenumerationsdetaljer:', err)
    }
  }

  return { critical, period }
}
