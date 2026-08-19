import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lanseringserbjudandet "Grundarkunderna" (Andreas-beslut 2026-08-19): de
 * första 20 RIKTIGA betalande företagen låser sitt pris för alltid, får 90
 * dagars pengarna-tillbaka-garanti i stället för 30, och direktlinje till
 * grundaren första året.
 *
 * "Riktig betalande" (aldrig en påhittad räknare):
 *   - stripe_subscription_id IS NOT NULL — en verklig Stripe-prenumeration
 *     finns, inte bara ett konto som klickat sig igenom onboarding utan att
 *     betala.
 *   - subscription_status = 'active' — kolumnen (sql/v36_stripe_elements.sql,
 *     skriven av app/api/billing/webhook/route.ts handleCheckoutCompleted/
 *     updateSubscriptionData) speglar Stripes verkliga status.
 *   - is_demo_tenant = false (sql/v99_demo_reset_transaction.sql, NOT NULL
 *     DEFAULT FALSE) — manuellt uppsatta test-/demokonton räknas aldrig,
 *     även om de skulle få subscription_status satt manuellt.
 *
 * Serverhärledd — klienten får ALDRIG antalet platser kvar, bara en boolean.
 * Ingen offentlig räknare i V1 (varken "X kvar" eller "platserna är slut").
 *
 * Fail-closed vid databasfel: en bortglömd banner är ofarlig, en felaktigt
 * VISAD "en av de första 20"-banner efter att platserna redan tagit slut
 * är det inte.
 */
const FOUNDERS_SEATS = 20

export async function isFoundersOfferAvailable(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('business_config')
      .select('business_id', { count: 'exact', head: true })
      .not('stripe_subscription_id', 'is', null)
      .eq('subscription_status', 'active')
      .eq('is_demo_tenant', false)

    if (error) {
      console.error('[founders-offer] Kunde inte räkna betalande konton — fail-closed (false):', error.message)
      return false
    }

    return (count ?? FOUNDERS_SEATS) < FOUNDERS_SEATS
  } catch (err) {
    console.error('[founders-offer] Oväntat fel — fail-closed (false):', err)
    return false
  }
}
