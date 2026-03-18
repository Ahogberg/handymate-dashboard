import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/business-settings — Hämta företagsinställningar (addon-status, logo etc.)
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('business_config')
    .select('leads_addon, leads_addon_tier, logo_url, subscription_plan, subscription_status, stripe_customer_id')
    .eq('business_id', business.business_id)
    .single()

  return NextResponse.json({
    leads_addon: data?.leads_addon || false,
    leads_addon_tier: data?.leads_addon_tier || null,
    logo_url: data?.logo_url || null,
    subscription_plan: data?.subscription_plan || 'starter',
    subscription_status: data?.subscription_status || 'trial',
    has_stripe: !!data?.stripe_customer_id,
  })
}
