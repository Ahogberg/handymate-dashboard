import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getStageBySlug } from '@/lib/pipeline'

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
    } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Default stage to 'lead' if not provided
    const slug = stageSlug || 'lead'
    const stage = await getStageBySlug(business.business_id, slug)
    if (!stage) {
      return NextResponse.json({ error: `Stage '${slug}' not found` }, { status: 404 })
    }

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
