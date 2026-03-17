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

  const months = data || []
  const MONTH_NAMES: Record<number, string> = {
    1: 'jan', 2: 'feb', 3: 'mar', 4: 'apr', 5: 'maj', 6: 'jun',
    7: 'jul', 8: 'aug', 9: 'sep', 10: 'okt', 11: 'nov', 12: 'dec',
  }
  const slow = months.filter((m: any) => m.is_slow_month).map((m: any) => MONTH_NAMES[m.month])
  const peak = months.filter((m: any) => m.is_peak_month).map((m: any) => MONTH_NAMES[m.month])

  let summary = ''
  if (peak.length > 0 || slow.length > 0) {
    const parts: string[] = []
    if (peak.length > 0) parts.push(`Starkaste: ${peak.join(', ')}`)
    if (slow.length > 0) parts.push(`Svagaste: ${slow.join(', ')}`)
    summary = parts.join('. ') + '.'
  }

  return NextResponse.json({ months, summary, slow_months: slow, peak_months: peak })
}
