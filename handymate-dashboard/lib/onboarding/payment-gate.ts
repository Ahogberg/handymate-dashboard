import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Betalgrind för onboardingens effekter (seedning, finalize).
 *
 * OMSKRIVEN 2026-09-02 (Etapp B2): grinden var en svartlista som bara stoppade
 * TYDLIGT obetalda states och medvetet släppte igenom 'trial' — det state
 * register-rutten sätter på varje nytt konto. Följden var att hela
 * ingen-provperiod-beslutet läckte: ett direktanrop till POST /api/onboarding
 * kunde markera onboardingen klar utan att någon betalning skett, och kontot
 * fick 14 dagars dashboard via checkSubscriptionStatus.
 *
 * Nu en allowlist och fail-closed: bara ett känt betalt state öppnar, och en
 * rad som inte går att läsa blockerar (i stället för att öppna).
 *
 * Undantagen är två och avsiktliga:
 *   - is_pilot — pilotkontona (Bee m.fl.) fakturerades utanför Stripe
 *   - DEMO_BUSINESS_ID — demokontot kör om onboardingen med simulerad betalning
 *
 * Delad mellan finalize (POST /api/onboarding) och seedningen
 * (POST /api/onboarding/seed-products) så grindarna aldrig kan glida isär.
 */

/** 'comp' = gratiskonto (partner/medgrundare), samma lista som lib/auth.ts */
export const PAID_STATES = ['active', 'comp'] as const

export interface PaymentGateRow {
  business_id?: string | null
  subscription_status?: string | null
  is_pilot?: boolean | null
}

/**
 * Ren funktion — hela grindens logik på ett ställe, testbar utan databas.
 * En saknad rad (null/undefined) är INTE betald.
 *
 * `demoBusinessId` kan sättas till null för att stänga av demoundantaget.
 * GET /api/onboarding gör det: demokontot ska fortfarande SE betalsteget (det
 * är demon av steget, med simulerad betalning), medan finalize-grinden måste
 * släppa igenom det. Två olika frågor om samma konto.
 */
export function arOnboardingBetald(
  rad: PaymentGateRow | null | undefined,
  demoBusinessId: string | null | undefined = process.env.DEMO_BUSINESS_ID,
): boolean {
  if (!rad) return false
  if (rad.is_pilot === true) return true
  if (demoBusinessId && rad.business_id === demoBusinessId) return true
  const status = String(rad.subscription_status ?? '').toLowerCase().trim()
  return (PAID_STATES as readonly string[]).includes(status)
}

export async function isOnboardingPaymentBlocked(
  supabase: SupabaseClient,
  businessId: string,
): Promise<boolean> {
  const { data: subRow, error } = await supabase
    .from('business_config')
    .select('business_id, subscription_status, is_pilot')
    .eq('business_id', businessId)
    .maybeSingle()

  // Fail closed: går raden inte att läsa vet vi inte att den är betald.
  if (error) {
    console.warn('[payment-gate] kunde inte läsa prenumerationen — blockerar:', error.message)
    return true
  }

  return !arOnboardingBetald(subRow)
}
