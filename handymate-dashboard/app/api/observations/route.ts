import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/observations
 *
 * Lista active observations från business_knowledge för authenticated
 * business. Default LIMIT 5, sorterat by created_at DESC (senaste först).
 *
 * Query-params:
 * - limit (default 5, max 50)
 * - agent_id (filter, t.ex. 'karin')
 *
 * Returnerar { observations: Array<...> } för TeamObservationsCard.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const url = request.nextUrl
    const limitRaw = parseInt(url.searchParams.get('limit') || '5', 10)
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 5 : limitRaw), 50)
    const agentId = url.searchParams.get('agent_id')

    let query = supabase
      .from('business_knowledge')
      .select('id, agent_id, knowledge_type, title, observation, suggestion, confidence, data_basis, related_approval_id, created_at')
      .eq('business_id', business.business_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[observations/GET] query error:', error)
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          stage: 'business_knowledge_query',
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ observations: data || [] })
  } catch (err: any) {
    console.error('[observations/GET] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Serverfel', stage: 'unexpected' },
      { status: 500 },
    )
  }
}
