import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET - Hämta aktivitetslogg för en deal
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { id } = params

    // Verify deal belongs to business
    const { data: deal } = await supabase
      .from('deal')
      .select('id')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    // Fetch all stages for business to build a name map
    const { data: stages } = await supabase
      .from('pipeline_stage')
      .select('id, name, slug, color')
      .eq('business_id', business.business_id)

    const stageMap: Record<string, { name: string; slug: string; color: string }> = {}
    for (const stage of stages || []) {
      stageMap[stage.id] = { name: stage.name, slug: stage.slug, color: stage.color }
    }

    // Fetch activities for the deal
    const { data: activities, error } = await supabase
      .from('pipeline_activity')
      .select('*')
      .eq('deal_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Enrich activities with stage names
    const enriched = (activities || []).map((activity: any) => ({
      ...activity,
      from_stage: activity.from_stage_id ? stageMap[activity.from_stage_id] || null : null,
      to_stage: activity.to_stage_id ? stageMap[activity.to_stage_id] || null : null,
    }))

    return NextResponse.json({ activities: enriched })
  } catch (error: any) {
    console.error('Get deal activity error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
