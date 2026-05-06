import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { moveDeal } from '@/lib/pipeline'

/**
 * POST - Flytta deal till nytt steg
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { toStageSlug } = body
    const { id } = params

    if (!toStageSlug) {
      return NextResponse.json({ error: 'toStageSlug is required' }, { status: 400 })
    }

    // Verify deal belongs to business + get current stage
    const { data: existing } = await supabase
      .from('deal')
      .select('id, stage_id')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    // Get current stage slug — används för automation-handlern nedan
    const { data: currentStage } = await supabase
      .from('pipeline_stage')
      .select('slug')
      .eq('id', existing.stage_id)
      .single()

    // Tidigare hade vi en strikt isValidTransition-koll mot 6 hardcoded
    // PIPELINE_STAGES-slugs. Den blockerade drag-and-drop helt så fort
    // en deal eller stage hade en annan slug (custom stages från
    // stage-settings, eller legacy data). VALID_TRANSITIONS tillät redan
    // att varje aktivt steg går till alla andra — kontrollen var
    // redundant. Borttagen så drag-drop fungerar fritt mellan alla steg.

    // No-op om man droppar tillbaka i samma stage
    if (currentStage?.slug === toStageSlug) {
      return NextResponse.json({ success: true, noop: true })
    }

    // Validate lost_reason if moving to lost
    if (toStageSlug === 'lost' && !body.lost_reason) {
      return NextResponse.json({ error: 'Ange en anledning (lost_reason)' }, { status: 400 })
    }

    // Update lost_reason if provided
    if (body.lost_reason) {
      await supabase.from('deal').update({ lost_reason: body.lost_reason }).eq('id', id)
    }

    await moveDeal({
      dealId: id,
      businessId: business.business_id,
      toStageSlug,
      triggeredBy: 'user',
    })

    // Trigger automation handlers (non-blocking)
    try {
      const { onDealStageChanged } = await import('@/lib/pipeline/automations')
      await onDealStageChanged(id, toStageSlug, currentStage?.slug || 'new_inquiry', business.business_id)
    } catch (err) {
      console.error('[Pipeline] Automation error (non-blocking):', err)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Move deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
