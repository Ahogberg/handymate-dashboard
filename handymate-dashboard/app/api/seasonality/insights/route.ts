import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/seasonality/insights — Hämta säsongsinsikter för aktuellt företag
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('seasonality_insights')
    .select('month, avg_revenue, avg_job_count, is_slow_month, is_peak_month')
    .eq('business_id', business.business_id)
    .order('month')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ months: data || [] })
}
