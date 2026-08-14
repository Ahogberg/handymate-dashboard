import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getFuelLevel } from '@/lib/costs/fuel'

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
      .select('subscription_plan')
      .eq('business_id', business.business_id)
      .maybeSingle()

    const level = await getFuelLevel(supabase, business.business_id, config?.subscription_plan ?? null)
    return NextResponse.json(level)
  } catch (error: any) {
    console.error('[fuel] GET-fel:', error)
    // Fail-soft för klienten: en trasig mätare ska inte krascha Sidebar-
    // badgen eller billing-sidan — FuelProvider tolkar ett felsvar som
    // "visa inget", aldrig som "0 % kvar".
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
