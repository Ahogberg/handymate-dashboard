import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/** GET — Hämta månadens kvota och användning */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const month = new Date().toISOString().slice(0, 7)
  const biz = business as any

  const tier = biz.leads_addon_tier || 'starter'
  const defaultQuota = tier === 'pro' ? 50 : 20

  const { data } = await supabase
    .from('leads_monthly_usage')
    .select('*')
    .eq('business_id', business.business_id)
    .eq('month', month)
    .single()

  return NextResponse.json({
    month,
    tier,
    letters_sent: data?.letters_sent || 0,
    letters_quota: data?.letters_quota || defaultQuota,
    extra_letters: data?.extra_letters || 0,
    extra_cost_sek: data?.extra_cost_sek || 0,
  })
}
