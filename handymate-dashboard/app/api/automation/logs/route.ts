import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/automation/logs — Paginerad aktivitetslogg
 * Query params: page, limit, status, rule_id, from_date, to_date
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const { searchParams } = new URL(request.url)

  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const offset = (page - 1) * limit

  let query = supabase
    .from('v3_automation_logs')
    .select('*', { count: 'exact' })
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const status = searchParams.get('status')
  if (status) query = query.eq('status', status)

  const ruleId = searchParams.get('rule_id')
  if (ruleId) query = query.eq('rule_id', ruleId)

  const fromDate = searchParams.get('from_date')
  if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00Z`)

  const toDate = searchParams.get('to_date')
  if (toDate) query = query.lte('created_at', `${toDate}T23:59:59Z`)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    logs: data || [],
    total: count || 0,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  })
}
