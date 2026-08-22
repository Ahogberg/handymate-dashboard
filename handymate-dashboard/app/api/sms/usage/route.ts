import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, getBusinessPlanFromConfig } from '@/lib/auth'
import { getSmsUsage } from '@/lib/sms-usage'
import { getServerSupabase } from '@/lib/supabase'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('subscription_plan')
    .eq('business_id', business.business_id)
    .single()

  const plan = getBusinessPlanFromConfig(bizConfig || {})
  const usage = await getSmsUsage(business.business_id, plan)

  return NextResponse.json(usage)
}
