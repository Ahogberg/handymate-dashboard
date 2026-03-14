import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/canvas?entityType=project&entityId=xxx
 * Hämta canvas-data för valfri entity (project, lead, standalone)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const entityType = request.nextUrl.searchParams.get('entityType')
    const entityId = request.nextUrl.searchParams.get('entityId')

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType och entityId krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('canvas_items')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('business_id', business.business_id)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    // Return empty canvas if none exists
    if (!data) {
      return NextResponse.json({
        canvas: {
          entity_type: entityType,
          entity_id: entityId,
          canvas_data: { objects: [], background: '#ffffff' },
        },
      })
    }

    return NextResponse.json({ canvas: data })
  } catch (error: any) {
    console.error('GET canvas error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/canvas?entityType=project&entityId=xxx
 * Spara canvas-data (upsert)
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const entityType = request.nextUrl.searchParams.get('entityType')
    const entityId = request.nextUrl.searchParams.get('entityId')

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType och entityId krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.canvas_data) {
      return NextResponse.json({ error: 'canvas_data krävs' }, { status: 400 })
    }

    // Upsert — create or update
    const { data: existing } = await supabase
      .from('canvas_items')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('business_id', business.business_id)
      .single()

    let data
    if (existing) {
      const { data: updated, error } = await supabase
        .from('canvas_items')
        .update({
          canvas_data: body.canvas_data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      data = updated
    } else {
      const { data: created, error } = await supabase
        .from('canvas_items')
        .insert({
          business_id: business.business_id,
          project_id: entityType === 'project' ? entityId : null,
          entity_type: entityType,
          entity_id: entityId,
          canvas_data: body.canvas_data,
        })
        .select()
        .single()
      if (error) throw error
      data = created
    }

    return NextResponse.json({ canvas: data })
  } catch (error: any) {
    console.error('PUT canvas error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
