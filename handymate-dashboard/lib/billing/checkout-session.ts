import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

export class CheckoutConflict extends Error {}

/** Serialize purchases through a durable, immutable Stripe request, shared by both routes. */
export async function createSubscriptionCheckout(
  db: SupabaseClient, stripe: Stripe, businessId: string,
  params: Stripe.Checkout.SessionCreateParams,
  purchaseKind: 'base' | 'leads' = 'base',
): Promise<{ url: string | null }> {
  const { data: config, error } = await db.from('business_config')
    .select('stripe_customer_id, stripe_subscription_id').eq('business_id', businessId).single()
  if (error || !config) throw new Error('Kunde inte läsa betalningskontot')
  let customerId: string = config.stripe_customer_id
  if (!customerId) {
    // Stable parameters even if company/contact details change during a retry.
    const customer = await stripe.customers.create({ metadata: { business_id: businessId } },
      { idempotencyKey: `handymate-customer-${businessId}` })
    customerId = customer.id
    const saved = await db.from('business_config').update({ stripe_customer_id: customerId })
      .eq('business_id', businessId).select('business_id').single()
    if (saved.error || !saved.data) throw new Error('Kunde inte spara betalningskontot')
  }

  // Stripe is authoritative even when its webhook has not arrived yet.
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
  if (subscriptions.has_more) throw new CheckoutConflict('Kontot behöver kontrolleras före ett nytt köp.')
  const existing = subscriptions.data.filter(s => (purchaseKind === 'leads' ? s.metadata.addon === 'leads' : !s.metadata.addon) &&
    !['canceled', 'incomplete_expired'].includes(s.status))
  if (existing.length > 0) {
    if (existing.length !== 1) throw new CheckoutConflict('Kontot har flera abonnemang. Kontakta support innan du ändrar planen.')
    const subscription = existing[0]
    const item = subscription.items.data[0]
    const price = params.line_items?.[0]?.price
    if (!item || subscription.items.data.length !== 1 || !price) {
      throw new CheckoutConflict('Abonnemanget behöver ändras via support.')
    }
    return stripe.billingPortal.sessions.create({
      customer: customerId, return_url: params.cancel_url,
      flow_data: subscription.status === 'active' || subscription.status === 'trialing' ? {
        type: 'subscription_update_confirm',
        subscription_update_confirm: { subscription: subscription.id, items: [{ id: item.id, price, quantity: item.quantity || 1 }] },
        after_completion: { type: 'redirect', redirect: { return_url: params.cancel_url! } },
      } : undefined,
    })
  }

  const requestParams = { ...params, customer: customerId }
  for (let retry = 0; retry < 3; retry++) {
    const inserted = await db.from('billing_checkout_attempt').upsert({ business_id: businessId, params: requestParams },
      { onConflict: 'business_id', ignoreDuplicates: true })
    if (inserted.error) throw inserted.error
    const { data: attempt, error: readError } = await db.from('billing_checkout_attempt')
      .select('*').eq('business_id', businessId).single()
    if (readError || !attempt) throw new Error('Kunde inte säkra betalningsförsöket')
    if (attempt.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id)
      if (session.status === 'expired') {
        const removed = await db.from('billing_checkout_attempt').delete()
          .eq('business_id', businessId).eq('id', attempt.id)
        if (removed.error) throw removed.error
        continue
      }
      if (session.status !== 'open') throw new CheckoutConflict('Betalningen behandlas. Uppdatera sidan om en stund.')
      if (attempt.params.line_items?.[0]?.price !== requestParams.line_items?.[0]?.price) {
        throw new CheckoutConflict('Ett köp av en annan plan är redan öppet. Slutför det eller vänta tills det löper ut.')
      }
      return { url: session.url }
    }
    // Never reuse a Stripe key after its retention window. An uncertain old attempt
    // stays blocked for reconciliation rather than risking a second subscription.
    const created = Math.floor(new Date(attempt.created_at).getTime() / 1000)
    if (!Number.isFinite(created) || Date.now() / 1000 - created > 25 * 60) {
      throw new CheckoutConflict('Ett tidigare betalningsförsök behöver kontrolleras av support.')
    }
    if (attempt.params.line_items?.[0]?.price !== requestParams.line_items?.[0]?.price) {
      throw new CheckoutConflict('Ett köp av en annan plan pågår redan.')
    }
    const session = await stripe.checkout.sessions.create({ ...attempt.params, expires_at: created + 60 * 60 },
      { idempotencyKey: `handymate-checkout-${attempt.id}` })
    const saved = await db.from('billing_checkout_attempt').update({ stripe_session_id: session.id })
      .eq('business_id', businessId).eq('id', attempt.id).select('id').single()
    if (saved.error || !saved.data) throw new Error('Kunde inte spara betalningsförsöket')
    return { url: session.url }
  }
  throw new CheckoutConflict('Betalningsförsöket ändrades. Försök igen.')
}
