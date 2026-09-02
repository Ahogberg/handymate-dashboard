/**
 * Vilka konton teamet ska jobba för i de dagliga cronerna (2026-09-02).
 *
 * Tidigare filtrerade morgonbriefen och nästa-bästa-handling hårt på
 * subscription_status = 'active'. Ett konto i provperiod fick alltså
 * varken brief eller kort — och kunde därmed aldrig få det första
 * värdekvitto som "Aktivera senare" (app/onboarding) lovar att betalfrågan
 * väntar på. Nu räknas:
 *
 *   active, comp                     → alltid
 *   trial, trialing                  → så länge trial_ends_at inte passerats
 *                                      OCH onboardingen är klar (ett övergivet
 *                                      registreringsförsök ska inte kosta AI)
 *
 * Utgången provperiod, past_due, cancelled, inactive → inte med. Samma
 * gräns som checkSubscriptionStatus (lib/auth.ts) drar för inloggning.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface KontoRad {
  business_id: string
  subscription_status: string | null
  trial_ends_at: string | null
  onboarding_completed_at: string | null
}

export function harAktivtTeam(rad: KontoRad, nowMs: number = Date.now()): boolean {
  const status = String(rad.subscription_status || '').toLowerCase()
  if (status === 'active' || status === 'comp') return true
  if (status === 'trial' || status === 'trialing') {
    if (!rad.onboarding_completed_at) return false
    const slut = rad.trial_ends_at ? Date.parse(rad.trial_ends_at) : NaN
    return Number.isFinite(slut) && slut > nowMs
  }
  return false
}

export async function hamtaKontonMedAktivtTeam(supabase: SupabaseClient): Promise<Array<{ business_id: string }>> {
  const { data, error } = await supabase
    .from('business_config')
    .select('business_id, subscription_status, trial_ends_at, onboarding_completed_at')
    .in('subscription_status', ['active', 'comp', 'trial', 'trialing'])
  if (error) throw new Error(error.message)
  return ((data || []) as KontoRad[]).filter(r => harAktivtTeam(r)).map(r => ({ business_id: r.business_id }))
}
