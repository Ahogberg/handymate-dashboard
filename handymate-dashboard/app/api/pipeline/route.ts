import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { ensureDefaultStages, getPipelineStats } from '@/lib/pipeline'

/**
 * GET - Hämta alla deals grupperade per steg
 * Query params: search, assigned_to, priority
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const search = request.nextUrl.searchParams.get('search')
    const assignedTo = request.nextUrl.searchParams.get('assigned_to')
    const priority = request.nextUrl.searchParams.get('priority')

    // Ensure stages exist
    const stages = await ensureDefaultStages(business.business_id)

    // Fetch deals with customer join
    let query = supabase
      .from('deal')
      .select('*, customer:customer_id(customer_id, name, phone_number, email)')
      .eq('business_id', business.business_id)

    // Apply filters
    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    const { data: deals, error } = await query

    if (error) throw error

    // Group deals by stage_id
    const dealsByStage: Record<string, any[]> = {}
    for (const stage of stages) {
      dealsByStage[stage.id] = []
    }
    for (const deal of deals || []) {
      if (dealsByStage[deal.stage_id]) {
        dealsByStage[deal.stage_id].push(deal)
      }
    }

    // Get stats
    const stats = await getPipelineStats(business.business_id)

    return NextResponse.json({ stages, deals: dealsByStage, stats })
  } catch (error: any) {
    console.error('Get pipeline error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
