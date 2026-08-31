import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


/**
 * GET /api/projects/[id]/canvas — Bakåtkompatibel, läser från canvas_items
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params
    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('canvas_items')
      .select('*')
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
      .eq('business_id', business.business_id)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    if (!data) {
      return NextResponse.json({
        canvas: {
          project_id: projectId,
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
 * PUT /api/projects/[id]/canvas — Bakåtkompatibel, skriver till canvas_items
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params
    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.canvas_data) {
      return NextResponse.json({ error: 'canvas_data krävs' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('canvas_items')
      .select('id')
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
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
          project_id: projectId,
          entity_type: 'project',
          entity_id: projectId,
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
