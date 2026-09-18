import type Stripe from 'stripe'
import { getPlanPrice, getPlanYearlyPrice, type PlanType } from '@/lib/feature-gates'

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

/**
 * Prenumerationens innevarande period.
 *
 * ═══ VARFÖR EN HJÄLPARE, OCH VARFÖR DEN SÅG UT SÅ HÄR FÖRUT ═══
 *
 * Koden läste `(subscription as any).current_period_start/end`. Casten var
 * spåret: i stripe v20 (kontot kör API 2026-01-28.clover) finns de fälten
 * INTE på prenumerationsroten — de ligger på varje `SubscriptionItem`
 * (node_modules/stripe/types/SubscriptionItems.d.ts). `as any` tystade
 * typfelet, uttrycket blev `undefined`, `toIsoOrNull(undefined)` gav null,
 * och den icke-blockerande skrivningen skrev tyst ingenting.
 *
 * Följden: `business_config.billing_period_start/end` har varit null för
 * varje konto sedan uppgraderingen. Verifierat 2026-09-18 — den enda skarpa
 * prenumerationen hade båda tomma. Det tog också bort underlaget för
 * `app/api/billing/usage` och för varje påminnelse om förnyelse.
 *
 * `items` är ett obligatoriskt fält på Subscription och följer med utan
 * expand. Handymates prenumerationer har ett pris, alltså en post; skulle
 * det någon gång bli flera delar de ändå faktureringscykel, så första
 * posten är rätt. Roten läses som reserv ifall en äldre API-version används
 * någonstans — då är den ifylld och posterna saknas.
 */
export function laesAbonnemangsperiod(
  subscription: Stripe.Subscription,
): BillingPeriod | undefined {
  const post = subscription.items?.data?.[0] as { current_period_start?: unknown; current_period_end?: unknown } | undefined
  const rot = subscription as unknown as { current_period_start?: unknown; current_period_end?: unknown }
  const start = toIsoOrNull(post?.current_period_start ?? rot.current_period_start)
  const end = toIsoOrNull(post?.current_period_end ?? rot.current_period_end)
  if (!start && !end) return undefined
  return { start, end }
}

/**
 * Faktureringsintervallet härlett ur periodens längd.
 *
 * Intervallet lagras inte på kontot — det finns bara i checkout-sessionens
 * metadata och når aldrig business_config. Periodlängden är entydig:
 * en månadsplan har ~30 dagar, en årsplan ~365. Tröskeln 45 dygn kan inte
 * träffa fel på de två plantyper som finns.
 */
export function harledIntervall(period: BillingPeriod | undefined): 'monthly' | 'yearly' | null {
  if (!period?.start || !period?.end) return null
  const dygn = (new Date(period.end).getTime() - new Date(period.start).getTime()) / 86_400_000
  if (!Number.isFinite(dygn) || dygn <= 0) return null
  return dygn > 45 ? 'yearly' : 'monthly'
}

/**
 * Grundarstämpeln (sql/v239, beslutsfilen §4). Byggs bara när checkout-
 * sessionen bar metadata.founders = 'true' — erbjudandet var tillgängligt i
 * det ögonblick kunden sa ja. Priset är LISTPRISET vid köpet i hela kronor
 * exkl. moms, inte vad Stripe drog.
 */
export interface FoundingStamp {
  founding_at: string
  founding_plan: string
  founding_interval: 'monthly' | 'yearly'
  founding_price_sek: number | null
}

export async function writeBillingUpdate(
  supabase: any,
  businessId: string,
  critical: Record<string, any>,
  period?: BillingPeriod,
  founding?: FoundingStamp,
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

  // Grundarstämpeln: egen, icke-blockerande skrivning av samma skäl som
  // perioden — en saknad kolumn (v239) får aldrig stoppa aktiveringen. Och
  // EN gång: filtret på founding_at IS NULL gör att en senare checkout
  // (uppgradering, omteckning) aldrig skriver över den ursprungliga stämpeln.
  if (founding) {
    const { error: ferr } = await supabase
      .from('business_config')
      .update(founding)
      .eq('business_id', businessId)
      .is('founding_at', null)
    if (ferr) {
      console.warn('[Billing] grundarstämpeln ej skriven (kolumn saknas innan v239?) — icke-blockerande:', ferr.message)
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
): Promise<{ critical: Record<string, any>; period?: BillingPeriod; founding?: FoundingStamp }> {
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
      period = laesAbonnemangsperiod(subscription)
    } catch (err) {
      console.error('[Billing] Kunde inte hämta prenumerationsdetaljer:', err)
    }
  }

  return { critical, period, founding: byggGrundarstampel(session.metadata) }
}

/**
 * Grundarstämpeln ur metadata. Checkout-skaparna sätter `founders` i BÅDA
 * metadata-blocken — sessionens och prenumerationens — så samma hjälpare
 * fungerar för verify-vägen (session) och webhookens
 * customer.subscription.* (subscription). Det är webhooken som faktiskt
 * skriver kontots status efter en checkout; verify-vägen är onboardingens
 * egen väg. Båda ska ge samma stämpel.
 */
export function byggGrundarstampel(
  metadata: Stripe.Metadata | null | undefined,
): FoundingStamp | undefined {
  if (metadata?.founders !== 'true') return undefined
  const plan = (metadata.plan_id || 'starter') as PlanType
  const interval = metadata.billing_interval === 'yearly' ? 'yearly' : 'monthly'
  const price = interval === 'yearly' ? getPlanYearlyPrice(plan) : getPlanPrice(plan)
  return {
    founding_at: new Date().toISOString(),
    founding_plan: plan,
    founding_interval: interval,
    founding_price_sek: typeof price === 'number' ? price : null,
  }
}
