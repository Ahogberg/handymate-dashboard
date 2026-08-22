import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getFuelLevel } from '@/lib/costs/fuel'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/fuel — Bränsle-nivån för det inloggade kontot.
 *
 * Ingen rollgrind utöver inloggning — mätaren i Sidebar och på billing-
 * sidan ska fungera för alla teammedlemmar, inte bara ägare (till skillnad
 * från /api/billing/fuel-topup, som KÖPER något och därför är ägar-/
 * admingated).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const { data: config } = await supabase
      .from('business_config')
      .select('subscription_plan, billing_period_start')
      .eq('business_id', business.business_id)
      .maybeSingle()

    const level = await getFuelLevel(
      supabase,
      business.business_id,
      config?.subscription_plan ?? null,
      config?.billing_period_start ?? null,
    )
    return NextResponse.json(level)
  } catch (error: any) {
    console.error('[fuel] GET-fel:', error)
    // Fail-soft för klienten: en trasig mätare ska inte krascha Sidebar-
    // badgen eller billing-sidan — FuelProvider tolkar ett felsvar som
    // "visa inget", aldrig som "0 % kvar".
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
