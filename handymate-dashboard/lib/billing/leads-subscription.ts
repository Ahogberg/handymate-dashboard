import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

async function subscriptionsForCustomer(stripe: Stripe, customerId: string) {
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
  if (subscriptions.has_more) throw new Error('Tilläggsabonnemangen behöver kontrolleras av support')
  return subscriptions.data.filter(sub => sub.metadata.addon === 'leads' && !['canceled','incomplete_expired'].includes(sub.status))
}

/** Reconcile from current Stripe state, including portal changes and old deleted events. */
export async function syncLeadsSubscription(db: SupabaseClient, stripe: Stripe, businessId: string, customerId: string) {
  const subscriptions = await subscriptionsForCustomer(stripe, customerId)
  if (subscriptions.length > 1) throw new Error('Flera Leads-abonnemang måste stämmas av')
  const sub = subscriptions[0]
  let tier: string | null = null
  if (sub) {
    const price = sub.items.data[0]?.price.id
    if (price && price === process.env.STRIPE_LEADS_STARTER_PRICE_ID) tier = 'starter'
    else if (price && price === process.env.STRIPE_LEADS_PRO_PRICE_ID) tier = 'pro'
    else throw new Error('Leads-abonnemangets Stripe-pris känns inte igen')
  }
  const active = !!sub && ['active','trialing'].includes(sub.status)
  const { data, error } = await db.from('business_config')
    .update({ leads_addon: active, leads_addon_tier: active ? tier : null })
    .eq('business_id', businessId).eq('stripe_customer_id', customerId).select('business_id').single()
  if (error || !data) throw new Error('Leads-status kunde inte sparas')
}

export async function cancelLeadsSubscriptions(db: SupabaseClient, stripe: Stripe, businessId: string, customerId: string) {
  const subscriptions = await subscriptionsForCustomer(stripe, customerId)
  for (const subscription of subscriptions) await stripe.subscriptions.cancel(subscription.id)
  await syncLeadsSubscription(db, stripe, businessId, customerId)
}
