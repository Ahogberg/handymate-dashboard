import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { seedProducts, seedPriceList } from '@/lib/seed-defaults'
import { resolveBranches } from '@/lib/product-defaults'
import { isOnboardingPaymentBlocked } from '@/lib/onboarding/payment-gate'

/**
 * POST /api/onboarding/seed-products
 *
 * Seedar produktbanken (`products` + `price_list`) TIDIGT — när kunden når
 * det nya onboarding-steget (StepProductRegister), inte vid onboarding-
 * avslut som tidigare. `branch`/`secondary_branches` finns redan i
 * business_config sedan kontoskapandet (Step2Business), och seedProducts/
 * seedPriceList är idempotenta (hoppar över om raderna redan finns) — det
 * befintliga anropet i seedAllDefaults (POST /api/onboarding, finalize)
 * blir automatiskt en no-op andra gången.
 *
 * Returnerar ALLTID 200 med `{ok, seeded}` utom vid genuin auth-/betal-
 * blockering — steget ska aldrig krascha på ett seed-fel, bara logga det
 * (samma fail-soft-hållning som seedAllDefaults självt).
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  if (await isOnboardingPaymentBlocked(supabase, business.business_id)) {
    return NextResponse.json(
      { error: 'Slutför betalningen för att aktivera kontot' },
      { status: 402 },
    )
  }

  const { data: config } = await supabase
    .from('business_config')
    .select('branch, industry, secondary_branches')
    .eq('business_id', business.business_id)
    .single()

  const branches = resolveBranches(config || {})

  try {
    await Promise.all([
      seedProducts(supabase, business.business_id, branches),
      seedPriceList(supabase, business.business_id, branches),
    ])
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[onboarding/seed-products] seedning misslyckades:', business.business_id, error?.message)
    // Fail-soft: steget visar bara ett tomt register i så fall, aldrig ett
    // krasch — kunden kan alltid bygga registret manuellt i Settings sen.
    return NextResponse.json({ ok: false })
  }
}
