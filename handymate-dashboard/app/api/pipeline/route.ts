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

    // Fetch deals
    let query = supabase
      .from('deal')
      .select('*')
      .eq('business_id', business.business_id)

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

    // Fetch customer data separately (no FK on deal table)
    const customerIds = Array.from(new Set((deals || []).map((d: any) => d.customer_id).filter(Boolean)))
    const customerMap: Record<string, any> = {}
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email, address_line, customer_type, org_number, contact_person, personal_number, customer_number')
        .in('customer_id', customerIds)
      for (const c of (customers || [])) {
        customerMap[c.customer_id] = c
      }
    }

    // Group deals by stage_id and attach customer
    const dealsByStage: Record<string, any[]> = {}
    for (const stage of stages) {
      dealsByStage[stage.id] = []
    }
    for (const deal of deals || []) {
      const enrichedDeal = {
        ...deal,
        customer: deal.customer_id ? customerMap[deal.customer_id] || null : null
      }
      if (dealsByStage[deal.stage_id]) {
        dealsByStage[deal.stage_id].push(enrichedDeal)
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
