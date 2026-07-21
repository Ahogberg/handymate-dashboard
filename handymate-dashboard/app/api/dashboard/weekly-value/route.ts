import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getWeeklyValue } from '@/lib/weekly-value'

/**
 * GET /api/dashboard/weekly-value
 *
 * Tunn route-wrapper — själva beräkningen bor i lib/weekly-value.ts så att
 * app/api/cron/onboarding-followup (dag-7-mailet) kan återanvända den utan
 * copy-paste.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const value = await getWeeklyValue(supabase, business.business_id)

  return NextResponse.json(value)
}
