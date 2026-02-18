import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { ensureDefaultStages } from '@/lib/pipeline'

/**
 * GET - Hämta pipeline-steg för företaget
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stages = await ensureDefaultStages(business.business_id)
    const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order)

    return NextResponse.json({ stages: sorted })
  } catch (error: any) {
    console.error('Get pipeline stages error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa nytt steg
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { name, color, sort_order } = body

    if (!name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 })
    }

    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

    // Get current max sort_order (excluding lost which is 99)
    const { data: stages } = await supabase
      .from('pipeline_stage')
      .select('sort_order')
      .eq('business_id', business.business_id)
      .lt('sort_order', 99)
      .order('sort_order', { ascending: false })
      .limit(1)

    const maxOrder = stages?.[0]?.sort_order || 4
    const newOrder = sort_order || maxOrder + 1

    // If inserting before lost, shift won stage if needed
    const { data: stage, error } = await supabase
      .from('pipeline_stage')
      .insert({
        business_id: business.business_id,
        name,
        slug: slug + '_' + Date.now(),
        color: color || '#6366F1',
        sort_order: newOrder,
        is_system: false,
        is_won: false,
        is_lost: false,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ stage })
  } catch (error: any) {
    console.error('Create pipeline stage error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera steg (namn, färg, ordning)
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    // Bulk reorder
    if (body.stages && Array.isArray(body.stages)) {
      for (const s of body.stages) {
        await supabase
          .from('pipeline_stage')
          .update({ sort_order: s.sort_order, name: s.name, color: s.color })
          .eq('id', s.id)
          .eq('business_id', business.business_id)
      }
      return NextResponse.json({ success: true })
    }

    // Single stage update
    const { id, name, color } = body
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Check that the stage belongs to this business and is not a system stage for name changes
    const { data: existing } = await supabase
      .from('pipeline_stage')
      .select('*')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
    }

    if (existing.is_system && (existing.is_won || existing.is_lost)) {
      // Only allow color change for system stages (Vunnen/Förlorad)
      const updates: Record<string, any> = {}
      if (color) updates.color = color
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('pipeline_stage')
          .update(updates)
          .eq('id', id)
          .eq('business_id', business.business_id)
      }
      return NextResponse.json({ success: true })
    }

    const updates: Record<string, any> = {}
    if (name) updates.name = name
    if (color) updates.color = color

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('pipeline_stage')
        .update(updates)
        .eq('id', id)
        .eq('business_id', business.business_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Update pipeline stage error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort ett steg (flytta deals till fallback-steg)
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const stageId = request.nextUrl.searchParams.get('id')
    const moveToId = request.nextUrl.searchParams.get('moveTo')

    if (!stageId) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Check the stage
    const { data: stage } = await supabase
      .from('pipeline_stage')
      .select('*')
      .eq('id', stageId)
      .eq('business_id', business.business_id)
      .single()

    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
    }

    if (stage.is_won || stage.is_lost) {
      return NextResponse.json({ error: 'Kan inte ta bort Vunnen eller Förlorad' }, { status: 400 })
    }

    // Move deals from this stage to fallback
    const { count: dealCount } = await supabase
      .from('deal')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', stageId)

    if (dealCount && dealCount > 0) {
      // Find fallback stage: use moveTo param, or first non-system stage, or lead stage
      let fallbackId = moveToId

      if (!fallbackId) {
        const { data: firstStage } = await supabase
          .from('pipeline_stage')
          .select('id')
          .eq('business_id', business.business_id)
          .neq('id', stageId)
          .not('is_won', 'eq', true)
          .not('is_lost', 'eq', true)
          .order('sort_order')
          .limit(1)
          .single()

        fallbackId = firstStage?.id
      }

      if (!fallbackId) {
        return NextResponse.json({ error: 'Inget steg att flytta deals till' }, { status: 400 })
      }

      await supabase
        .from('deal')
        .update({ stage_id: fallbackId })
        .eq('stage_id', stageId)
    }

    // Delete the stage
    const { error } = await supabase
      .from('pipeline_stage')
      .delete()
      .eq('id', stageId)
      .eq('business_id', business.business_id)

    if (error) throw error
    return NextResponse.json({ success: true, movedDeals: dealCount || 0 })
  } catch (error: any) {
    console.error('Delete pipeline stage error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
