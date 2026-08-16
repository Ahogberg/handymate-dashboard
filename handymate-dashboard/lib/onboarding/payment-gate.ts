import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Betalgrind: konton utan aktiv prenumeration ska inte kunna trigga
 * onboarding-effekter (seedning, finalize) via direkta API-anrop.
 *
 * Konservativ (samma hållning sedan tidigare, se app/api/onboarding/
 * route.ts): blockerar bara TYDLIGT obetalda states. En nyregistrerad
 * kund har status 'trial' (register-routen sätter det) och släpps igenom.
 * Pilotkonton (`is_pilot`) släpps alltid igenom oavsett status.
 *
 * Delad mellan finalize (POST /api/onboarding) och det tidigare
 * seed-anropet (POST /api/onboarding/seed-products) så de två grindarna
 * aldrig kan glida isär.
 */
const BLOCKED_STATES = ['', 'inactive', 'cancelled', 'canceled', 'past_due', 'unpaid']

export async function isOnboardingPaymentBlocked(
  supabase: SupabaseClient,
  businessId: string,
): Promise<boolean> {
  const { data: subRow } = await supabase
    .from('business_config')
    .select('subscription_status, is_pilot')
    .eq('business_id', businessId)
    .single()

  const status = String(subRow?.subscription_status ?? '').toLowerCase()
  const isPilot = subRow?.is_pilot === true
  return !isPilot && BLOCKED_STATES.includes(status)
}
