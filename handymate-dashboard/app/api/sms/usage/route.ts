import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, getBusinessPlanFromConfig } from '@/lib/auth'
import { getSmsUsage } from '@/lib/sms-usage'
import { getServerSupabase } from '@/lib/supabase'

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
