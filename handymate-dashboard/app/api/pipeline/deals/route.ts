import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getStageBySlug } from '@/lib/pipeline'

/**
 * GET - Lista deals för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const stageId = request.nextUrl.searchParams.get('stageId')
    const customerId = request.nextUrl.searchParams.get('customerId')

    let query = supabase
      .from('deal')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (stageId) {
      query = query.eq('stage_id', stageId)
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: deals, error } = await query

    if (error) throw error

    return NextResponse.json({ deals: deals || [] })
  } catch (error: any) {
    console.error('Get deals error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa en ny deal manuellt
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const {
      title,
      customerId,
      value,
      stageSlug,
      description,
      priority,
      job_type,
    } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Default stage to first pipeline stage
    const slug = stageSlug || 'new_inquiry'
    let stage = await getStageBySlug(business.business_id, slug)
    // Fallback: hämta första steget om slug inte matchar
    if (!stage) {
      const supabaseStage = getServerSupabase()
      const { data: firstStage } = await supabaseStage
        .from('pipeline_stage')
        .select('*')
        .eq('business_id', business.business_id)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single()
      stage = firstStage
    }
    if (!stage) {
      return NextResponse.json({ error: 'Inga pipeline-steg hittades' }, { status: 404 })
    }

    // Get next deal number for this business
    const { data: maxDeal } = await supabase
      .from('deal')
      .select('deal_number')
      .eq('business_id', business.business_id)
      .not('deal_number', 'is', null)
      .order('deal_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextNumber = (maxDeal?.deal_number || 1000) + 1

    // Insert deal
    const { data: deal, error: insertError } = await supabase
      .from('deal')
      .insert({
        business_id: business.business_id,
        title,
        customer_id: customerId || null,
        value: value || null,
        stage_id: stage.id,
        description: description || null,
        priority: priority || 'medium',
        source: 'manual',
        deal_number: nextNumber,
        job_type: job_type || null,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Log pipeline activity
    await supabase.from('pipeline_activity').insert({
      business_id: business.business_id,
      deal_id: deal.id,
      activity_type: 'deal_created',
      description: `Deal "${title}" skapad manuellt`,
      to_stage_id: stage.id,
      triggered_by: 'user',
    })

    return NextResponse.json({ deal })
  } catch (error: any) {
    console.error('Create deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
