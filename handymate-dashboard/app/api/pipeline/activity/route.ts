import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET - Hämta senaste pipeline-aktiviteter för företaget
 * Query params: triggered_by (filter), limit (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const triggeredBy = request.nextUrl.searchParams.get('triggered_by')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 20

    // Fetch all stages for business to build a name map
    const { data: stages } = await supabase
      .from('pipeline_stage')
      .select('id, name, slug, color')
      .eq('business_id', business.business_id)

    const stageMap: Record<string, { name: string; slug: string; color: string }> = {}
    for (const stage of stages || []) {
      stageMap[stage.id] = { name: stage.name, slug: stage.slug, color: stage.color }
    }

    // Fetch activities with deal join
    let query = supabase
      .from('pipeline_activity')
      .select('*, deal:deal_id(id, title)')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (triggeredBy) {
      query = query.eq('triggered_by', triggeredBy)
    }

    const { data: activities, error } = await query

    if (error) throw error

    // Enrich with stage names
    const enriched = (activities || []).map((activity: any) => ({
      ...activity,
      from_stage: activity.from_stage_id ? stageMap[activity.from_stage_id] || null : null,
      to_stage: activity.to_stage_id ? stageMap[activity.to_stage_id] || null : null,
    }))

    return NextResponse.json({ activities: enriched })
  } catch (error: any) {
    console.error('Get pipeline activity error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
