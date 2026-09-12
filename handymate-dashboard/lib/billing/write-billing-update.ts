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
  expectedSubscriptionId?: string,
) {
  const { data: current, error: readError } = await supabase.from('business_config')
    .select('stripe_subscription_id').eq('business_id', businessId).single()
  if (readError || !current) throw new Error('Betalningskontot kunde inte läsas')
  if (expectedSubscriptionId && current.stripe_subscription_id !== expectedSubscriptionId) {
    throw new Error('Abonnemanget ändrades under uppdateringen')
  }
  if (critical.stripe_subscription_id && current.stripe_subscription_id &&
      critical.stripe_subscription_id !== current.stripe_subscription_id) {
    throw new Error('Ett annat abonnemang är redan kopplat till kontot')
  }
  let update = supabase
    .from('business_config')
    .update(critical)
    .eq('business_id', businessId)
  update = current.stripe_subscription_id
    ? update.eq('stripe_subscription_id', current.stripe_subscription_id)
    : update.is('stripe_subscription_id', null)
  const { data, error } = await update
    .select('business_id')
    .single()
  if (error || !data) {
    console.error('[Billing] KRITISK: subscription-status kunde inte skrivas — kastar:', { businessId, error })
    throw new Error(`business_config kritisk update misslyckades: ${error?.message || 'företaget saknas'}`)
  }

  const periodUpdate: Record<string, any> = {}
  if (period?.start) periodUpdate.billing_period_start = period.start
  if (period?.end) periodUpdate.billing_period_end = period.end
  if (Object.keys(periodUpdate).length > 0) {
    let periodQuery = supabase
      .from('business_config')
      .update(periodUpdate)
      .eq('business_id', businessId)
    const subscriptionId = critical.stripe_subscription_id || current.stripe_subscription_id
    periodQuery = subscriptionId ? periodQuery.eq('stripe_subscription_id', subscriptionId) : periodQuery.is('stripe_subscription_id', null)
    const { error: perr } = await periodQuery
    if (perr) {
      console.warn('[Billing] billing_period_* ej skrivet (kolumn saknas innan v69?) — icke-blockerande:', perr.message)
    }
  }
}

/**
 * Bygger fälten för en genomförd prenumerations-checkout ur sessionen.
 * Speglar Stripes verkliga status i stället för att hårdkoda 'active' — det
 * skyddar mot edge-fall som 'incomplete' vid 3DS/SCA. Att hämta
 * prenumerationen måste lyckas innan någon status får skrivas.
 */
export async function byggAbonnemangsfalt(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  db: any,
): Promise<{ critical: Record<string, any>; period?: BillingPeriod }> {
  if (session.mode !== 'subscription' || !session.subscription || !session.metadata?.plan_id) {
    throw new Error('Checkout saknar verifierat abonnemang')
  }
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
  const subscription = await stripe.subscriptions.retrieve(subId)
  const critical: Record<string, any> = {
    stripe_subscription_id: subId,
    subscription_plan: await subscriptionPlan(db, subscription),
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    subscription_status: STRIPE_STATUS_MAP[subscription.status] || 'incomplete',
    trial_ends_at: toIsoOrNull(subscription.trial_end),
  }
  return { critical, period: subscriptionPeriod(subscription) }
}

export function subscriptionPeriod(subscription: Stripe.Subscription): BillingPeriod {
  const item = subscription.items.data[0]
  return {
    start: toIsoOrNull(item?.current_period_start),
    end: toIsoOrNull(item?.current_period_end),
  }
}

/** Portal changes do not update subscription metadata. Resolve the actual price. */
export async function subscriptionPlan(db: any, subscription: Stripe.Subscription): Promise<string> {
  const prices = subscription.items.data.map(item => item.price.id)
  const { data, error } = await db.from('billing_plan').select('plan_id').in('stripe_price_id', prices)
  if (error) throw error
  const plans = (data || []).map((row: { plan_id: string }) => row.plan_id.replace(/_yearly$/, ''))
    .filter((plan: string) => ['starter', 'professional', 'business'].includes(plan))
  if (plans.length !== 1) throw new Error('Abonnemangets pris saknar entydig plan')
  return plans[0]
}
